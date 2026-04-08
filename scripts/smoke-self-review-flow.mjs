import { Client, Databases, ID, Query, Users } from "node-appwrite";

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.NEXT_PUBLIC_DATABASE_ID;
const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3000";

const collectionIds = {
  users: process.env.NEXT_PUBLIC_USERS_COLLECTION_ID || "users",
  goals: process.env.NEXT_PUBLIC_GOALS_COLLECTION_ID || "goals",
  checkIns: process.env.NEXT_PUBLIC_CHECK_INS_COLLECTION_ID || "check_ins",
  goalCycles: process.env.NEXT_PUBLIC_GOAL_CYCLES_COLLECTION_ID || "goal_cycles",
  goalSelfReviews:
    process.env.NEXT_PUBLIC_GOAL_SELF_REVIEWS_COLLECTION_ID || "goal_self_reviews",
};

function assertEnv() {
  const missing = [];
  if (!endpoint) missing.push("NEXT_PUBLIC_APPWRITE_ENDPOINT");
  if (!projectId) missing.push("NEXT_PUBLIC_APPWRITE_PROJECT_ID");
  if (!databaseId) missing.push("NEXT_PUBLIC_DATABASE_ID");
  if (!apiKey) missing.push("APPWRITE_API_KEY");

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

function adminClients() {
  assertEnv();
  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  return {
    databases: new Databases(client),
    users: new Users(client),
  };
}

function normalize(value) {
  return String(value || "").trim();
}

function toResult(name, pass, details) {
  return { name, pass, details };
}

function isUnknownAttributeError(error) {
  return String(error?.message || "").toLowerCase().includes("unknown attribute");
}

function isMissingRequiredAttributeError(error, attribute) {
  const message = String(error?.message || "").toLowerCase();
  const normalizedAttribute = normalize(attribute).toLowerCase();
  return (
    Boolean(normalizedAttribute) &&
    message.includes("missing required attribute") &&
    message.includes(normalizedAttribute)
  );
}

async function createGoalCompat(databases, payload) {
  const mutablePayload = {
    ...payload,
    progressPercent: 0,
    processPercent: 0,
  };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await databases.createDocument(
        databaseId,
        collectionIds.goals,
        ID.unique(),
        mutablePayload
      );
    } catch (error) {
      if (isUnknownAttributeError(error)) {
        if (Object.prototype.hasOwnProperty.call(mutablePayload, "processPercent")) {
          delete mutablePayload.processPercent;
          continue;
        }

        if (Object.prototype.hasOwnProperty.call(mutablePayload, "progressPercent")) {
          delete mutablePayload.progressPercent;
          continue;
        }
      }

      if (
        isMissingRequiredAttributeError(error, "processPercent") &&
        !Object.prototype.hasOwnProperty.call(mutablePayload, "processPercent")
      ) {
        mutablePayload.processPercent = 0;
        continue;
      }

      if (
        isMissingRequiredAttributeError(error, "progressPercent") &&
        !Object.prototype.hasOwnProperty.call(mutablePayload, "progressPercent")
      ) {
        mutablePayload.progressPercent = 0;
        continue;
      }

      throw error;
    }
  }

  throw new Error("Unable to create temporary goal for self-review smoke flow.");
}

async function deleteDocumentSafe(databases, collectionId, documentId) {
  if (!documentId) return;

  try {
    await databases.deleteDocument(databaseId, collectionId, documentId);
  } catch {
    // Ignore cleanup errors.
  }
}

function hasRequiredBasedOn(payload) {
  const basedOn = Array.isArray(payload?.based_on)
    ? payload.based_on.map((item) => normalize(item).toLowerCase())
    : [];

  return (
    basedOn.includes("self_review") &&
    basedOn.includes("check_ins") &&
    basedOn.includes("progress")
  );
}

async function main() {
  const { databases, users } = adminClients();

  const usersResult = await databases.listDocuments(databaseId, collectionIds.users, [
    Query.limit(300),
  ]);
  const profiles = usersResult.documents || [];

  const profileById = new Map(profiles.map((item) => [item.$id, item]));
  const employee = profiles.find((item) => normalize(item.role).toLowerCase() === "employee");

  if (!employee) {
    throw new Error("No employee profile found in users collection.");
  }

  const managerId = normalize(employee.managerId);
  const manager = profileById.get(managerId) || profiles.find((item) => normalize(item.role).toLowerCase() === "manager");

  if (!manager) {
    throw new Error("No manager profile available for self-review smoke flow.");
  }

  const sessionCache = new Map();
  async function sessionForUser(userId) {
    if (sessionCache.has(userId)) return sessionCache.get(userId);
    const session = await users.createSession(userId);
    const token = session.secret || session.$id;
    if (!token) {
      throw new Error(`No usable session token generated for user ${userId}`);
    }
    sessionCache.set(userId, token);
    return token;
  }

  async function apiCall({ name, path, userId, method = "GET", body, expectedStatus, expectedStatuses }) {
    const sessionToken = await sessionForUser(userId);
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        cookie: `a_session_${projectId}=${encodeURIComponent(sessionToken)}`,
      },
      ...(typeof body === "undefined" ? {} : { body: JSON.stringify(body) }),
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const validStatuses = Array.isArray(expectedStatuses) && expectedStatuses.length > 0
      ? expectedStatuses
      : [expectedStatus];

    const pass = validStatuses.includes(response.status);

    return toResult(name, pass, {
      status: response.status,
      expected: validStatuses,
      path,
      error: payload?.error || null,
      payload,
    });
  }

  const createdIds = {
    cycleIds: [],
    goalIds: [],
    checkInIds: [],
  };

  const now = Date.now();
  const noGoalsCycleId = `SR-NO-GOALS-${now}`;
  const activeCycleId = `SR-FLOW-${now}`;

  const noGoalsCycle = await databases.createDocument(databaseId, collectionIds.goalCycles, ID.unique(), {
    name: noGoalsCycleId,
    periodType: "quarterly",
    startDate: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
    endDate: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
    state: "active",
    autoApprovalEnabled: false,
    autoApprovalDays: 7,
  });
  createdIds.cycleIds.push(noGoalsCycle.$id);

  const activeCycle = await databases.createDocument(databaseId, collectionIds.goalCycles, ID.unique(), {
    name: activeCycleId,
    periodType: "quarterly",
    startDate: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
    endDate: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
    state: "active",
    autoApprovalEnabled: false,
    autoApprovalDays: 7,
  });
  createdIds.cycleIds.push(activeCycle.$id);

  const goal = await createGoalCompat(databases, {
    employeeId: employee.$id,
    managerId: manager.$id,
    cycleId: activeCycleId,
    frameworkType: "OKR",
    title: `Self Review Smoke ${now}`,
    description: "Temporary goal for self-review smoke flow",
    weightage: 100,
    status: "approved",
    dueDate: new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString(),
    lineageRef: "",
    aiSuggested: false,
  });
  createdIds.goalIds.push(goal.$id);

  const checkIn = await databases.createDocument(databaseId, collectionIds.checkIns, ID.unique(), {
    goalId: goal.$id,
    employeeId: employee.$id,
    managerId: manager.$id,
    scheduledAt: new Date(now + 60 * 60 * 1000).toISOString(),
    status: "planned",
    employeeNotes: "Smoke check-in",
    managerNotes: "",
    transcriptText: "",
    isFinalCheckIn: true,
  });
  createdIds.checkInIds.push(checkIn.$id);

  const results = [];

  results.push(
    await apiCall({
      name: "Unauthorized self-review save (manager blocked)",
      path: "/api/self-review/save",
      method: "POST",
      userId: manager.$id,
      body: {
        cycleId: activeCycleId,
        goalId: goal.$id,
        selfComment: "Manager should not edit",
      },
      expectedStatus: 403,
    })
  );

  results.push(
    await apiCall({
      name: "No goals assigned on submit",
      path: "/api/self-review/submit",
      method: "POST",
      userId: employee.$id,
      body: { cycleId: noGoalsCycleId },
      expectedStatus: 400,
    })
  );

  results.push(
    await apiCall({
      name: "Save rejects all-empty fields",
      path: "/api/self-review/save",
      method: "POST",
      userId: employee.$id,
      body: {
        cycleId: activeCycleId,
        goalId: goal.$id,
        selfComment: "   ",
        achievements: "   ",
        challenges: "   ",
      },
      expectedStatus: 400,
    })
  );

  results.push(
    await apiCall({
      name: "Partial self-review save (draft)",
      path: "/api/self-review/save",
      method: "POST",
      userId: employee.$id,
      body: {
        cycleId: activeCycleId,
        goalId: goal.$id,
        achievements: "Completed milestone A",
      },
      expectedStatus: 200,
    })
  );

  results.push(
    await apiCall({
      name: "Partial self-review submit blocked",
      path: "/api/self-review/submit",
      method: "POST",
      userId: employee.$id,
      body: { cycleId: activeCycleId },
      expectedStatus: 400,
    })
  );

  results.push(
    await apiCall({
      name: "Rating flow blocked before self-review submit",
      path: `/api/check-ins/${checkIn.$id}`,
      method: "PATCH",
      userId: manager.$id,
      body: {
        status: "completed",
        isFinalCheckIn: true,
        managerRating: 4,
        managerGoalRatingLabel: "DE",
        managerNotes: "Premature rating attempt",
      },
      expectedStatus: 400,
    })
  );

  results.push(
    await apiCall({
      name: "Employee full self-review save",
      path: "/api/self-review/save",
      method: "POST",
      userId: employee.$id,
      body: {
        cycleId: activeCycleId,
        goalId: goal.$id,
        selfComment: "Completed key outcomes with one delay.",
        achievements: "Delivered core milestones and improved quality.",
        challenges: "Dependency delay from external team.",
        selfRating: 4,
      },
      expectedStatus: 200,
    })
  );

  const submitSuccess = await apiCall({
    name: "Employee self-review submit success",
    path: "/api/self-review/submit",
    method: "POST",
    userId: employee.$id,
    body: { cycleId: activeCycleId },
    expectedStatus: 200,
  });
  results.push(submitSuccess);

  results.push(
    await apiCall({
      name: "Duplicate self-review submit blocked",
      path: "/api/self-review/submit",
      method: "POST",
      userId: employee.$id,
      body: { cycleId: activeCycleId },
      expectedStatus: 409,
    })
  );

  results.push(
    await apiCall({
      name: "Rating flow proceeds after self-review submit",
      path: `/api/check-ins/${checkIn.$id}`,
      method: "PATCH",
      userId: manager.$id,
      body: {
        status: "completed",
        isFinalCheckIn: true,
        managerRating: 4,
        managerGoalRatingLabel: "DE",
        managerNotes: "Rating after self-review submission",
      },
      expectedStatus: 200,
    })
  );

  const managerVisibility = await apiCall({
    name: "Manager visibility includes employee self-review",
    path: `/api/check-ins?scope=team&employeeId=${encodeURIComponent(employee.$id)}`,
    method: "GET",
    userId: manager.$id,
    expectedStatus: 200,
  });

  if (managerVisibility.pass) {
    const data = Array.isArray(managerVisibility.details.payload?.data)
      ? managerVisibility.details.payload.data
      : [];
    const target = data.find((item) => normalize(item.$id) === normalize(checkIn.$id));
    const status = normalize(target?.employeeSelfReview?.status).toLowerCase();
    managerVisibility.pass = Boolean(target) && status === "submitted";
    managerVisibility.details.selfReviewStatus = status || null;
  }
  results.push(managerVisibility);

  const aiSummary = await apiCall({
    name: "AI summary consistency with self-review context",
    path: "/api/ai/checkin-summary",
    method: "POST",
    userId: manager.$id,
    body: {
      cycleId: activeCycleId,
      notes: "Reviewed outcomes and aligned on next milestone.",
      goalTitle: goal.title,
      goalId: goal.$id,
      employeeId: employee.$id,
    },
    expectedStatus: 200,
  });

  if (aiSummary.pass) {
    const explainability = aiSummary.details.payload?.data?.explainability || aiSummary.details.payload?.explainability;
    aiSummary.pass = hasRequiredBasedOn(explainability);
    aiSummary.details.basedOn = explainability?.based_on || null;
  }
  results.push(aiSummary);

  const aiIntel = await apiCall({
    name: "AI intelligence consistency with self-review context",
    path: "/api/ai/checkin-intelligence",
    method: "POST",
    userId: manager.$id,
    body: {
      cycleId: activeCycleId,
      notes: "Progress and blockers discussed with employee.",
      goalTitle: goal.title,
      goalId: goal.$id,
      employeeId: employee.$id,
    },
    expectedStatus: 200,
  });

  if (aiIntel.pass) {
    const explainability = aiIntel.details.payload?.data?.explainability;
    aiIntel.pass = hasRequiredBasedOn(explainability);
    aiIntel.details.basedOn = explainability?.based_on || null;
  }
  results.push(aiIntel);

  for (const result of results) {
    const marker = result.pass ? "PASS" : "FAIL";
    console.log(`[${marker}] ${result.name}`);
    if (!result.pass) {
      console.log(JSON.stringify(result.details, null, 2));
    }
  }

  const failed = results.filter((item) => !item.pass);

  const reviews = await databases
    .listDocuments(databaseId, collectionIds.goalSelfReviews, [
      Query.equal("employeeId", employee.$id),
      Query.equal("cycleId", activeCycleId),
      Query.limit(100),
    ])
    .catch(() => ({ documents: [] }));

  for (const review of reviews.documents || []) {
    await deleteDocumentSafe(databases, collectionIds.goalSelfReviews, review.$id);
  }

  for (const checkInId of createdIds.checkInIds) {
    await deleteDocumentSafe(databases, collectionIds.checkIns, checkInId);
  }

  for (const goalId of createdIds.goalIds) {
    await deleteDocumentSafe(databases, collectionIds.goals, goalId);
  }

  for (const cycleDocId of createdIds.cycleIds) {
    await deleteDocumentSafe(databases, collectionIds.goalCycles, cycleDocId);
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Self-review smoke test failed:", error?.message || error);
  process.exitCode = 1;
});

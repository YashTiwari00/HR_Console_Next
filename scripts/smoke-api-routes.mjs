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
  calibrationSessions:
    process.env.NEXT_PUBLIC_CALIBRATION_SESSIONS_COLLECTION_ID || "calibration_sessions",
  calibrationDecisions:
    process.env.NEXT_PUBLIC_CALIBRATION_DECISIONS_COLLECTION_ID || "calibration_decisions",
  matrixReviewerAssignments:
    process.env.NEXT_PUBLIC_MATRIX_REVIEWER_ASSIGNMENTS_COLLECTION_ID || "matrix_reviewer_assignments",
  matrixReviewerFeedback:
    process.env.NEXT_PUBLIC_MATRIX_REVIEWER_FEEDBACK_COLLECTION_ID || "matrix_reviewer_feedback",
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

async function listAllDocuments(databases, collectionId, queries = []) {
  const batchSize = 100;
  let offset = 0;
  const all = [];

  while (true) {
    const response = await databases.listDocuments(databaseId, collectionId, [
      ...queries,
      Query.limit(batchSize),
      Query.offset(offset),
    ]);

    all.push(...(response.documents || []));
    if ((response.documents || []).length < batchSize) {
      break;
    }

    offset += batchSize;
  }

  return all;
}

function seedEmail(index) {
  return `seed.employee.${String(index).padStart(2, "0")}@local.test`;
}

function managerEmail(index) {
  return `seed.manager.${String(index).padStart(2, "0")}@local.test`;
}

function toResult(name, pass, details) {
  return { name, pass, details };
}

function hasExplainabilityContract(explainability) {
  if (!explainability || typeof explainability !== "object") return false;

  const source = String(explainability.source || "").trim();
  const confidence = String(explainability.confidence || "").trim();
  const whyFactors = Array.isArray(explainability.whyFactors) ? explainability.whyFactors : [];
  const timeWindow = String(explainability.timeWindow || "").trim();

  return Boolean(source) && Boolean(confidence) && whyFactors.length > 0 && Boolean(timeWindow);
}

function isUnknownAttributeError(error) {
  return String(error?.message || "").toLowerCase().includes("unknown attribute");
}

function isMissingRequiredAttributeError(error, attribute) {
  const message = String(error?.message || "").toLowerCase();
  const normalizedAttribute = String(attribute || "").trim().toLowerCase();
  return Boolean(normalizedAttribute) && message.includes("missing required attribute") && message.includes(normalizedAttribute);
}

async function createDraftGoalDocumentCompat(databases, payload) {
  const mutablePayload = {
    ...payload,
    progressPercent: 0,
    processPercent: 0,
  };

  for (let attempt = 0; attempt < 6; attempt += 1) {
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

  throw new Error("Unable to create temporary draft goal for smoke tests.");
}

async function deleteDocumentSafe(databases, collectionId, documentId) {
  if (!documentId) return;
  try {
    await databases.deleteDocument(databaseId, collectionId, documentId);
  } catch {
    // Ignore cleanup errors.
  }
}

async function deleteCalibrationDecisionsBySession(databases, sessionId) {
  if (!sessionId) return;

  try {
    const decisions = await databases.listDocuments(databaseId, collectionIds.calibrationDecisions, [
      Query.equal("sessionId", sessionId),
      Query.limit(200),
    ]);

    for (const row of decisions.documents || []) {
      await deleteDocumentSafe(databases, collectionIds.calibrationDecisions, row.$id);
    }
  } catch {
    // Ignore cleanup errors.
  }
}

async function main() {
  const { databases, users } = adminClients();

  const userProfiles = await listAllDocuments(databases, collectionIds.users);
  const profileById = new Map(userProfiles.map((item) => [item.$id, item]));
  const profileByEmail = new Map(
    userProfiles.map((item) => [String(item.email || "").toLowerCase(), item])
  );

  const employeeA = profileByEmail.get(seedEmail(1));
  const employeeB = profileByEmail.get(seedEmail(2));
  const managerA = profileByEmail.get(managerEmail(1));
  const managerB = profileByEmail.get(managerEmail(2));
  const hr = profileByEmail.get("seed.hr.01@local.test");
  const regionAdmin = userProfiles.find((item) => String(item.role || "").trim() === "region-admin");
  const leadership = userProfiles.find((item) => String(item.role || "").trim() === "leadership");

  if (!employeeA || !employeeB || !managerA || !managerB || !hr) {
    throw new Error("Required seeded users are missing. Run seed first.");
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

  async function apiCall({ name, path, method = "GET", userId, body, expectedStatus, expectedStatuses }) {
    const sessionToken = await sessionForUser(userId);
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        cookie: `a_session_${projectId}=${encodeURIComponent(sessionToken)}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
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
    const details = {
      status: response.status,
      expectedStatus: validStatuses.length === 1 ? validStatuses[0] : validStatuses.join(" or "),
      path,
      error: payload?.error || null,
      dataCount: Array.isArray(payload?.data) ? payload.data.length : undefined,
    };

    return toResult(name, pass, details);
  }

  const cycles = await listAllDocuments(databases, collectionIds.goalCycles, [
    Query.equal("state", "active"),
    Query.limit(10),
  ]);
  const activeCycle = cycles[0];

  if (!activeCycle) {
    throw new Error("No active cycle found for AI smoke test.");
  }

  const goals = await listAllDocuments(databases, collectionIds.goals);

  let draftGoal = goals.find(
    (goal) => goal.status === "draft" && String(goal.title || "").includes("SEED-M26")
  );

  let createdDraftGoalId = null;
  let matrixAssignmentId = null;
  let matrixFeedbackId = null;

  if (!draftGoal) {
    const fallbackManagerId = String(employeeA.managerId || managerA.$id || "").trim();
    if (!fallbackManagerId) {
      throw new Error("Unable to resolve managerId for temporary smoke draft goal.");
    }

    draftGoal = await createDraftGoalDocumentCompat(databases, {
      employeeId: employeeA.$id,
      managerId: fallbackManagerId,
      cycleId: activeCycle.$id,
      frameworkType: "OKR",
      title: `SMOKE-SUBMIT-APPROVE-${Date.now()}`,
      description: "Temporary draft goal for submit/approve smoke flow.",
      weightage: 1,
      status: "draft",
      dueDate: null,
      lineageRef: "",
      aiSuggested: false,
    });

    createdDraftGoalId = draftGoal.$id;
  }

  const draftOwner = profileById.get(draftGoal.employeeId);
  const draftManager = profileById.get(draftGoal.managerId);

  if (!draftOwner || !draftManager) {
    throw new Error("Draft goal owner/manager profile not found.");
  }

  const managerAEmployeeTeam = userProfiles.find(
    (item) => item.role === "employee" && String(item.managerId || "").trim() === managerA.$id
  );
  const managerBEmployeeTeam = userProfiles.find(
    (item) => item.role === "employee" && String(item.managerId || "").trim() === managerB.$id
  );

  if (!managerAEmployeeTeam || !managerBEmployeeTeam) {
    throw new Error("Could not resolve team employees for manager-scope tests.");
  }

  const results = [];

  results.push(
    await apiCall({
      name: "Employee /api/me",
      path: "/api/me",
      userId: employeeA.$id,
      expectedStatus: 200,
    })
  );

  results.push(
    await apiCall({
      name: "Manager /api/me",
      path: "/api/me",
      userId: managerA.$id,
      expectedStatus: 200,
    })
  );

  results.push(
    await apiCall({
      name: "HR /api/me",
      path: "/api/me",
      userId: hr.$id,
      expectedStatus: 200,
    })
  );

  results.push(
    await apiCall({
      name: "Employee goals list",
      path: "/api/goals",
      userId: employeeA.$id,
      expectedStatus: 200,
    })
  );

  results.push(
    await apiCall({
      name: "Manager team goals",
      path: "/api/goals?scope=team",
      userId: managerA.$id,
      expectedStatus: 200,
    })
  );

  {
    const sessionToken = await sessionForUser(managerA.$id);
    const response = await fetch(`${baseUrl}/api/goals/import/template`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        cookie: `a_session_${projectId}=${encodeURIComponent(sessionToken)}`,
      },
    });
    const csv = await response.text();
    const pass = response.status === 200 && String(csv || "").includes("employeeId,title,description");

    results.push(
      toResult("Goals import template download", pass, {
        status: response.status,
        expectedStatus: 200,
      })
    );
  }

  {
    const invalidRows = [
      {
        employeeId: employeeA.$id,
        title: "",
        description: "",
        frameworkType: "OKR",
        weightage: 150,
        cycleId: activeCycle.$id,
      },
    ];

    const previewResponse = await apiCall({
      name: "Goals import preview invalid row",
      path: "/api/goals/import/preview",
      method: "POST",
      userId: employeeA.$id,
      expectedStatus: 200,
      body: {
        cycleId: activeCycle.$id,
        rows: invalidRows,
      },
    });

    results.push(previewResponse);

    const sessionToken = await sessionForUser(employeeA.$id);
    const response = await fetch(`${baseUrl}/api/goals/import/commit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-idempotency-key": `smoke-import-invalid-${Date.now()}`,
        cookie: `a_session_${projectId}=${encodeURIComponent(sessionToken)}`,
      },
      body: JSON.stringify({
        cycleId: activeCycle.$id,
        rows: invalidRows,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    const pass = response.status === 422 && String(payload?.status || "").trim() === "failed";

    results.push(
      toResult("Goals import commit invalid row", pass, {
        status: response.status,
        expectedStatus: 422,
      })
    );
  }

  results.push(
    await apiCall({
      name: "Manager forbidden foreign employee",
      path: `/api/goals?employeeId=${managerBEmployeeTeam.$id}`,
      userId: managerA.$id,
      expectedStatus: 403,
    })
  );

  results.push(
    await apiCall({
      name: "HR managers dashboard API",
      path: "/api/hr/managers",
      userId: hr.$id,
      expectedStatus: 200,
    })
  );

  results.push(
    await apiCall({
      name: "Submit draft goal",
      path: `/api/goals/${draftGoal.$id}/submit`,
      method: "POST",
      userId: draftOwner.$id,
      expectedStatus: 200,
    })
  );

  results.push(
    await apiCall({
      name: "Manager approve submitted goal",
      path: "/api/approvals",
      method: "POST",
      userId: draftManager.$id,
      expectedStatus: 200,
      body: {
        goalId: draftGoal.$id,
        decision: "approved",
        comments: "smoke approval",
      },
    })
  );

  const scheduledAt = new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString();

  results.push(
    await apiCall({
      name: "Employee single check-in create deprecated",
      path: "/api/check-ins",
      method: "POST",
      userId: draftOwner.$id,
      expectedStatus: 410,
      body: {
        goalId: draftGoal.$id,
        employeeId: draftOwner.$id,
        scheduledAt,
        status: "planned",
        employeeNotes: "deprecated single-create path should be blocked",
      },
    })
  );

  const bulkRows = [
    {
      goalId: draftGoal.$id,
      scheduledAt,
      employeeNotes: "smoke bulk check-in row",
      isFinalCheckIn: false,
      managerRating: null,
      attachmentFileIds: [],
    },
  ];

  results.push(
    await apiCall({
      name: "Check-ins import preview",
      path: "/api/check-ins/import/preview",
      method: "POST",
      userId: draftOwner.$id,
      expectedStatus: 200,
      body: { rows: bulkRows },
    })
  );

  let createdCheckInId = null;
  const bulkIdempotencyKey = `smoke-checkins-import-${Date.now()}`;

  {
    const sessionToken = await sessionForUser(draftOwner.$id);
    const response = await fetch(`${baseUrl}/api/check-ins/import/commit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-idempotency-key": bulkIdempotencyKey,
        cookie: `a_session_${projectId}=${encodeURIComponent(sessionToken)}`,
      },
      body: JSON.stringify({ rows: bulkRows, templateVersion: "checkin-v1" }),
    });

    const payload = await response.json().catch(() => ({}));
    const successRows = Number(payload?.summary?.successRows || 0);
    createdCheckInId = String(payload?.summary?.successes?.[0]?.checkInId || "").trim() || null;
    const pass = response.status === 200 && successRows >= 1 && Boolean(createdCheckInId);

    results.push(
      toResult("Check-ins import commit", pass, {
        status: response.status,
        expectedStatus: 200,
        successRows,
      })
    );
  }

  {
    const sessionToken = await sessionForUser(draftOwner.$id);
    const response = await fetch(`${baseUrl}/api/check-ins/import/commit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-idempotency-key": bulkIdempotencyKey,
        cookie: `a_session_${projectId}=${encodeURIComponent(sessionToken)}`,
      },
      body: JSON.stringify({ rows: bulkRows, templateVersion: "checkin-v1" }),
    });

    const payload = await response.json().catch(() => ({}));
    const replayed = Boolean(payload?.replayed);

    results.push(
      toResult("Check-ins import commit idempotent replay", response.status === 200 && replayed, {
        status: response.status,
        expectedStatus: 200,
        replayed,
      })
    );
  }

  if (createdCheckInId) {
    results.push(
      await apiCall({
        name: "Manager bulk approve check-in",
        path: "/api/check-ins/manager-approvals",
        method: "POST",
        userId: draftManager.$id,
        expectedStatus: 200,
        body: {
          items: [
            {
              checkInId: createdCheckInId,
              managerNotes: "smoke bulk approval",
              transcriptText: "smoke transcript",
              isFinalCheckIn: false,
            },
          ],
        },
      })
    );
  } else {
    results.push(toResult("Manager bulk approve check-in", false, { error: "No check-in created" }));
  }

  results.push(
    await apiCall({
      name: "Create progress update",
      path: "/api/progress-updates",
      method: "POST",
      userId: draftOwner.$id,
      expectedStatus: 201,
      body: {
        goalId: draftGoal.$id,
        percentComplete: 55,
        ragStatus: "on_track",
        updateText: "smoke progress update",
      },
    })
  );

  results.push(
    await apiCall({
      name: "AI goal suggestion",
      path: "/api/ai/goal-suggestion",
      method: "POST",
      userId: employeeB.$id,
      expectedStatuses: [200, 429],
      body: {
        cycleId: activeCycle.$id,
        frameworkType: "OKR",
        prompt: "smoke",
      },
    })
  );

  {
    const sessionToken = await sessionForUser(employeeB.$id);
    const response = await fetch(`${baseUrl}/api/ai/goal-suggestion`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `a_session_${projectId}=${encodeURIComponent(sessionToken)}`,
      },
      body: JSON.stringify({
        cycleId: activeCycle.$id,
        frameworkType: "OKR",
        prompt: "Create measurable execution goals",
      }),
    });
    const payload = await response.json().catch(() => ({}));
    const firstSuggestion = Array.isArray(payload?.data?.suggestions)
      ? payload.data.suggestions[0]
      : null;

    const pass = response.status === 429 || (
      response.status === 200 &&
      hasExplainabilityContract(payload?.data?.explainability) &&
      hasExplainabilityContract(firstSuggestion?.explainability)
    );

    results.push(
      toResult("AI goal suggestion explainability contract", pass, {
        status: response.status,
        expectedStatus: "200 with contract or 429",
      })
    );
  }

  results.push(
    await apiCall({
      name: "AI checkin summary",
      path: "/api/ai/checkin-summary",
      method: "POST",
      userId: employeeB.$id,
      expectedStatuses: [200, 429],
      body: {
        cycleId: activeCycle.$id,
        notes: "Work progressing. One blocker on dependency. Next action is partner sync.",
        goalTitle: "smoke goal",
      },
    })
  );

  {
    const sessionToken = await sessionForUser(employeeB.$id);
    const response = await fetch(`${baseUrl}/api/ai/checkin-summary`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `a_session_${projectId}=${encodeURIComponent(sessionToken)}`,
      },
      body: JSON.stringify({
        cycleId: activeCycle.$id,
        goalTitle: "Execution quality",
        notes: "Progress is steady with one dependency blocker and a clear next step.",
      }),
    });
    const payload = await response.json().catch(() => ({}));

    const pass = response.status === 429 || (
      response.status === 200 &&
      hasExplainabilityContract(payload?.data?.explainability)
    );

    results.push(
      toResult("AI checkin summary explainability contract", pass, {
        status: response.status,
        expectedStatus: "200 with contract or 429",
      })
    );
  }

  results.push(
    await apiCall({
      name: "AI checkin agenda",
      path: "/api/ai/checkin-agenda",
      method: "POST",
      userId: managerA.$id,
      expectedStatuses: [200, 429],
      body: {
        cycleId: activeCycle.$id,
        goalTitle: "Execution quality",
        employeeNotes: "Need support on dependency and milestone sequencing.",
      },
    })
  );

  results.push(
    await apiCall({
      name: "AI checkin intelligence",
      path: "/api/ai/checkin-intelligence",
      method: "POST",
      userId: managerA.$id,
      expectedStatuses: [200, 429],
      body: {
        cycleId: activeCycle.$id,
        goalTitle: "Execution quality",
        notes: "Progress is improving but one blocker remains. Next step is owner assignment and due date.",
        goalId: draftGoal.$id,
        employeeId: employeeA.$id,
      },
    })
  );

  {
    const assignmentResponse = await apiCall({
      name: "Matrix reviewer assignment create (Manager)",
      path: "/api/matrix-reviewers/assignments",
      method: "POST",
      userId: managerA.$id,
      expectedStatuses: [201, 409],
      body: {
        employeeId: employeeA.$id,
        reviewerId: employeeB.$id,
        cycleId: activeCycle.$id,
        goalId: draftGoal.$id,
        influenceWeight: 40,
        notes: "Smoke matrix assignment",
      },
    });

    results.push(assignmentResponse);

    if (assignmentResponse.pass) {
      try {
        const assignments = await databases.listDocuments(databaseId, collectionIds.matrixReviewerAssignments, [
          Query.equal("employeeId", employeeA.$id),
          Query.equal("reviewerId", employeeB.$id),
          Query.equal("cycleId", activeCycle.$id),
          Query.equal("goalId", draftGoal.$id),
          Query.limit(1),
        ]);
        matrixAssignmentId = assignments.documents[0]?.$id || null;
      } catch {
        matrixAssignmentId = null;
      }
    }
  }

  if (matrixAssignmentId) {
    const feedbackResponse = await apiCall({
      name: "Matrix reviewer feedback submit",
      path: "/api/matrix-reviewers/feedback",
      method: "POST",
      userId: employeeB.$id,
      expectedStatuses: [201, 409],
      body: {
        assignmentId: matrixAssignmentId,
        employeeId: employeeA.$id,
        cycleId: activeCycle.$id,
        goalId: draftGoal.$id,
        feedbackText: "Cross-team execution is strong with dependency follow-through needed.",
        suggestedRating: 4,
        confidence: "medium",
      },
    });

    results.push(feedbackResponse);

    if (feedbackResponse.pass) {
      try {
        const feedbackRows = await databases.listDocuments(databaseId, collectionIds.matrixReviewerFeedback, [
          Query.equal("assignmentId", matrixAssignmentId),
          Query.limit(1),
        ]);
        matrixFeedbackId = feedbackRows.documents[0]?.$id || null;
      } catch {
        matrixFeedbackId = null;
      }
    }

    results.push(
      await apiCall({
        name: "Matrix reviewer assignment list (Employee reviewer)",
        path: `/api/matrix-reviewers/assignments?reviewerId=${encodeURIComponent(employeeB.$id)}&cycleId=${encodeURIComponent(activeCycle.$id)}&goalId=${encodeURIComponent(draftGoal.$id)}`,
        method: "GET",
        userId: employeeB.$id,
        expectedStatus: 200,
      })
    );

    results.push(
      await apiCall({
        name: "Matrix reviewer feedback list (Manager)",
        path: `/api/matrix-reviewers/feedback?employeeId=${encodeURIComponent(employeeA.$id)}&cycleId=${encodeURIComponent(activeCycle.$id)}&goalId=${encodeURIComponent(draftGoal.$id)}`,
        method: "GET",
        userId: managerA.$id,
        expectedStatus: 200,
      })
    );

    results.push(
      await apiCall({
        name: "Matrix reviewer summary (Manager)",
        path: `/api/matrix-reviewers/summary?employeeId=${encodeURIComponent(employeeA.$id)}&cycleId=${encodeURIComponent(activeCycle.$id)}&goalId=${encodeURIComponent(draftGoal.$id)}`,
        method: "GET",
        userId: managerA.$id,
        expectedStatus: 200,
      })
    );
  } else {
    results.push(
      toResult("Matrix reviewer feedback submit", true, {
        skipped: true,
        reason: "No assignment ID available (matrix collections may be absent)",
      })
    );
  }

  results.push(
    await apiCall({
      name: "AI usage snapshot",
      path: `/api/ai/usage?cycleId=${encodeURIComponent(activeCycle.$id)}`,
      method: "GET",
      userId: managerA.$id,
      expectedStatus: 200,
    })
  );

  results.push(
    await apiCall({
      name: "HR AI governance overview",
      path: `/api/hr/ai-governance/overview?cycleId=${encodeURIComponent(activeCycle.$id)}`,
      method: "GET",
      userId: hr.$id,
      expectedStatus: 200,
    })
  );

  let calibrationSessionId = "";

  results.push(
    await apiCall({
      name: "Calibration sessions list (HR)",
      path: "/api/hr/calibration-sessions?limit=10",
      method: "GET",
      userId: hr.$id,
      expectedStatus: 200,
    })
  );

  {
    const sessionToken = await sessionForUser(hr.$id);
    const response = await fetch(`${baseUrl}/api/hr/calibration-sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `a_session_${projectId}=${encodeURIComponent(sessionToken)}`,
      },
      body: JSON.stringify({
        name: `Smoke Calibration ${Date.now()}`,
        cycleId: activeCycle.$id,
        status: "draft",
        scope: "engineering",
        notes: "Smoke session",
      }),
    });
    const payload = await response.json().catch(() => ({}));
    calibrationSessionId = String(payload?.data?.id || "").trim();

    results.push(
      toResult(
        "Calibration session create (HR)",
        response.status === 201 || response.status === 409,
        {
          status: response.status,
          expectedStatus: "201 or 409",
        }
      )
    );
  }

  if (calibrationSessionId) {
    results.push(
      await apiCall({
        name: "Calibration decision create (HR)",
        path: `/api/hr/calibration-sessions/${encodeURIComponent(calibrationSessionId)}/decisions`,
        method: "POST",
        userId: hr.$id,
        expectedStatus: 201,
        body: {
          employeeId: employeeA.$id,
          managerId: managerA.$id,
          previousRating: 3,
          proposedRating: 4,
          finalRating: 4,
          rationale: "Strong sustained quarter-over-quarter improvement.",
        },
      })
    );

    results.push(
      await apiCall({
        name: "Calibration decisions list (HR)",
        path: `/api/hr/calibration-sessions/${encodeURIComponent(calibrationSessionId)}/decisions`,
        method: "GET",
        userId: hr.$id,
        expectedStatus: 200,
      })
    );

    results.push(
      await apiCall({
        name: "Calibration timeline list (HR)",
        path: `/api/hr/calibration-sessions/${encodeURIComponent(calibrationSessionId)}/timeline`,
        method: "GET",
        userId: hr.$id,
        expectedStatus: 200,
      })
    );

    await deleteCalibrationDecisionsBySession(databases, calibrationSessionId);
    await deleteDocumentSafe(databases, collectionIds.calibrationSessions, calibrationSessionId);
  }

  results.push(
    await apiCall({
      name: "HR check-in approvals list",
      path: "/api/hr/checkin-approvals?status=all",
      userId: hr.$id,
      expectedStatus: 200,
    })
  );

  results.push(
    await apiCall({
      name: "Manager team-members API",
      path: "/api/team-members",
      userId: managerA.$id,
      expectedStatus: 200,
    })
  );

  results.push(
    await apiCall({
      name: "Manager goals feedback API",
      path: "/api/goals/feedback?scope=team",
      userId: draftManager.$id,
      expectedStatus: 200,
    })
  );

  if (regionAdmin?.$id && String(regionAdmin.region || "").trim()) {
    results.push(
      await apiCall({
        name: "Region admin overview API",
        path: "/api/region-admin/overview",
        userId: regionAdmin.$id,
        expectedStatus: 200,
      })
    );

    const regionOverviewCheck = await apiCall({
      name: "Region admin isolation check",
      path: "/api/region-admin/overview",
      userId: regionAdmin.$id,
      expectedStatus: 200,
    });

    if (regionOverviewCheck.pass) {
      const sessionToken = await sessionForUser(regionAdmin.$id);
      const response = await fetch(`${baseUrl}/api/region-admin/overview`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          cookie: `a_session_${projectId}=${encodeURIComponent(sessionToken)}`,
        },
      });
      const payload = await response.json().catch(() => ({}));
      const expectedRegion = String(payload?.data?.region || "").trim();
      const members = Array.isArray(payload?.data?.members) ? payload.data.members : [];
      const crossRegion = members.filter(
        (item) => String(item?.region || "").trim() && String(item?.region || "").trim() !== expectedRegion
      );

      results.push(
        toResult(
          "Region admin members are region-scoped",
          response.status === 200 && expectedRegion.length > 0 && crossRegion.length === 0,
          {
            status: response.status,
            expectedStatus: 200,
            expectedRegion,
            memberCount: members.length,
            crossRegionCount: crossRegion.length,
          }
        )
      );
    } else {
      results.push(regionOverviewCheck);
    }

    results.push(
      await apiCall({
        name: "HR blocked from region overview API",
        path: "/api/region-admin/overview",
        userId: hr.$id,
        expectedStatus: 403,
      })
    );
  } else {
    results.push(
      toResult("Region admin overview API", true, {
        skipped: true,
        reason: "No seeded region-admin profile with region found",
      })
    );
  }

  if (leadership?.$id) {
    results.push(
      await apiCall({
        name: "Leadership overview API",
        path: "/api/leadership/overview",
        userId: leadership.$id,
        expectedStatus: 200,
      })
    );

    results.push(
      await apiCall({
        name: "Manager blocked from leadership overview API",
        path: "/api/leadership/overview",
        userId: managerA.$id,
        expectedStatus: 403,
      })
    );
  } else {
    results.push(
      toResult("Leadership overview API", true, {
        skipped: true,
        reason: "No seeded leadership profile found",
      })
    );
  }

  results.push(
    await apiCall({
      name: "Notifications templates list",
      path: "/api/notifications/templates?limit=10",
      method: "GET",
      userId: employeeA.$id,
      expectedStatus: 200,
    })
  );

  results.push(
    await apiCall({
      name: "Notifications template create (HR)",
      path: "/api/notifications/templates",
      method: "POST",
      userId: hr.$id,
      expectedStatuses: [201, 409],
      body: {
        name: `Smoke Template ${Date.now()}`,
        triggerType: "manual",
        channel: "in_app",
        subject: "Smoke test notification",
        body: "Please review your pending actions.",
        suppressWindowMinutes: 10,
      },
    })
  );

  results.push(
    await apiCall({
      name: "Notifications job enqueue (HR)",
      path: "/api/notifications/jobs",
      method: "POST",
      userId: hr.$id,
      expectedStatuses: [201, 409],
      body: {
        userId: employeeA.$id,
        triggerType: "manual",
        channel: "in_app",
        dedupeKey: `smoke-${Date.now()}`,
        payload: {
          title: "Smoke notification",
          message: "Complete your pending workflow action.",
          actionUrl: "/employee/timeline",
        },
      },
    })
  );

  results.push(
    await apiCall({
      name: "Notifications feed read",
      path: "/api/notifications/feed?limit=10",
      method: "GET",
      userId: employeeA.$id,
      expectedStatus: 200,
    })
  );

  results.push(
    await apiCall({
      name: "Notifications scheduler run (HR)",
      path: "/api/notifications/scheduler",
      method: "POST",
      userId: hr.$id,
      expectedStatus: 200,
      body: { limit: 10 },
    })
  );

  const passed = results.filter((item) => item.pass).length;
  const failed = results.length - passed;

  console.log("\nAPI smoke test results:");
  for (const result of results) {
    const marker = result.pass ? "PASS" : "FAIL";
    console.log(`- [${marker}] ${result.name} :: ${JSON.stringify(result.details)}`);
  }

  console.log(`\nSummary: ${passed}/${results.length} passed, ${failed} failed.`);

  await deleteDocumentSafe(databases, collectionIds.goals, createdDraftGoalId);
  await deleteDocumentSafe(databases, collectionIds.checkIns, createdCheckInId);
  await deleteDocumentSafe(databases, collectionIds.matrixReviewerFeedback, matrixFeedbackId);
  await deleteDocumentSafe(databases, collectionIds.matrixReviewerAssignments, matrixAssignmentId);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Smoke API run failed:", error.message || error);
  process.exit(1);
});

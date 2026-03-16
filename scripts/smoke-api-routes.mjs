import { Client, Databases, Query, Users } from "node-appwrite";

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

  async function apiCall({ name, path, method = "GET", userId, body, expectedStatus }) {
    const sessionToken = await sessionForUser(userId);
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-appwrite-session": sessionToken,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const pass = response.status === expectedStatus;
    const details = {
      status: response.status,
      expectedStatus,
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

  const draftGoal = goals.find(
    (goal) => goal.status === "draft" && String(goal.title || "").includes("SEED-M26")
  );

  if (!draftGoal) {
    throw new Error("No draft seeded goal available for submit/approve smoke flow.");
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

  const createCheckIn = await apiCall({
    name: "Create check-in",
    path: "/api/check-ins",
    method: "POST",
    userId: draftOwner.$id,
    expectedStatus: 201,
    body: {
      goalId: draftGoal.$id,
      employeeId: draftOwner.$id,
      scheduledAt,
      status: "planned",
      employeeNotes: "smoke check-in",
    },
  });

  results.push(createCheckIn);

  let createdCheckInId = null;
  if (createCheckIn.pass) {
    const checkIns = await listAllDocuments(databases, collectionIds.checkIns, [
      Query.equal("goalId", draftGoal.$id),
      Query.equal("scheduledAt", scheduledAt),
      Query.limit(1),
    ]);
    createdCheckInId = checkIns[0]?.$id || null;
  }

  if (createdCheckInId) {
    results.push(
      await apiCall({
        name: "Manager complete check-in",
        path: `/api/check-ins/${createdCheckInId}`,
        method: "PATCH",
        userId: draftManager.$id,
        expectedStatus: 200,
        body: {
          status: "completed",
          managerNotes: "smoke complete",
          isFinalCheckIn: false,
        },
      })
    );
  } else {
    results.push(toResult("Manager complete check-in", false, { error: "No check-in created" }));
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
      expectedStatus: 200,
      body: {
        cycleId: activeCycle.$id,
        frameworkType: "OKR",
        prompt: "smoke",
      },
    })
  );

  results.push(
    await apiCall({
      name: "AI checkin summary",
      path: "/api/ai/checkin-summary",
      method: "POST",
      userId: employeeB.$id,
      expectedStatus: 200,
      body: {
        cycleId: activeCycle.$id,
        notes: "Work progressing. One blocker on dependency. Next action is partner sync.",
        goalTitle: "smoke goal",
      },
    })
  );

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

  const passed = results.filter((item) => item.pass).length;
  const failed = results.length - passed;

  console.log("\nAPI smoke test results:");
  for (const result of results) {
    const marker = result.pass ? "PASS" : "FAIL";
    console.log(`- [${marker}] ${result.name} :: ${JSON.stringify(result.details)}`);
  }

  console.log(`\nSummary: ${passed}/${results.length} passed, ${failed} failed.`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Smoke API run failed:", error.message || error);
  process.exit(1);
});

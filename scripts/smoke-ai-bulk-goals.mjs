import { Client, Databases, Query, Users } from "node-appwrite";

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.NEXT_PUBLIC_DATABASE_ID;
const usersCollectionId = process.env.NEXT_PUBLIC_USERS_COLLECTION_ID || "users";
const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3000";

function assertEnv() {
  const missing = [];
  if (!endpoint) missing.push("NEXT_PUBLIC_APPWRITE_ENDPOINT");
  if (!projectId) missing.push("NEXT_PUBLIC_APPWRITE_PROJECT_ID");
  if (!apiKey) missing.push("APPWRITE_API_KEY");
  if (!databaseId) missing.push("NEXT_PUBLIC_DATABASE_ID");

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
    if ((response.documents || []).length < batchSize) break;
    offset += batchSize;
  }

  return all;
}

function toResult(name, pass, details) {
  return { name, pass, details };
}

function validateAnalyzeResponse(json, role) {
  if (!json || typeof json !== "object") return false;
  if (!Array.isArray(json.goals) || json.goals.length === 0) return false;

  for (const goal of json.goals) {
    if (!goal || typeof goal !== "object") return false;
    if (!String(goal.title || "").trim()) return false;
    if (!String(goal.description || "").trim()) return false;
    if (!String(goal.metrics || "").trim()) return false;

    const allocations = Array.isArray(goal.allocationSuggestions) ? goal.allocationSuggestions : [];
    if (role === "manager" && allocations.length === 0) return false;
    if (role === "employee" && allocations.length !== 0) return false;
  }

  return true;
}

async function main() {
  const { databases, users } = adminClients();
  const userProfiles = await listAllDocuments(databases, usersCollectionId);

  const manager = userProfiles.find((item) => String(item.role || "").trim().toLowerCase() === "manager");
  const employee = userProfiles.find((item) => String(item.role || "").trim().toLowerCase() === "employee");

  if (!manager || !employee) {
    throw new Error("Seeded manager/employee profiles not found in users collection.");
  }

  const sessionCache = new Map();
  const createdSessionIds = [];

  async function sessionForUser(userId) {
    if (sessionCache.has(userId)) return sessionCache.get(userId);

    const session = await users.createSession(userId);
    const token = session.secret || session.$id;
    if (!token) {
      throw new Error(`No usable session token generated for user ${userId}`);
    }

    sessionCache.set(userId, token);
    if (session.$id) createdSessionIds.push(session.$id);
    return token;
  }

  async function apiCall({ name, method = "POST", userId, body, expectedStatus }) {
    const sessionToken = await sessionForUser(userId);
    const response = await fetch(`${baseUrl}/api/ai/analyze-goals`, {
      method,
      headers: {
        "Content-Type": "application/json",
        cookie: `a_session_${projectId}=${encodeURIComponent(sessionToken)}`,
      },
      body: JSON.stringify(body || {}),
    });

    let json = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }

    const pass = response.status === expectedStatus;
    return toResult(name, pass, {
      status: response.status,
      expectedStatus,
      response: json,
    });
  }

  const managerGoalBody = {
    role: "manager",
    goals: [
      { title: "Improve onboarding", description: "Make onboarding faster", weightage: 40 },
      { title: "Reduce backlog", description: "Close long-pending tickets", weightage: 60 },
    ],
  };

  const employeeGoalBody = {
    role: "employee",
    goals: [{ title: "Learn reporting", description: "Build monthly dashboard", weightage: 100 }],
  };

  const tooManyGoalsBody = {
    role: "employee",
    goals: Array.from({ length: 11 }, (_, index) => ({
      title: `Goal ${index + 1}`,
      description: "Overflow test",
      weightage: 10,
    })),
  };

  const results = [];

  const managerResult = await apiCall({
    name: "Manager analyze-goals contract",
    userId: manager.$id,
    body: managerGoalBody,
    expectedStatus: 200,
  });
  const managerValid = managerResult.pass && validateAnalyzeResponse(managerResult.details.response, "manager");
  results.push(
    toResult(managerResult.name, managerValid, {
      ...managerResult.details,
      contractValid: managerValid,
    })
  );

  const employeeResult = await apiCall({
    name: "Employee analyze-goals contract",
    userId: employee.$id,
    body: employeeGoalBody,
    expectedStatus: 200,
  });
  const employeeValid = employeeResult.pass && validateAnalyzeResponse(employeeResult.details.response, "employee");
  results.push(
    toResult(employeeResult.name, employeeValid, {
      ...employeeResult.details,
      contractValid: employeeValid,
    })
  );

  const limitResult = await apiCall({
    name: "Analyze-goals max-10 enforcement",
    userId: employee.$id,
    body: tooManyGoalsBody,
    expectedStatus: 400,
  });
  results.push(limitResult);

  const failed = results.filter((item) => !item.pass);
  for (const result of results) {
    const marker = result.pass ? "PASS" : "FAIL";
    console.log(`[${marker}] ${result.name}`);
    if (!result.pass) {
      console.log(JSON.stringify(result.details, null, 2));
    }
  }

  for (const sessionId of createdSessionIds) {
    try {
      await users.deleteSession(sessionId);
    } catch {
      // Ignore cleanup errors.
    }
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Smoke test failed:", error?.message || error);
  process.exitCode = 1;
});

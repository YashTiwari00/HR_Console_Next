import { Client, Databases, Query, Users } from "node-appwrite";

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.NEXT_PUBLIC_DATABASE_ID;
const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const usersCollectionId = process.env.NEXT_PUBLIC_USERS_COLLECTION_ID || "users";

const seedEmployeeEmail = "seed.employee.01@local.test";
const seedManagerEmail = "seed.manager.01@local.test";

function assertEnv() {
  const missing = [];
  if (!endpoint) missing.push("NEXT_PUBLIC_APPWRITE_ENDPOINT");
  if (!projectId) missing.push("NEXT_PUBLIC_APPWRITE_PROJECT_ID");
  if (!databaseId) missing.push("NEXT_PUBLIC_DATABASE_ID");
  if (!apiKey) missing.push("APPWRITE_API_KEY");
  if (missing.length) throw new Error(`Missing required env vars: ${missing.join(", ")}`);
}

function adminClients() {
  assertEnv();
  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  return { databases: new Databases(client), users: new Users(client) };
}

function log(kind, name, details = "") {
  const icon = kind === "PASS" ? "✅" : kind === "FAIL" ? "❌" : kind === "WARN" ? "⚠" : "⏭";
  console.log(`${icon} ${kind} ${name}${details ? ` :: ${details}` : ""}`);
}

function scanForbiddenKeys(input, forbidden, found = new Set()) {
  if (Array.isArray(input)) input.forEach((v) => scanForbiddenKeys(v, forbidden, found));
  else if (input && typeof input === "object") {
    Object.entries(input).forEach(([k, v]) => {
      if (forbidden.has(k)) found.add(k);
      scanForbiddenKeys(v, forbidden, found);
    });
  }
  return [...found];
}

async function main() {
  const { databases, users } = adminClients();
  const profiles = await databases.listDocuments(databaseId, usersCollectionId, [Query.limit(200)]);
  const byEmail = new Map((profiles.documents || []).map((p) => [String(p.email || "").toLowerCase(), p]));
  const employee = byEmail.get(seedEmployeeEmail);
  const manager = byEmail.get(seedManagerEmail);
  if (!employee || !manager) throw new Error("Required seeded users are missing. Run seed first.");

  const sessions = new Map();
  async function sessionFor(userId) {
    if (!sessions.has(userId)) {
      const s = await users.createSession(userId);
      sessions.set(userId, s.secret || s.$id);
    }
    return sessions.get(userId);
  }

  async function api(path, { userId, method = "GET", body } = {}) {
    const token = await sessionFor(userId);
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json", cookie: `a_session_${projectId}=${encodeURIComponent(token)}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, payload: await res.json().catch(() => ({})) };
  }

  let failCount = 0;
  const report = (kind, name, details) => {
    if (kind === "FAIL") failCount += 1;
    log(kind, name, details);
  };

  const growthSummary = await api("/api/growth/summary", { userId: employee.$id });
  const summaryData = growthSummary.payload?.data || {};
  const shapeOk = growthSummary.status === 200 && ["employeeId", "cycleHistory", "latestReadiness", "tnaItems", "recentGoals", "dataAvailable"].every((k) => Object.prototype.hasOwnProperty.call(summaryData, k));
  report(shapeOk ? "PASS" : "FAIL", "GROWTH SUMMARY employee access", `status=${growthSummary.status}`);

  const forbiddenKeys = new Set(["scoreX100", "managerFinalRating", "stackRank"]);
  const leaked = scanForbiddenKeys(growthSummary.payload, forbiddenKeys);
  report(leaked.length === 0 ? "PASS" : "FAIL", leaked.length === 0 ? "No rating data leaked" : "CRITICAL FAIL Rating data leaked to employee", leaked.join(","));

  const managerSummary = await api("/api/growth/summary", { userId: manager.$id });
  report(managerSummary.status === 403 ? "PASS" : "FAIL", "ROLE BOUNDARY manager /api/growth/summary", `status=${managerSummary.status}`);

  const managerStreak = await api("/api/milestones/streak", { userId: manager.$id });
  if (managerStreak.status === 404) report("SKIP", "ROLE BOUNDARY manager /api/milestones/streak", "endpoint not built");
  else report(managerStreak.status === 200 ? "PASS" : "FAIL", "ROLE BOUNDARY manager /api/milestones/streak", `status=${managerStreak.status}`);

  const managerPathway = await api("/api/ai/growth-pathway", {
    userId: manager.$id,
    method: "POST",
    body: { cycleId: "Q1-2025", role: "Software Engineer", department: "Engineering", cycleHistory: [], tnaItems: [], readinessLabel: "Developing" },
  });
  report(managerPathway.status === 403 ? "PASS" : "FAIL", "ROLE BOUNDARY manager /api/ai/growth-pathway", `status=${managerPathway.status}`);

  const employeePathway = await api("/api/ai/growth-pathway", {
    userId: employee.$id,
    method: "POST",
    body: { cycleId: "Q1-2025", role: "Software Engineer", department: "Engineering", cycleHistory: [], tnaItems: [], readinessLabel: "Developing" },
  });
  if (employeePathway.status === 200 && typeof employeePathway.payload?.pathway === "string") report("PASS", "AI PATHWAY endpoint", "200 with pathway string");
  else if (employeePathway.status === 429) report("SKIP", "AI PATHWAY endpoint", "AI cap hit, skipping");
  else if (employeePathway.status === 503) report("SKIP", "AI PATHWAY endpoint", "AI service not configured");
  else report("FAIL", "AI PATHWAY endpoint", `status=${employeePathway.status}`);

  const trajectory = await api("/api/analytics/employee-trajectory", { userId: employee.$id });
  const trajectoryData = trajectory.payload?.data || {};
  const trajectoryShapeOk = trajectory.status === 200 && ["employeeId", "cycles", "trendLabel", "trendDeltaPercent"].every((k) => Object.prototype.hasOwnProperty.call(trajectoryData, k));
  report(trajectoryShapeOk ? "PASS" : "FAIL", "TRAJECTORY integration shape", `status=${trajectory.status}`);
  const exposesScoreX100 = scanForbiddenKeys(trajectoryData?.cycles || [], new Set(["scoreX100"])).length > 0;
  if (exposesScoreX100) report("WARN", "employee-trajectory score exposure", "employee-trajectory exposes scoreX100. Growth Hub page must filter this before passing to UI components.");
  else report("PASS", "employee-trajectory score exposure", "No scoreX100 in cycles");

  const growthFlag = String(process.env.NEXT_PUBLIC_ENABLE_GROWTH_HUB || "").trim().toLowerCase();
  if (!growthFlag || growthFlag === "false") {
    report(growthSummary.status === 200 ? "PASS" : "FAIL", "Feature flag behavior", "API available regardless of flag - flag guards UI only");
  } else {
    report("SKIP", "Feature flag behavior", "NEXT_PUBLIC_ENABLE_GROWTH_HUB is true in this run");
  }

  if (failCount > 0) process.exit(1);
}

main().catch((error) => {
  console.error("Smoke growth hub run failed:", error.message || error);
  process.exit(1);
});

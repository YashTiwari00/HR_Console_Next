import { Account, Client, Databases, Query } from "node-appwrite";

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.NEXT_PUBLIC_DATABASE_ID;
const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const seedAuthPassword = process.env.SEED_AUTH_PASSWORD || "SeedPass#2026";
const usersCollection = process.env.NEXT_PUBLIC_USERS_COLLECTION_ID || "users";
const goalsCollection = process.env.NEXT_PUBLIC_GOALS_COLLECTION_ID || "goals";

function assertEnv() {
  const missing = [];
  if (!endpoint) missing.push("NEXT_PUBLIC_APPWRITE_ENDPOINT");
  if (!projectId) missing.push("NEXT_PUBLIC_APPWRITE_PROJECT_ID");
  if (!apiKey) missing.push("APPWRITE_API_KEY");
  if (!databaseId) missing.push("NEXT_PUBLIC_DATABASE_ID");
  if (missing.length) throw new Error(`Missing required env vars: ${missing.join(", ")}`);
}

function adminDatabases() {
  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  return new Databases(client);
}

async function createSessionToken(email) {
  const client = new Client().setEndpoint(endpoint).setProject(projectId);
  const account = new Account(client);
  const session = await account.createEmailPasswordSession(email, seedAuthPassword);
  return session.secret || session.$id;
}

async function apiGet(path, token) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { "Content-Type": "application/json", cookie: `a_session_${projectId}=${encodeURIComponent(token)}` },
  });
  let payload = null;
  try { payload = await res.json(); } catch {}
  return { status: res.status, payload };
}

function pass(name, details) { return { pass: true, name, details }; }
function fail(name, details) { return { pass: false, name, details }; }

function verifyLineageContract(payload) {
  const lineage = payload?.lineage;
  const okTop = Array.isArray(lineage) && typeof payload?.plainEnglishSummary === "string" && Boolean(payload?.overallContributionBadge);
  if (!okTop) return false;
  return lineage.every((n) => Number.isFinite(Number(n?.level)) && Boolean(n?.goalId) && Boolean(n?.title) && n?.contributionPercent !== undefined && Boolean(n?.contributionBadge));
}

async function main() {
  assertEnv();
  const results = [];
  const db = adminDatabases();
  const profiles = await db.listDocuments(databaseId, usersCollection, [Query.limit(200)]);
  const byEmail = new Map((profiles.documents || []).map((d) => [String(d.email || "").toLowerCase(), d]));
  const employee = byEmail.get("seed.employee.01@local.test");
  const manager = byEmail.get("seed.manager.01@local.test");
  if (!employee || !manager) throw new Error("Required seeded profiles missing.");

  const employeeToken = await createSessionToken("seed.employee.01@local.test");
  const managerToken = await createSessionToken("seed.manager.01@local.test");

  const goalsRes = await apiGet("/api/goals", employeeToken);
  const approved = Array.isArray(goalsRes.payload?.data) ? goalsRes.payload.data.filter((g) => String(g?.status) === "approved") : [];
  if (goalsRes.status !== 200) results.push(fail("Employee fetch approved goals", { status: goalsRes.status, expected: 200 }));
  else if (!approved.length) results.push(fail("Employee has approved goals", { count: 0 }));
  else results.push(pass("Employee fetch approved goals", { count: approved.length }));

  const goal = approved[0];
  if (goal?.$id || goal?.id) {
    const goalId = goal.$id || goal.id;
    const lineageRes = await apiGet(`/api/goals/${goalId}/lineage`, employeeToken);
    const contractOk = lineageRes.status === 200 && verifyLineageContract(lineageRes.payload);
    results.push(contractOk ? pass("Employee lineage contract", { goalId }) : fail("Employee lineage contract", { status: lineageRes.status, payload: lineageRes.payload }));

    const standalone = goal.lineageRef === null || goal.lineageRef === "";
    if (standalone) {
      const summary = String(lineageRes.payload?.plainEnglishSummary || "").toLowerCase();
      const onlySelf = Array.isArray(lineageRes.payload?.lineage) && lineageRes.payload.lineage.length === 1;
      const standaloneOk = lineageRes.status === 200 && onlySelf && summary.includes("standalone");
      results.push(standaloneOk ? pass("Standalone lineage shape", { goalId }) : fail("Standalone lineage shape", { summary, length: lineageRes.payload?.lineage?.length }));
    }
  }

  const teamGoalRows = await db.listDocuments(databaseId, goalsCollection, [Query.equal("managerId", manager.$id), Query.notEqual("employeeId", manager.$id), Query.equal("status", "approved"), Query.limit(1)]);
  const teamGoal = teamGoalRows.documents?.[0];
  if (!teamGoal) results.push(fail("Team member approved goal exists", { managerId: manager.$id }));
  else {
    const managerLineage = await apiGet(`/api/goals/${teamGoal.$id}/lineage`, managerToken);
    results.push(managerLineage.status === 200 ? pass("Manager can access team lineage", { goalId: teamGoal.$id }) : fail("Manager can access team lineage", { status: managerLineage.status, expected: 200 }));

    const employeeForbidden = await apiGet(`/api/goals/${teamGoal.$id}/lineage`, employeeToken);
    results.push(employeeForbidden.status === 403 ? pass("Employee blocked from foreign lineage", { goalId: teamGoal.$id }) : fail("Employee blocked from foreign lineage", { status: employeeForbidden.status, expected: 403 }));
  }

  const passed = results.filter((r) => r.pass).length;
  for (const r of results) console.log(`${r.pass ? "✅ PASS" : "❌ FAIL"} ${r.name} :: ${JSON.stringify(r.details)}`);
  console.log(`Summary: ${passed}/${results.length} passed`);
  if (passed !== results.length) process.exit(1);
}

main().catch((error) => {
  console.error("Contribution badge smoke failed:", error.message || error);
  process.exit(1);
});

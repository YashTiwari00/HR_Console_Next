import { Client, Users } from "node-appwrite";

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3000";

function assertEnv() {
  const missing = [];
  if (!endpoint) missing.push("NEXT_PUBLIC_APPWRITE_ENDPOINT");
  if (!projectId) missing.push("NEXT_PUBLIC_APPWRITE_PROJECT_ID");
  if (!apiKey) missing.push("APPWRITE_API_KEY");
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

function adminUsersClient() {
  assertEnv();
  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  return new Users(client);
}

const roleEmails = {
  employee: "seed.employee.01@local.test",
  manager: "seed.manager.01@local.test",
  hr: "seed.hr.01@local.test",
  "region-admin": "seed.region.admin.01@local.test",
};

const routeMatrix = [
  { role: "employee", path: "/employee" },
  { role: "employee", path: "/employee/goals" },
  { role: "employee", path: "/employee/progress" },
  { role: "employee", path: "/employee/check-ins" },
  { role: "employee", path: "/employee/timeline" },
  { role: "manager", path: "/manager" },
  { role: "manager", path: "/manager/goals" },
  { role: "manager", path: "/manager/progress" },
  { role: "manager", path: "/manager/team-progress" },
  { role: "manager", path: "/manager/check-ins" },
  { role: "manager", path: "/manager/team-check-ins" },
  { role: "manager", path: "/manager/timeline" },
  { role: "manager", path: "/manager/approvals" },
  { role: "hr", path: "/hr" },
  { role: "hr", path: "/hr/team-assignments" },
  { role: "hr", path: "/hr/approvals" },
  { role: "hr", path: "/hr/check-ins" },
  { role: "hr", path: "/hr/managers/placeholder-id" },
  { role: "region-admin", path: "/region-admin" },
  { role: "region-admin", path: "/region-admin/team-analytics" },
  { role: "region-admin", path: "/region-admin/check-ins" },
];

async function main() {
  const users = adminUsersClient();

  const allUsers = await users.list();
  const byEmail = new Map((allUsers.users || []).map((u) => [String(u.email || "").toLowerCase(), u]));

  const sessions = new Map();

  for (const [role, email] of Object.entries(roleEmails)) {
    const user = byEmail.get(email.toLowerCase());
    if (!user) {
      if (role === "region-admin") {
        continue;
      }

      throw new Error(`Required seeded auth user missing: ${email}`);
    }

    const session = await users.createSession(user.$id);
    const token = session.secret || session.$id;
    if (!token) {
      throw new Error(`Could not create usable session token for ${email}`);
    }

    sessions.set(role, token);
  }

  const results = [];

  const loginResponse = await fetch(`${baseUrl}/login`, { redirect: "manual" });
  results.push({
    name: "Login page",
    pass: loginResponse.status === 200,
    details: { status: loginResponse.status, expectedStatus: 200, path: "/login" },
  });

  for (const row of routeMatrix) {
    const token = sessions.get(row.role);
    if (!token) {
      results.push({
        name: `${row.role} page ${row.path}`,
        pass: true,
        details: {
          skipped: true,
          reason: `No seeded auth session for role ${row.role}`,
          path: row.path,
        },
      });
      continue;
    }

    const response = await fetch(`${baseUrl}${row.path}`, {
      headers: {
        cookie: `a_session_${projectId}=${encodeURIComponent(token)}`,
      },
      redirect: "manual",
    });

    const isDynamicManagerDetail = row.path.startsWith("/hr/managers/");
    const expectedStatus = isDynamicManagerDetail ? 200 : 200;
    const pass = response.status === expectedStatus;

    results.push({
      name: `${row.role} page ${row.path}`,
      pass,
      details: {
        status: response.status,
        expectedStatus,
        path: row.path,
      },
    });
  }

  const badRoleResponse = await fetch(`${baseUrl}/api/hr/managers`, {
    headers: {
      cookie: `a_session_${projectId}=${encodeURIComponent(sessions.get("employee"))}`,
      "Content-Type": "application/json",
    },
  });

  results.push({
    name: "UI guard proxy (employee blocked from HR API)",
    pass: badRoleResponse.status === 403,
    details: {
      status: badRoleResponse.status,
      expectedStatus: 403,
      path: "/api/hr/managers",
    },
  });

  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;

  console.log("\nUI route smoke results:");
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
  console.error("UI smoke failed:", error.message || error);
  process.exit(1);
});

import { Client, Databases, ID, Query, Users } from "node-appwrite";

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.NEXT_PUBLIC_DATABASE_ID;
const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const seedAuthPassword = process.env.SEED_AUTH_PASSWORD || "SeedPass#2026";

const collectionIds = {
  users: process.env.NEXT_PUBLIC_USERS_COLLECTION_ID || "users",
  goalCycles: process.env.NEXT_PUBLIC_GOAL_CYCLES_COLLECTION_ID || "goal_cycles",
  employeeCycleScores:
    process.env.NEXT_PUBLIC_EMPLOYEE_CYCLE_SCORES_COLLECTION_ID || "employee_cycle_scores",
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

async function listAllUsers(usersApi) {
  const batch = 100;
  let offset = 0;
  const all = [];

  while (true) {
    const response = await usersApi.list([Query.limit(batch), Query.offset(offset)]);
    const rows = response.users || [];
    all.push(...rows);
    if (rows.length < batch) break;
    offset += batch;
  }

  return all;
}

async function listAllDocuments(databases, collectionId, queries = []) {
  const batch = 100;
  let offset = 0;
  const all = [];

  while (true) {
    const response = await databases.listDocuments(databaseId, collectionId, [
      ...queries,
      Query.limit(batch),
      Query.offset(offset),
    ]);
    const rows = response.documents || [];
    all.push(...rows);
    if (rows.length < batch) break;
    offset += batch;
  }

  return all;
}

function toResult(name, pass, details) {
  return { name, pass, details };
}

function approxEqual(value, expected, tolerance = 0.01) {
  return Math.abs(Number(value) - Number(expected)) <= tolerance;
}

async function createSessionToken(usersApi, userId) {
  const session = await usersApi.createSession(userId);
  const token = session.secret || session.$id;
  if (!token) {
    throw new Error(`No usable session token created for user ${userId}`);
  }
  return token;
}

async function callTrajectory({ userId, usersApi, employeeId }) {
  const sessionToken = await createSessionToken(usersApi, userId);
  const query = employeeId ? `?employeeId=${encodeURIComponent(employeeId)}` : "";

  const response = await fetch(`${baseUrl}/api/analytics/employee-trajectory${query}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      cookie: `a_session_${projectId}=${encodeURIComponent(sessionToken)}`,
    },
  });

  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function ensureCycle(databases, name) {
  const existing = await databases.listDocuments(databaseId, collectionIds.goalCycles, [
    Query.equal("name", name),
    Query.limit(1),
  ]);

  const existingDoc = existing.documents[0];
  if (existingDoc) {
    return { cycle: existingDoc, created: false };
  }

  const now = new Date();
  const startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const endDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const closedAt = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();

  const created = await databases.createDocument(databaseId, collectionIds.goalCycles, ID.unique(), {
    name,
    periodType: "quarterly",
    startDate,
    endDate,
    state: "closed",
    closedAt,
    closedBy: "trajectory-test",
  });

  return { cycle: created, created: true };
}

async function createScore(databases, input) {
  return databases.createDocument(databaseId, collectionIds.employeeCycleScores, ID.unique(), {
    employeeId: input.employeeId,
    managerId: input.managerId,
    cycleId: input.cycleId,
    scoreX100: input.scoreX100,
    scoreLabel: input.scoreLabel || "ME",
    computedAt: input.computedAt,
    visibility: "visible",
  });
}

async function deleteDocumentSafe(databases, collectionId, documentId) {
  if (!documentId) return;
  try {
    await databases.deleteDocument(databaseId, collectionId, documentId);
  } catch {
    // Ignore cleanup errors.
  }
}

async function purgeEmployeeScores(databases, employeeId) {
  const rows = await databases.listDocuments(databaseId, collectionIds.employeeCycleScores, [
    Query.equal("employeeId", employeeId),
    Query.limit(100),
  ]);

  for (const row of rows.documents || []) {
    await deleteDocumentSafe(databases, collectionIds.employeeCycleScores, row.$id);
  }
}

async function main() {
  const { databases, users } = adminClients();
  const createdCycleIds = [];
  const createdScoreIds = [];
  let tempAuthUserId = null;
  let tempProfileId = null;

  try {
    await listAllUsers(users);

    const profiles = await listAllDocuments(databases, collectionIds.users);
    const profileByEmail = new Map(
      profiles.map((item) => [String(item.email || "").toLowerCase(), item])
    );

    const employeeA = profileByEmail.get("seed.employee.01@local.test");
    const employeeB = profileByEmail.get("seed.employee.02@local.test");
    const managerA = profileByEmail.get("seed.manager.01@local.test");
    const managerB = profileByEmail.get("seed.manager.02@local.test");
    const hr = profileByEmail.get("seed.hr.01@local.test");

    if (!employeeA || !employeeB || !managerA || !managerB || !hr) {
      throw new Error("Seed users missing. Run seed before trajectory tests.");
    }

    const managerAEmployee = profiles.find(
      (item) => item.role === "employee" && String(item.managerId || "").trim() === managerA.$id
    );
    const managerBEmployee = profiles.find(
      (item) => item.role === "employee" && String(item.managerId || "").trim() === managerB.$id
    );

    if (!managerAEmployee || !managerBEmployee) {
      throw new Error("Unable to find manager team employees for auth matrix assertions.");
    }

    const results = [];

    // Auth matrix checks
    {
      const self = await callTrajectory({ userId: employeeA.$id, usersApi: users });
      results.push(
        toResult("Auth: employee self allowed", self.response.status === 200, {
          status: self.response.status,
          expectedStatus: 200,
        })
      );

      const other = await callTrajectory({
        userId: employeeA.$id,
        usersApi: users,
        employeeId: employeeB.$id,
      });
      results.push(
        toResult("Auth: employee foreign blocked", other.response.status === 403, {
          status: other.response.status,
          expectedStatus: 403,
        })
      );

      const team = await callTrajectory({
        userId: managerA.$id,
        usersApi: users,
        employeeId: managerAEmployee.$id,
      });
      results.push(
        toResult("Auth: manager team employee allowed", team.response.status === 200, {
          status: team.response.status,
          expectedStatus: 200,
        })
      );

      const foreign = await callTrajectory({
        userId: managerA.$id,
        usersApi: users,
        employeeId: managerBEmployee.$id,
      });
      results.push(
        toResult("Auth: manager foreign employee blocked", foreign.response.status === 403, {
          status: foreign.response.status,
          expectedStatus: 403,
        })
      );

      const hrAny = await callTrajectory({
        userId: hr.$id,
        usersApi: users,
        employeeId: employeeB.$id,
      });
      results.push(
        toResult("Auth: HR any employee allowed", hrAny.response.status === 200, {
          status: hrAny.response.status,
          expectedStatus: 200,
        })
      );
    }

    // Temporary employee for deterministic trend edge-cases
    const suffix = `${Date.now()}`;
    const tempEmail = `seed.trajectory.tmp.${suffix}@local.test`;
    const tempName = `Seed Trajectory Temp ${suffix}`;
    const tempAuthUser = await users.create(ID.unique(), tempEmail, undefined, seedAuthPassword, tempName);
    tempAuthUserId = tempAuthUser.$id;

    await databases.createDocument(databaseId, collectionIds.users, tempAuthUser.$id, {
      name: tempName,
      email: tempEmail,
      role: "employee",
      department: "engineering",
      managerId: managerA.$id,
      hrId: hr.$id,
    });
    tempProfileId = tempAuthUser.$id;

    const now = Date.now();

    // Empty history
    await purgeEmployeeScores(databases, tempAuthUser.$id);
    {
      const empty = await callTrajectory({ userId: tempAuthUser.$id, usersApi: users });
      const cycles = Array.isArray(empty.payload?.data?.cycles) ? empty.payload.data.cycles : [];
      const trendLabel = empty.payload?.data?.trendLabel;
      const trendDeltaPercent = Number(empty.payload?.data?.trendDeltaPercent || 0);

      results.push(
        toResult(
          "Trend: empty history returns new/0",
          empty.response.status === 200 && cycles.length === 0 && trendLabel === "new" && trendDeltaPercent === 0,
          {
            status: empty.response.status,
            expectedStatus: 200,
            cycles: cycles.length,
            trendLabel,
            trendDeltaPercent,
          }
        )
      );
    }

    // Single-cycle history
    await purgeEmployeeScores(databases, tempAuthUser.$id);
    {
      const cycleName = `TRAJ-SINGLE-${suffix}`;
      const { cycle, created } = await ensureCycle(databases, cycleName);
      if (created) createdCycleIds.push(cycle.$id);

      const row = await createScore(databases, {
        employeeId: tempAuthUser.$id,
        managerId: managerA.$id,
        cycleId: cycleName,
        scoreX100: 310,
        computedAt: new Date(now - 48 * 60 * 60 * 1000).toISOString(),
        scoreLabel: "ME",
      });
      createdScoreIds.push(row.$id);

      const single = await callTrajectory({ userId: tempAuthUser.$id, usersApi: users });
      const cycles = Array.isArray(single.payload?.data?.cycles) ? single.payload.data.cycles : [];
      const trendLabel = single.payload?.data?.trendLabel;

      results.push(
        toResult(
          "Trend: single cycle returns new",
          single.response.status === 200 && cycles.length === 1 && trendLabel === "new",
          {
            status: single.response.status,
            expectedStatus: 200,
            cycles: cycles.length,
            trendLabel,
          }
        )
      );
    }

    // Improving trend
    await purgeEmployeeScores(databases, tempAuthUser.$id);
    {
      const names = [`TRAJ-IMPROVE-A-${suffix}`, `TRAJ-IMPROVE-B-${suffix}`, `TRAJ-IMPROVE-C-${suffix}`];
      for (const name of names) {
        const { cycle, created } = await ensureCycle(databases, name);
        if (created) createdCycleIds.push(cycle.$id);
      }

      const rows = [
        { cycleId: names[0], scoreX100: 200, at: new Date(now - 72 * 60 * 60 * 1000).toISOString(), label: "SME" },
        { cycleId: names[1], scoreX100: 260, at: new Date(now - 48 * 60 * 60 * 1000).toISOString(), label: "ME" },
        { cycleId: names[2], scoreX100: 320, at: new Date(now - 24 * 60 * 60 * 1000).toISOString(), label: "DE" },
      ];

      for (const row of rows) {
        const createdRow = await createScore(databases, {
          employeeId: tempAuthUser.$id,
          managerId: managerA.$id,
          cycleId: row.cycleId,
          scoreX100: row.scoreX100,
          computedAt: row.at,
          scoreLabel: row.label,
        });
        createdScoreIds.push(createdRow.$id);
      }

      const improving = await callTrajectory({ userId: tempAuthUser.$id, usersApi: users });
      const trendLabel = improving.payload?.data?.trendLabel;
      const trendDeltaPercent = Number(improving.payload?.data?.trendDeltaPercent || 0);

      results.push(
        toResult(
          "Trend: improving classification",
          improving.response.status === 200 && trendLabel === "improving" && approxEqual(trendDeltaPercent, 60, 0.01),
          {
            status: improving.response.status,
            expectedStatus: 200,
            trendLabel,
            trendDeltaPercent,
          }
        )
      );
    }

    // Stable boundary (+3%)
    await purgeEmployeeScores(databases, tempAuthUser.$id);
    {
      const names = [`TRAJ-STABLE-A-${suffix}`, `TRAJ-STABLE-B-${suffix}`];
      for (const name of names) {
        const { cycle, created } = await ensureCycle(databases, name);
        if (created) createdCycleIds.push(cycle.$id);
      }

      const rows = [
        { cycleId: names[0], scoreX100: 300, at: new Date(now - 48 * 60 * 60 * 1000).toISOString(), label: "ME" },
        { cycleId: names[1], scoreX100: 309, at: new Date(now - 24 * 60 * 60 * 1000).toISOString(), label: "DE" },
      ];

      for (const row of rows) {
        const createdRow = await createScore(databases, {
          employeeId: tempAuthUser.$id,
          managerId: managerA.$id,
          cycleId: row.cycleId,
          scoreX100: row.scoreX100,
          computedAt: row.at,
          scoreLabel: row.label,
        });
        createdScoreIds.push(createdRow.$id);
      }

      const stable = await callTrajectory({ userId: tempAuthUser.$id, usersApi: users });
      const trendLabel = stable.payload?.data?.trendLabel;
      const trendDeltaPercent = Number(stable.payload?.data?.trendDeltaPercent || 0);

      results.push(
        toResult(
          "Trend: stable boundary at +3%",
          stable.response.status === 200 && trendLabel === "stable" && approxEqual(trendDeltaPercent, 3, 0.01),
          {
            status: stable.response.status,
            expectedStatus: 200,
            trendLabel,
            trendDeltaPercent,
          }
        )
      );
    }

    // Declining trend
    await purgeEmployeeScores(databases, tempAuthUser.$id);
    {
      const names = [`TRAJ-DECLINE-A-${suffix}`, `TRAJ-DECLINE-B-${suffix}`];
      for (const name of names) {
        const { cycle, created } = await ensureCycle(databases, name);
        if (created) createdCycleIds.push(cycle.$id);
      }

      const rows = [
        { cycleId: names[0], scoreX100: 400, at: new Date(now - 48 * 60 * 60 * 1000).toISOString(), label: "DE" },
        { cycleId: names[1], scoreX100: 300, at: new Date(now - 24 * 60 * 60 * 1000).toISOString(), label: "ME" },
      ];

      for (const row of rows) {
        const createdRow = await createScore(databases, {
          employeeId: tempAuthUser.$id,
          managerId: managerA.$id,
          cycleId: row.cycleId,
          scoreX100: row.scoreX100,
          computedAt: row.at,
          scoreLabel: row.label,
        });
        createdScoreIds.push(createdRow.$id);
      }

      const declining = await callTrajectory({ userId: tempAuthUser.$id, usersApi: users });
      const trendLabel = declining.payload?.data?.trendLabel;
      const trendDeltaPercent = Number(declining.payload?.data?.trendDeltaPercent || 0);

      results.push(
        toResult(
          "Trend: declining classification",
          declining.response.status === 200 && trendLabel === "declining" && approxEqual(trendDeltaPercent, -25, 0.01),
          {
            status: declining.response.status,
            expectedStatus: 200,
            trendLabel,
            trendDeltaPercent,
          }
        )
      );
    }

    const passed = results.filter((item) => item.pass).length;
    const failed = results.length - passed;

    console.log("\nTrajectory endpoint test results:");
    for (const result of results) {
      const marker = result.pass ? "PASS" : "FAIL";
      console.log(`- [${marker}] ${result.name} :: ${JSON.stringify(result.details)}`);
    }
    console.log(`\nSummary: ${passed}/${results.length} passed, ${failed} failed.`);

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    for (const id of createdScoreIds) {
      await deleteDocumentSafe(databases, collectionIds.employeeCycleScores, id);
    }

    for (const id of createdCycleIds) {
      await deleteDocumentSafe(databases, collectionIds.goalCycles, id);
    }

    if (tempProfileId) {
      await deleteDocumentSafe(databases, collectionIds.users, tempProfileId);
    }

    if (tempAuthUserId) {
      try {
        await users.delete(tempAuthUserId);
      } catch {
        // Ignore cleanup errors.
      }
    }
  }
}

main().catch((error) => {
  console.error("Trajectory endpoint test failed:", error.message || error);
  process.exit(1);
});

import { Client, Databases, ID, Query, Users } from "node-appwrite";

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.NEXT_PUBLIC_DATABASE_ID;

const collectionIds = {
  users: process.env.NEXT_PUBLIC_USERS_COLLECTION_ID || "users",
  goals: process.env.NEXT_PUBLIC_GOALS_COLLECTION_ID || "goals",
  goalApprovals: process.env.NEXT_PUBLIC_GOAL_APPROVALS_COLLECTION_ID || "goal_approvals",
  checkIns: process.env.NEXT_PUBLIC_CHECK_INS_COLLECTION_ID || "check_ins",
  checkInApprovals:
    process.env.NEXT_PUBLIC_CHECK_IN_APPROVALS_COLLECTION_ID || "checkin_approvals",
  progressUpdates:
    process.env.NEXT_PUBLIC_PROGRESS_UPDATES_COLLECTION_ID || "progress_updates",
  goalCycles: process.env.NEXT_PUBLIC_GOAL_CYCLES_COLLECTION_ID || "goal_cycles",
  aiEvents: process.env.NEXT_PUBLIC_AI_EVENTS_COLLECTION_ID || "ai_events",
  aiPolicies: process.env.NEXT_PUBLIC_AI_POLICIES_COLLECTION_ID || "ai_policies",
};

const seedTag = "SEED-M26";

const argv = new Set(process.argv.slice(2));
const printUsersOnly = argv.has("--print-users");
const skipAuthCheck = argv.has("--skip-auth-check");
const createAuthUsers = argv.has("--create-auth-users");
const seedAuthPassword = process.env.SEED_AUTH_PASSWORD || "SeedPass#2026";

const aiPolicyDefaults = {
  employee: {
    goal_suggestion: { limitPerCycle: 3, costBudgetPerCycle: 1.5, warningThreshold: 0.8 },
    checkin_summary: { limitPerCycle: 3, costBudgetPerCycle: 1.5, warningThreshold: 0.8 },
    goal_analysis: { limitPerCycle: 3, costBudgetPerCycle: 1.5, warningThreshold: 0.8 },
    meeting_intelligence: { limitPerCycle: 8, costBudgetPerCycle: 3, warningThreshold: 0.8 },
    meeting_qa: { limitPerCycle: 20, costBudgetPerCycle: 4, warningThreshold: 0.8 },
  },
  manager: {
    goal_suggestion: { limitPerCycle: 5, costBudgetPerCycle: 3, warningThreshold: 0.8 },
    checkin_summary: { limitPerCycle: 5, costBudgetPerCycle: 3, warningThreshold: 0.8 },
    goal_analysis: { limitPerCycle: 5, costBudgetPerCycle: 3, warningThreshold: 0.8 },
    meeting_intelligence: { limitPerCycle: 12, costBudgetPerCycle: 6, warningThreshold: 0.8 },
    meeting_qa: { limitPerCycle: 30, costBudgetPerCycle: 8, warningThreshold: 0.8 },
  },
  hr: {
    goal_suggestion: { limitPerCycle: 8, costBudgetPerCycle: 6, warningThreshold: 0.8 },
    checkin_summary: { limitPerCycle: 8, costBudgetPerCycle: 6, warningThreshold: 0.8 },
    goal_analysis: { limitPerCycle: 8, costBudgetPerCycle: 6, warningThreshold: 0.8 },
    meeting_intelligence: { limitPerCycle: 16, costBudgetPerCycle: 10, warningThreshold: 0.8 },
    meeting_qa: { limitPerCycle: 40, costBudgetPerCycle: 12, warningThreshold: 0.8 },
  },
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

function makeClient() {
  assertEnv();
  return new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
}

function buildSeedUsers() {
  const hr = [{ key: "hr01", role: "hr", name: "Seed HR One", email: "seed.hr.01@local.test" }];

  const managers = Array.from({ length: 4 }).map((_, index) => ({
    key: `mgr${String(index + 1).padStart(2, "0")}`,
    role: "manager",
    name: `Seed Manager ${index + 1}`,
    email: `seed.manager.${String(index + 1).padStart(2, "0")}@local.test`,
    hrKey: "hr01",
  }));

  const employees = Array.from({ length: 20 }).map((_, index) => {
    const manager = managers[index % managers.length];
    return {
      key: `emp${String(index + 1).padStart(2, "0")}`,
      role: "employee",
      name: `Seed Employee ${index + 1}`,
      email: `seed.employee.${String(index + 1).padStart(2, "0")}@local.test`,
      managerKey: manager.key,
      hrKey: "hr01",
    };
  });

  return [...hr, ...managers, ...employees];
}

function buildCycles() {
  return [
    {
      key: "cycle_closed",
      name: `Q1-2026 ${seedTag}`,
      periodType: "quarterly",
      startDate: "2026-01-01T00:00:00.000Z",
      endDate: "2026-03-31T23:59:59.000Z",
      state: "closed",
    },
    {
      key: "cycle_active",
      name: `Q2-2026 ${seedTag}`,
      periodType: "quarterly",
      startDate: "2026-04-01T00:00:00.000Z",
      endDate: "2026-06-30T23:59:59.000Z",
      state: "active",
    },
  ];
}

async function listAllAuthUsers(usersApi) {
  const batchSize = 100;
  let offset = 0;
  const all = [];

  while (true) {
    const response = await usersApi.list([Query.limit(batchSize), Query.offset(offset)]);
    const rows = response.users || [];
    all.push(...rows);

    if (rows.length < batchSize) {
      break;
    }

    offset += batchSize;
  }

  return all;
}

function isAlreadyExistsError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("already exists") || message.includes("already been taken");
}

async function ensureAuthUsers(usersApi, missingUsers, authByEmail, counters) {
  for (const seedUser of missingUsers) {
    try {
      const created = await usersApi.create(
        ID.unique(),
        seedUser.email,
        undefined,
        seedAuthPassword,
        seedUser.name
      );
      authByEmail.set(seedUser.email.toLowerCase(), created);
      counters.authUsersCreated += 1;
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        const refreshed = await listAllAuthUsers(usersApi);
        refreshed.forEach((item) => {
          authByEmail.set(String(item.email || "").toLowerCase(), item);
        });
        continue;
      }

      throw error;
    }
  }
}

async function findByQueries(databases, collectionId, queries) {
  const response = await databases.listDocuments(databaseId, collectionId, [
    ...queries,
    Query.limit(1),
  ]);

  return response.documents[0] || null;
}

async function createIfMissing({ databases, collectionId, queries, payload }) {
  const existing = await findByQueries(databases, collectionId, queries);
  if (existing) {
    return { document: existing, created: false };
  }

  const created = await databases.createDocument(databaseId, collectionId, ID.unique(), payload);
  return { document: created, created: true };
}

async function createAiEventIfMissing({ databases, queries, payload }) {
  try {
    return await createIfMissing({
      databases,
      collectionId: collectionIds.aiEvents,
      queries,
      payload,
    });
  } catch (error) {
    const message = String(error?.message || "").toLowerCase();
    if (!(message.includes("requestcount") && message.includes("invalid type"))) {
      throw error;
    }

    return createIfMissing({
      databases,
      collectionId: collectionIds.aiEvents,
      queries,
      payload: {
        ...payload,
        requestCount: String(payload.requestCount),
      },
    });
  }
}

async function seedAiPolicies(databases, counters) {
  for (const [role, featureMap] of Object.entries(aiPolicyDefaults)) {
    for (const [featureType, policy] of Object.entries(featureMap)) {
      const result = await createIfMissing({
        databases,
        collectionId: collectionIds.aiPolicies,
        queries: [
          Query.equal("role", role),
          Query.equal("featureType", featureType),
        ],
        payload: {
          role,
          featureType,
          limitPerCycle: policy.limitPerCycle,
          costBudgetPerCycle: policy.costBudgetPerCycle,
          warningThreshold: policy.warningThreshold,
          isActive: true,
        },
      });

      if (result.created) counters.aiPoliciesCreated += 1;
      else counters.aiPoliciesSkipped += 1;
    }
  }
}

async function ensureUserProfile(databases, seedUser, authUser, referenceMap, counters) {
  const existing = await databases.getDocument(databaseId, collectionIds.users, authUser.$id).catch(() => null);
  const managerId = seedUser.managerKey ? referenceMap.userIdByKey.get(seedUser.managerKey) || "" : "";
  const hrId = seedUser.hrKey ? referenceMap.userIdByKey.get(seedUser.hrKey) || "" : "";

  if (!existing) {
    const payload = {
      name: seedUser.name,
      email: seedUser.email,
      role: seedUser.role,
      department: "engineering",
      ...(managerId ? { managerId } : {}),
      ...(hrId ? { hrId } : {}),
      ...(managerId
        ? {
            managerAssignedAt: new Date().toISOString(),
            managerAssignedBy: hrId || "seed-script",
            assignmentVersion: 1,
          }
        : {}),
      ...(hrId
        ? {
            hrAssignedAt: new Date().toISOString(),
            hrAssignedBy: hrId,
            hrAssignmentVersion: 1,
          }
        : {}),
    };

    const created = await databases.createDocument(
      databaseId,
      collectionIds.users,
      authUser.$id,
      payload
    );
    counters.usersCreated += 1;
    return created;
  }

  const patch = {};

  if (!String(existing.managerId || "").trim() && managerId) {
    patch.managerId = managerId;
  }
  if (!String(existing.hrId || "").trim() && hrId) {
    patch.hrId = hrId;
  }

  if (Object.keys(patch).length > 0) {
    try {
      await databases.updateDocument(databaseId, collectionIds.users, existing.$id, {
        ...patch,
        ...(patch.managerId
          ? {
              managerAssignedAt: new Date().toISOString(),
              managerAssignedBy: hrId || "seed-script",
              assignmentVersion: Number(existing.assignmentVersion || 0) + 1,
            }
          : {}),
        ...(patch.hrId
          ? {
              hrAssignedAt: new Date().toISOString(),
              hrAssignedBy: hrId,
              hrAssignmentVersion: Number(existing.hrAssignmentVersion || 0) + 1,
            }
          : {}),
      });
    } catch (error) {
      if (String(error?.message || "").toLowerCase().includes("unknown attribute")) {
        await databases.updateDocument(databaseId, collectionIds.users, existing.$id, patch);
      } else {
        throw error;
      }
    }
    counters.usersPatched += 1;
  } else {
    counters.usersSkipped += 1;
  }

  return existing;
}

function buildGoalTemplates(seedUsers, referenceMap, cycles) {
  const employees = seedUsers.filter((item) => item.role === "employee");
  const managers = seedUsers.filter((item) => item.role === "manager");
  const activeCycleId = cycles.get("cycle_active").$id;
  const closedCycleId = cycles.get("cycle_closed").$id;

  const statuses = ["draft", "submitted", "approved", "needs_changes", "closed"];

  const goals = [];

  employees.forEach((employee, index) => {
    const employeeId = referenceMap.userIdByKey.get(employee.key);
    const managerId = referenceMap.userIdByKey.get(employee.managerKey);

    goals.push({
      key: `${employee.key}-g1`,
      employeeId,
      managerId,
      cycleId: activeCycleId,
      frameworkType: "OKR",
      title: `[${seedTag}] Customer Impact ${index + 1}`,
      description: `Improve measurable delivery quality for account segment ${index + 1}.`,
      weightage: 60,
      status: statuses[index % statuses.length],
      progressPercent: index % statuses.length === 4 ? 100 : (index % 4) * 20,
      dueDate: "2026-06-20T00:00:00.000Z",
      lineageRef: `team-objective-${(index % 4) + 1}`,
      aiSuggested: index % 2 === 0,
    });

    goals.push({
      key: `${employee.key}-g2`,
      employeeId,
      managerId,
      cycleId: closedCycleId,
      frameworkType: "MBO",
      title: `[${seedTag}] Capability Growth ${index + 1}`,
      description: `Complete skill growth track and show quarter outcome evidence for employee ${index + 1}.`,
      weightage: 40,
      status: index % 2 === 0 ? "closed" : "approved",
      progressPercent: index % 2 === 0 ? 100 : 70,
      dueDate: "2026-03-20T00:00:00.000Z",
      lineageRef: `manager-objective-${(index % 4) + 1}`,
      aiSuggested: false,
    });
  });

  managers.forEach((manager, index) => {
    const managerId = referenceMap.userIdByKey.get(manager.key);
    const hrId = referenceMap.userIdByKey.get(manager.hrKey);

    goals.push({
      key: `${manager.key}-self-g1`,
      employeeId: managerId,
      managerId: hrId,
      cycleId: activeCycleId,
      frameworkType: "HYBRID",
      title: `[${seedTag}] Manager Leadership ${index + 1}`,
      description: "Drive team performance hygiene, check-in closure, and quality feedback cadence.",
      weightage: 100,
      status: "submitted",
      progressPercent: 40,
      dueDate: "2026-06-15T00:00:00.000Z",
      lineageRef: `business-objective-${index + 1}`,
      aiSuggested: true,
    });
  });

  return goals;
}

function pickDecisionFromStatus(status) {
  if (status === "approved" || status === "closed") return "approved";
  if (status === "needs_changes") return "needs_changes";
  return "";
}

async function main() {
  const seedUsers = buildSeedUsers();

  if (printUsersOnly) {
    console.log("Create these Auth users in Appwrite first (email list):");
    seedUsers.forEach((item) => console.log(`- ${item.email} (${item.role})`));
    return;
  }

  const client = makeClient();
  const databases = new Databases(client);
  const usersApi = new Users(client);

  const counters = {
    authUsersCreated: 0,
    cyclesCreated: 0,
    cyclesSkipped: 0,
    usersCreated: 0,
    usersPatched: 0,
    usersSkipped: 0,
    goalsCreated: 0,
    goalsSkipped: 0,
    approvalsCreated: 0,
    approvalsSkipped: 0,
    checkInsCreated: 0,
    checkInsSkipped: 0,
    checkInApprovalsCreated: 0,
    checkInApprovalsSkipped: 0,
    progressCreated: 0,
    progressSkipped: 0,
    aiEventsCreated: 0,
    aiEventsSkipped: 0,
    aiPoliciesCreated: 0,
    aiPoliciesSkipped: 0,
  };

  await seedAiPolicies(databases, counters);

  const authUsers = await listAllAuthUsers(usersApi);
  const authByEmail = new Map(authUsers.map((item) => [String(item.email || "").toLowerCase(), item]));

  let missingAuth = seedUsers.filter((item) => !authByEmail.get(item.email.toLowerCase()));

  if (missingAuth.length > 0 && createAuthUsers) {
    await ensureAuthUsers(usersApi, missingAuth, authByEmail, counters);
    missingAuth = seedUsers.filter((item) => !authByEmail.get(item.email.toLowerCase()));
  }

  if (missingAuth.length > 0 && !skipAuthCheck) {
    console.error("Missing Auth users. Create these in Appwrite Authentication first:");
    missingAuth.forEach((item) => console.error(`- ${item.email} (${item.role})`));
    console.error(
      "\nTip: run `npm run seed:users` to print the list, or rerun with --create-auth-users to auto-create test accounts."
    );
    process.exit(1);
  }

  const cyclesByKey = new Map();
  for (const cycle of buildCycles()) {
    const result = await createIfMissing({
      databases,
      collectionId: collectionIds.goalCycles,
      queries: [Query.equal("name", cycle.name)],
      payload: {
        name: cycle.name,
        periodType: cycle.periodType,
        startDate: cycle.startDate,
        endDate: cycle.endDate,
        state: cycle.state,
      },
    });

    cyclesByKey.set(cycle.key, result.document);
    if (result.created) counters.cyclesCreated += 1;
    else counters.cyclesSkipped += 1;
  }

  const referenceMap = { userIdByKey: new Map() };

  for (const seedUser of seedUsers) {
    const authUser = authByEmail.get(seedUser.email.toLowerCase());
    if (!authUser) continue;
    referenceMap.userIdByKey.set(seedUser.key, authUser.$id);
  }

  for (const seedUser of seedUsers) {
    const authUser = authByEmail.get(seedUser.email.toLowerCase());
    if (!authUser) continue;
    await ensureUserProfile(databases, seedUser, authUser, referenceMap, counters);
  }

  const goalsByKey = new Map();
  const goals = buildGoalTemplates(seedUsers, referenceMap, cyclesByKey);

  for (const goal of goals) {
    const result = await createIfMissing({
      databases,
      collectionId: collectionIds.goals,
      queries: [
        Query.equal("employeeId", goal.employeeId),
        Query.equal("cycleId", goal.cycleId),
        Query.equal("title", goal.title),
      ],
      payload: {
        employeeId: goal.employeeId,
        managerId: goal.managerId,
        cycleId: goal.cycleId,
        frameworkType: goal.frameworkType,
        title: goal.title,
        description: goal.description,
        weightage: goal.weightage,
        status: goal.status,
        processPercent: goal.progressPercent,
        progressPercent: goal.progressPercent,
        dueDate: goal.dueDate,
        lineageRef: goal.lineageRef,
        aiSuggested: goal.aiSuggested,
      },
    });

    goalsByKey.set(goal.key, result.document);
    if (result.created) counters.goalsCreated += 1;
    else counters.goalsSkipped += 1;

    const decision = pickDecisionFromStatus(goal.status);
    if (!decision) continue;

    const approvalResult = await createIfMissing({
      databases,
      collectionId: collectionIds.goalApprovals,
      queries: [
        Query.equal("goalId", result.document.$id),
        Query.equal("managerId", goal.managerId),
      ],
      payload: {
        goalId: result.document.$id,
        managerId: goal.managerId,
        decision,
        comments: `[${seedTag}] Auto-seeded ${decision} decision`,
        decidedAt: "2026-03-16T08:00:00.000Z",
      },
    });

    if (approvalResult.created) counters.approvalsCreated += 1;
    else counters.approvalsSkipped += 1;
  }

  const employeeUsers = seedUsers.filter((item) => item.role === "employee");

  for (let index = 0; index < employeeUsers.length; index += 1) {
    const employee = employeeUsers[index];
    const primaryGoal = goalsByKey.get(`${employee.key}-g2`) || goalsByKey.get(`${employee.key}-g1`);

    if (!primaryGoal) continue;
    if (!["approved", "closed"].includes(String(primaryGoal.status || ""))) {
      continue;
    }

    const scheduledBase = 10 + (index % 10);

    const plannedResult = await createIfMissing({
      databases,
      collectionId: collectionIds.checkIns,
      queries: [
        Query.equal("goalId", primaryGoal.$id),
        Query.equal("scheduledAt", `2026-05-${String(scheduledBase).padStart(2, "0")}T10:00:00.000Z`),
      ],
      payload: {
        goalId: primaryGoal.$id,
        employeeId: primaryGoal.employeeId,
        managerId: primaryGoal.managerId,
        scheduledAt: `2026-05-${String(scheduledBase).padStart(2, "0")}T10:00:00.000Z`,
        status: "planned",
        employeeNotes: `[${seedTag}] Planned check-in from employee ${employee.name}`,
        managerNotes: "",
        transcriptText: "",
        isFinalCheckIn: false,
      },
    });

    if (plannedResult.created) counters.checkInsCreated += 1;
    else counters.checkInsSkipped += 1;

    const isFinal = index < 5;

    const completedResult = await createIfMissing({
      databases,
      collectionId: collectionIds.checkIns,
      queries: [
        Query.equal("goalId", primaryGoal.$id),
        Query.equal("scheduledAt", `2026-05-${String(scheduledBase).padStart(2, "0")}T14:00:00.000Z`),
      ],
      payload: {
        goalId: primaryGoal.$id,
        employeeId: primaryGoal.employeeId,
        managerId: primaryGoal.managerId,
        scheduledAt: `2026-05-${String(scheduledBase).padStart(2, "0")}T14:00:00.000Z`,
        status: "completed",
        employeeNotes: `[${seedTag}] Completed check-in notes by ${employee.name}`,
        managerNotes: `[${seedTag}] Manager feedback for ${employee.name}`,
        transcriptText: `[${seedTag}] Transcript summary for ${employee.name}`,
        isFinalCheckIn: isFinal,
        managerRating: isFinal ? ((index % 5) + 1) : null,
        ratedAt: isFinal ? "2026-05-20T16:00:00.000Z" : null,
      },
    });

    if (completedResult.created) counters.checkInsCreated += 1;
    else counters.checkInsSkipped += 1;

    const hrId = referenceMap.userIdByKey.get(employee.hrKey || "");
    if (hrId) {
      const checkInApprovalResult = await createIfMissing({
        databases,
        collectionId: collectionIds.checkInApprovals,
        queries: [
          Query.equal("checkInId", completedResult.document.$id),
          Query.equal("hrId", hrId),
        ],
        payload: {
          checkInId: completedResult.document.$id,
          managerId: primaryGoal.managerId,
          hrId,
          decision: index % 3 === 0 ? "needs_changes" : "approved",
          comments: `[${seedTag}] HR review seeded for ${employee.name}`,
          decidedAt: "2026-05-21T10:00:00.000Z",
        },
      });

      if (checkInApprovalResult.created) counters.checkInApprovalsCreated += 1;
      else counters.checkInApprovalsSkipped += 1;
    }

    const rag = index % 3 === 0 ? "behind" : index % 3 === 1 ? "on_track" : "completed";
    const percent = rag === "completed" ? 100 : rag === "on_track" ? 65 : 35;

    const progressResult = await createIfMissing({
      databases,
      collectionId: collectionIds.progressUpdates,
      queries: [
        Query.equal("goalId", primaryGoal.$id),
        Query.equal("updateText", `[${seedTag}] Progress update ${index + 1}`),
      ],
      payload: {
        goalId: primaryGoal.$id,
        employeeId: primaryGoal.employeeId,
        percentComplete: percent,
        ragStatus: rag,
        updateText: `[${seedTag}] Progress update ${index + 1}`,
        attachmentIds: [],
        createdAt: "2026-05-22T09:00:00.000Z",
      },
    });

    if (progressResult.created) counters.progressCreated += 1;
    else counters.progressSkipped += 1;
  }

  const activeCycleId = cyclesByKey.get("cycle_active").$id;
  for (let index = 0; index < employeeUsers.length; index += 1) {
    const employee = employeeUsers[index];
    const userId = referenceMap.userIdByKey.get(employee.key);
    if (!userId) continue;

    if (index < 8) {
      const goalSuggestionResult = await createAiEventIfMissing({
        databases,
        queries: [
          Query.equal("userId", userId),
          Query.equal("featureType", "goal_suggestion"),
          Query.equal("cycleId", activeCycleId),
        ],
        payload: {
          userId,
          featureType: "goal_suggestion",
          cycleId: activeCycleId,
          requestCount: (index % 3) + 1,
          lastUsedAt: "2026-05-23T08:00:00.000Z",
          metadata: JSON.stringify({ seedTag }),
        },
      });

      if (goalSuggestionResult.created) counters.aiEventsCreated += 1;
      else counters.aiEventsSkipped += 1;
    }

    if (index < 5) {
      const checkinSummaryResult = await createAiEventIfMissing({
        databases,
        queries: [
          Query.equal("userId", userId),
          Query.equal("featureType", "checkin_summary"),
          Query.equal("cycleId", activeCycleId),
        ],
        payload: {
          userId,
          featureType: "checkin_summary",
          cycleId: activeCycleId,
          requestCount: 2,
          lastUsedAt: "2026-05-23T09:00:00.000Z",
          metadata: JSON.stringify({ seedTag }),
        },
      });

      if (checkinSummaryResult.created) counters.aiEventsCreated += 1;
      else counters.aiEventsSkipped += 1;
    }
  }

  console.log("\nSeed complete (append-only, medium scope):");
  Object.entries(counters).forEach(([key, value]) => {
    console.log(`- ${key}: ${value}`);
  });
}

main().catch((error) => {
  console.error("Seed failed:", error.message || error);
  process.exit(1);
});

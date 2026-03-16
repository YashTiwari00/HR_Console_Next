import { Client, Databases, Query } from "node-appwrite";

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
};

const seedTag = "SEED-M26";

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

    const rows = response.documents || [];
    all.push(...rows);

    if (rows.length < batchSize) {
      break;
    }

    offset += batchSize;
  }

  return all;
}

function countBy(rows, key) {
  const map = new Map();
  rows.forEach((row) => {
    const value = String(row?.[key] ?? "").trim() || "(empty)";
    map.set(value, (map.get(value) || 0) + 1);
  });
  return map;
}

function printMap(title, map) {
  console.log(`\n${title}`);
  Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([key, value]) => {
      console.log(`- ${key}: ${value}`);
    });
}

function hasSeedTag(row) {
  const values = [
    row.name,
    row.title,
    row.description,
    row.comments,
    row.updateText,
    row.metadata,
    row.employeeNotes,
    row.managerNotes,
    row.transcriptText,
  ];

  return values.some((item) => String(item || "").includes(seedTag));
}

function missingValues(found, expected) {
  return expected.filter((value) => !found.has(value));
}

async function main() {
  const client = makeClient();
  const databases = new Databases(client);

  const [users, cycles, goals, goalApprovals, checkIns, checkInApprovals, progressUpdates, aiEvents] =
    await Promise.all([
      listAllDocuments(databases, collectionIds.users),
      listAllDocuments(databases, collectionIds.goalCycles),
      listAllDocuments(databases, collectionIds.goals),
      listAllDocuments(databases, collectionIds.goalApprovals),
      listAllDocuments(databases, collectionIds.checkIns),
      listAllDocuments(databases, collectionIds.checkInApprovals),
      listAllDocuments(databases, collectionIds.progressUpdates),
      listAllDocuments(databases, collectionIds.aiEvents),
    ]);

  const seedUsers = users.filter((row) => String(row.email || "").includes("seed."));
  const seedCycles = cycles.filter(hasSeedTag);
  const seedGoals = goals.filter(hasSeedTag);
  const seedGoalIds = new Set(seedGoals.map((item) => item.$id));
  const seedApprovals = goalApprovals.filter((item) => seedGoalIds.has(String(item.goalId || "")) || hasSeedTag(item));
  const seedCheckIns = checkIns.filter((item) => seedGoalIds.has(String(item.goalId || "")) || hasSeedTag(item));
  const seedCheckInIds = new Set(seedCheckIns.map((item) => item.$id));
  const seedCheckInApprovals = checkInApprovals.filter(
    (item) => seedCheckInIds.has(String(item.checkInId || "")) || hasSeedTag(item)
  );
  const seedProgress = progressUpdates.filter(
    (item) => seedGoalIds.has(String(item.goalId || "")) || hasSeedTag(item)
  );
  const seedAiEvents = aiEvents.filter(hasSeedTag);

  console.log("Seed verification report");
  console.log(`- users(seed): ${seedUsers.length}`);
  console.log(`- cycles(seed): ${seedCycles.length}`);
  console.log(`- goals(seed): ${seedGoals.length}`);
  console.log(`- goalApprovals(seed): ${seedApprovals.length}`);
  console.log(`- checkIns(seed): ${seedCheckIns.length}`);
  console.log(`- checkInApprovals(seed): ${seedCheckInApprovals.length}`);
  console.log(`- progressUpdates(seed): ${seedProgress.length}`);
  console.log(`- aiEvents(seed): ${seedAiEvents.length}`);

  printMap("Seed user roles", countBy(seedUsers, "role"));
  printMap("Seed cycle states", countBy(seedCycles, "state"));
  printMap("Seed goal statuses", countBy(seedGoals, "status"));
  printMap("Seed check-in statuses", countBy(seedCheckIns, "status"));
  printMap("Seed progress ragStatus", countBy(seedProgress, "ragStatus"));
  printMap("Seed AI feature usage", countBy(seedAiEvents, "featureType"));

  const finalCheckIns = seedCheckIns.filter((item) => Boolean(item.isFinalCheckIn));
  const ratedFinalCheckIns = finalCheckIns.filter((item) => Number.isInteger(Number(item.managerRating)));

  console.log("\nFinal check-in rating coverage");
  console.log(`- final check-ins: ${finalCheckIns.length}`);
  console.log(`- rated final check-ins: ${ratedFinalCheckIns.length}`);

  const roleSet = new Set(seedUsers.map((item) => String(item.role || "")));
  const goalStatusSet = new Set(seedGoals.map((item) => String(item.status || "")));
  const checkInStatusSet = new Set(seedCheckIns.map((item) => String(item.status || "")));
  const ragSet = new Set(seedProgress.map((item) => String(item.ragStatus || "")));

  const warnings = [];
  const missingRoles = missingValues(roleSet, ["hr", "manager", "employee"]);
  if (missingRoles.length) warnings.push(`Missing seed roles: ${missingRoles.join(", ")}`);

  const missingGoalStatuses = missingValues(goalStatusSet, [
    "draft",
    "submitted",
    "approved",
    "needs_changes",
    "closed",
  ]);
  if (missingGoalStatuses.length) {
    warnings.push(`Missing goal statuses: ${missingGoalStatuses.join(", ")}`);
  }

  const missingCheckInStatuses = missingValues(checkInStatusSet, ["planned", "completed"]);
  if (missingCheckInStatuses.length) {
    warnings.push(`Missing check-in statuses: ${missingCheckInStatuses.join(", ")}`);
  }

  const missingRag = missingValues(ragSet, ["on_track", "behind", "completed"]);
  if (missingRag.length) warnings.push(`Missing ragStatus values: ${missingRag.join(", ")}`);

  if (ratedFinalCheckIns.length < 1) {
    warnings.push("No rated final check-ins found.");
  }

  if (warnings.length > 0) {
    console.log("\nCoverage warnings");
    warnings.forEach((warning) => console.log(`- ${warning}`));
    process.exitCode = 1;
  } else {
    console.log("\nCoverage checks passed.");
  }
}

main().catch((error) => {
  console.error("Seed verification failed:", error.message || error);
  process.exit(1);
});

import { Client, Databases } from "node-appwrite";

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.NEXT_PUBLIC_DATABASE_ID;

const mode = process.argv.includes("--apply") ? "apply" : "audit";

const collections = {
  users: process.env.NEXT_PUBLIC_USERS_COLLECTION_ID || "users",
  goals: process.env.NEXT_PUBLIC_GOALS_COLLECTION_ID || "goals",
  goal_approvals:
    process.env.NEXT_PUBLIC_GOAL_APPROVALS_COLLECTION_ID || "goal_approvals",
  checkins: process.env.NEXT_PUBLIC_CHECK_INS_COLLECTION_ID || "check_ins",
  progress: process.env.NEXT_PUBLIC_PROGRESS_UPDATES_COLLECTION_ID || "progress_updates",
  goal_cycles: process.env.NEXT_PUBLIC_GOAL_CYCLES_COLLECTION_ID || "goal_cycles",
  ai_events: process.env.NEXT_PUBLIC_AI_EVENTS_COLLECTION_ID || "ai_events",
  checkin_approvals:
    process.env.NEXT_PUBLIC_CHECK_IN_APPROVALS_COLLECTION_ID || "checkin_approvals",
};

const required = {
  [collections.users]: [
    { key: "name", type: "string", size: 256, required: true },
    { key: "email", type: "string", size: 320, required: true },
    { key: "role", type: "enum", required: true, elements: ["employee", "manager", "hr"] },
    { key: "department", type: "string", size: 128, required: false },
    { key: "managerId", type: "string", size: 64, required: false },
    { key: "managerAssignedAt", type: "datetime", required: false },
    { key: "managerAssignedBy", type: "string", size: 64, required: false },
    { key: "assignmentVersion", type: "integer", required: false, min: 0, max: 999999 },
  ],
  [collections.goals]: [
    { key: "employeeId", type: "string", size: 64, required: true },
    { key: "managerId", type: "string", size: 64, required: true },
    { key: "cycleId", type: "string", size: 32, required: true },
    { key: "frameworkType", type: "enum", required: true, elements: ["OKR", "MBO", "HYBRID"] },
    { key: "title", type: "string", size: 512, required: true },
    { key: "description", type: "string", size: 8192, required: true },
    { key: "weightage", type: "integer", required: true, min: 1, max: 100 },
    { key: "status", type: "enum", required: true, elements: ["draft", "submitted", "approved", "needs_changes", "closed"] },
    { key: "progressPercent", type: "integer", required: true, min: 0, max: 100 },
    { key: "dueDate", type: "datetime", required: false },
    { key: "lineageRef", type: "string", size: 512, required: false },
    { key: "aiSuggested", type: "boolean", required: false, default: false },
  ],
  [collections.goal_approvals]: [
    { key: "goalId", type: "string", size: 64, required: true },
    { key: "managerId", type: "string", size: 64, required: true },
    { key: "decision", type: "enum", required: true, elements: ["approved", "rejected", "needs_changes"] },
    { key: "comments", type: "string", size: 8192, required: false },
    { key: "decidedAt", type: "datetime", required: true },
  ],
  [collections.checkins]: [
    { key: "goalId", type: "string", size: 64, required: true },
    { key: "employeeId", type: "string", size: 64, required: true },
    { key: "managerId", type: "string", size: 64, required: true },
    { key: "scheduledAt", type: "datetime", required: true },
    { key: "status", type: "enum", required: true, elements: ["planned", "completed"] },
    { key: "employeeNotes", type: "string", size: 8192, required: false },
    { key: "managerNotes", type: "string", size: 8192, required: false },
    { key: "transcriptText", type: "string", size: 8192, required: false },
    { key: "isFinalCheckIn", type: "boolean", required: false, default: false },
    { key: "managerRating", type: "integer", required: false, min: 1, max: 5 },
    { key: "ratedAt", type: "datetime", required: false },
    { key: "attachmentIds", type: "string", size: 64, required: false, array: true },
  ],
  [collections.progress]: [
    { key: "goalId", type: "string", size: 64, required: true },
    { key: "employeeId", type: "string", size: 64, required: true },
    { key: "percentComplete", type: "integer", required: true, min: 0, max: 100 },
    { key: "ragStatus", type: "enum", required: true, elements: ["on_track", "behind", "completed"] },
    { key: "updateText", type: "string", size: 8192, required: true },
    { key: "attachmentIds", type: "string", size: 64, required: false, array: true },
    { key: "createdAt", type: "datetime", required: false },
  ],
  [collections.goal_cycles]: [
    { key: "name", type: "string", size: 64, required: true },
    { key: "periodType", type: "enum", required: true, elements: ["quarterly", "yearly", "hybrid"] },
    { key: "startDate", type: "datetime", required: true },
    { key: "endDate", type: "datetime", required: true },
    { key: "state", type: "enum", required: true, elements: ["active", "closed"] },
  ],
  [collections.ai_events]: [
    { key: "userId", type: "string", size: 64, required: true },
    { key: "featureType", type: "enum", required: true, elements: ["goal_suggestion", "checkin_summary"] },
    { key: "cycleId", type: "string", size: 32, required: true },
    { key: "requestCount", type: "integer", required: true, min: 0, max: 9999 },
    { key: "lastUsedAt", type: "datetime", required: true },
    { key: "metadata", type: "string", size: 8192, required: false },
  ],
  [collections.checkin_approvals]: [
    { key: "checkInId", type: "string", size: 64, required: true },
    { key: "managerId", type: "string", size: 64, required: true },
    { key: "hrId", type: "string", size: 64, required: true },
    { key: "decision", type: "enum", required: true, elements: ["approved", "rejected", "needs_changes"] },
    { key: "comments", type: "string", size: 8192, required: false },
    { key: "decidedAt", type: "datetime", required: true },
  ],
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

function isNotFound(err) {
  const message = String(err?.message || "").toLowerCase();
  return message.includes("could not be found") || message.includes("not found");
}

async function ensureCollection(databases, collectionId) {
  try {
    await databases.getCollection(databaseId, collectionId);
    return { exists: true, created: false };
  } catch (err) {
    if (!isNotFound(err)) throw err;
    if (mode !== "apply") return { exists: false, created: false };

    await databases.createCollection(databaseId, collectionId, collectionId, [], false, true);
    return { exists: true, created: true };
  }
}

async function createAttribute(databases, collectionId, attr) {
  const key = attr.key;

  if (attr.type === "string") {
    await databases.createStringAttribute(
      databaseId,
      collectionId,
      key,
      attr.size,
      Boolean(attr.required),
      attr.default ?? null,
      Boolean(attr.array)
    );
    return;
  }

  if (attr.type === "integer") {
    await databases.createIntegerAttribute(
      databaseId,
      collectionId,
      key,
      Boolean(attr.required),
      attr.min ?? null,
      attr.max ?? null,
      attr.default ?? null,
      Boolean(attr.array)
    );
    return;
  }

  if (attr.type === "boolean") {
    await databases.createBooleanAttribute(
      databaseId,
      collectionId,
      key,
      Boolean(attr.required),
      attr.default ?? null,
      Boolean(attr.array)
    );
    return;
  }

  if (attr.type === "datetime") {
    await databases.createDatetimeAttribute(
      databaseId,
      collectionId,
      key,
      Boolean(attr.required),
      attr.default ?? null,
      Boolean(attr.array)
    );
    return;
  }

  if (attr.type === "enum") {
    await databases.createEnumAttribute(
      databaseId,
      collectionId,
      key,
      attr.elements,
      Boolean(attr.required),
      attr.default ?? null,
      Boolean(attr.array)
    );
    return;
  }

  throw new Error(`Unsupported attribute type: ${attr.type}`);
}

async function main() {
  assertEnv();

  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  const databases = new Databases(client);

  const summary = [];

  for (const [collectionId, attrs] of Object.entries(required)) {
    const row = { collectionId, createdCollection: false, missing: [], created: [], failed: [] };

    const collectionState = await ensureCollection(databases, collectionId);
    row.createdCollection = collectionState.created;

    if (!collectionState.exists) {
      row.missing = attrs.map((attr) => attr.key);
      summary.push(row);
      continue;
    }

    let existingAttributes = [];
    try {
      const list = await databases.listAttributes(databaseId, collectionId);
      existingAttributes = (list.attributes || []).map((a) => a.key);
    } catch (err) {
      row.failed.push(`listAttributes failed: ${String(err?.message || err)}`);
      summary.push(row);
      continue;
    }

    for (const attr of attrs) {
      if (existingAttributes.includes(attr.key)) continue;
      row.missing.push(attr.key);

      if (mode !== "apply") continue;

      try {
        await createAttribute(databases, collectionId, attr);
        row.created.push(attr.key);
      } catch (err) {
        row.failed.push(`${attr.key}: ${String(err?.message || err)}`);
      }
    }

    summary.push(row);
  }

  console.log(`\nAppwrite schema ${mode} summary:`);
  for (const row of summary) {
    console.log(`\n- ${row.collectionId}`);
    if (row.createdCollection) {
      console.log("  created collection");
    }
    console.log(`  missing attrs: ${row.missing.length ? row.missing.join(", ") : "none"}`);
    if (row.created.length) {
      console.log(`  created attrs: ${row.created.join(", ")}`);
    }
    if (row.failed.length) {
      console.log("  failures:");
      for (const failure of row.failed) {
        console.log(`    - ${failure}`);
      }
    }
  }

  const failures = summary.reduce((acc, row) => acc + row.failed.length, 0);
  if (failures > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Schema sync failed:", err.message || err);
  process.exit(1);
});

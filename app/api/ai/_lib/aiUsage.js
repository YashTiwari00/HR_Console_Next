import { appwriteConfig } from "@/lib/appwrite";
import { ID, Query, databaseId } from "@/lib/appwriteServer";

export const FEATURE_CAPS = {
  goal_suggestion: 3,
  checkin_summary: 3,
  goal_analysis: 3,
  meeting_intelligence: 8,
  meeting_qa: 20,
};

function isRequestCountTypeError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("requestcount") && message.includes("invalid type");
}

async function updateUsageCount(databases, documentId, used) {
  const payload = {
    requestCount: used,
    lastUsedAt: new Date().toISOString(),
  };

  try {
    await databases.updateDocument(
      databaseId,
      appwriteConfig.aiEventsCollectionId,
      documentId,
      payload
    );
  } catch (error) {
    if (!isRequestCountTypeError(error)) {
      throw error;
    }

    await databases.updateDocument(
      databaseId,
      appwriteConfig.aiEventsCollectionId,
      documentId,
      {
        ...payload,
        requestCount: String(used),
      }
    );
  }
}

async function createUsageRow(databases, payload) {
  try {
    await databases.createDocument(
      databaseId,
      appwriteConfig.aiEventsCollectionId,
      ID.unique(),
      payload
    );
  } catch (error) {
    if (!isRequestCountTypeError(error)) {
      throw error;
    }

    await databases.createDocument(
      databaseId,
      appwriteConfig.aiEventsCollectionId,
      ID.unique(),
      {
        ...payload,
        requestCount: String(payload.requestCount),
      }
    );
  }
}

function normalizeCount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getAiUsageSnapshot({ databases, userId, cycleId }) {
  const filters = [Query.equal("userId", String(userId || "").trim()), Query.limit(200)];
  if (cycleId) {
    filters.push(Query.equal("cycleId", String(cycleId || "").trim()));
  }

  const result = await databases.listDocuments(
    databaseId,
    appwriteConfig.aiEventsCollectionId,
    filters
  );

  const byFeature = {};

  for (const featureType of Object.keys(FEATURE_CAPS)) {
    byFeature[featureType] = {
      featureType,
      cap: FEATURE_CAPS[featureType],
      used: 0,
      remaining: FEATURE_CAPS[featureType],
      warning: false,
    };
  }

  for (const row of result.documents || []) {
    const featureType = String(row.featureType || "").trim();
    if (!byFeature[featureType]) continue;

    const cap = byFeature[featureType].cap;
    const used = normalizeCount(row.requestCount);
    const remaining = Math.max(0, cap - used);

    byFeature[featureType] = {
      featureType,
      cap,
      used,
      remaining,
      warning: remaining <= 1 || used / Math.max(1, cap) >= 0.8,
    };
  }

  return {
    cycleId: cycleId || null,
    features: Object.values(byFeature),
  };
}

export async function getAiUsageOverview({ databases, cycleId }) {
  const filters = [Query.limit(500)];
  if (cycleId) {
    filters.push(Query.equal("cycleId", String(cycleId || "").trim()));
  }

  const result = await databases.listDocuments(
    databaseId,
    appwriteConfig.aiEventsCollectionId,
    filters
  );

  const totalsByFeature = {};
  const userTotals = new Map();

  for (const featureType of Object.keys(FEATURE_CAPS)) {
    totalsByFeature[featureType] = {
      featureType,
      capPerUser: FEATURE_CAPS[featureType],
      totalUsed: 0,
      nearCapUsers: 0,
      rows: 0,
    };
  }

  for (const row of result.documents || []) {
    const featureType = String(row.featureType || "").trim();
    if (!totalsByFeature[featureType]) continue;

    const userId = String(row.userId || "").trim();
    const used = normalizeCount(row.requestCount);
    const cap = FEATURE_CAPS[featureType];
    const ratio = used / Math.max(1, cap);

    totalsByFeature[featureType].totalUsed += used;
    totalsByFeature[featureType].rows += 1;
    if (ratio >= 0.8) {
      totalsByFeature[featureType].nearCapUsers += 1;
    }

    const key = `${userId}:${featureType}`;
    userTotals.set(key, {
      userId,
      featureType,
      cycleId: String(row.cycleId || "").trim(),
      used,
      cap,
      remaining: Math.max(0, cap - used),
      nearCap: ratio >= 0.8,
      warning: Math.max(0, cap - used) <= 1 || ratio >= 0.8,
      lastUsedAt: row.lastUsedAt || null,
    });
  }

  const topUsers = Array.from(userTotals.values()).sort((a, b) => b.used - a.used).slice(0, 25);

  return {
    cycleId: cycleId || null,
    totalsByFeature: Object.values(totalsByFeature),
    topUsers,
  };
}

export async function assertAndTrackAiUsage({ databases, userId, cycleId, featureType }) {
  const cap = FEATURE_CAPS[featureType] || 3;

  const queryResult = await databases.listDocuments(
    databaseId,
    appwriteConfig.aiEventsCollectionId,
    [
      Query.equal("userId", userId),
      Query.equal("cycleId", cycleId),
      Query.equal("featureType", featureType),
      Query.limit(1),
    ]
  );

  const existing = queryResult.documents[0] || null;

  if (existing && Number(existing.requestCount || 0) >= cap) {
    const error = new Error(`AI usage cap reached for ${featureType}.`);
    error.statusCode = 429;
    throw error;
  }

  if (existing) {
    const used = Number(existing.requestCount || 0) + 1;

    await updateUsageCount(databases, existing.$id, used);

    return {
      cap,
      used,
      remaining: Math.max(0, cap - used),
      featureType,
      cycleId,
    };
  }

  await createUsageRow(databases, {
    userId,
    featureType,
    cycleId,
    requestCount: 1,
    lastUsedAt: new Date().toISOString(),
    metadata: "{}",
  });

  return {
    cap,
    used: 1,
    remaining: Math.max(0, cap - 1),
    featureType,
    cycleId,
  };
}

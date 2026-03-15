import { appwriteConfig } from "@/lib/appwrite";
import { ID, Query, databaseId } from "@/lib/appwriteServer";

const FEATURE_CAPS = {
  goal_suggestion: 3,
  checkin_summary: 3,
};

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

    await databases.updateDocument(
      databaseId,
      appwriteConfig.aiEventsCollectionId,
      existing.$id,
      {
        requestCount: used,
        lastUsedAt: new Date().toISOString(),
      }
    );

    return {
      cap,
      used,
      remaining: Math.max(0, cap - used),
      featureType,
      cycleId,
    };
  }

  await databases.createDocument(
    databaseId,
    appwriteConfig.aiEventsCollectionId,
    ID.unique(),
    {
      userId,
      featureType,
      cycleId,
      requestCount: 1,
      lastUsedAt: new Date().toISOString(),
      metadata: "{}",
    }
  );

  return {
    cap,
    used: 1,
    remaining: Math.max(0, cap - 1),
    featureType,
    cycleId,
  };
}

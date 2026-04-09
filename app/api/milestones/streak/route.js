import { Query, databaseId } from "@/lib/appwriteServer";
import { checkInsCollectionId, cyclesCollectionId } from "@/lib/appwrite";
import { computeCheckInStreak } from "@/lib/milestones";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee"]);

    if (process.env.NEXT_PUBLIC_ENABLE_GAMIFICATION !== "true") {
      return Response.json({ streak: 0, cycleNames: [] });
    }

    const result = await computeCheckInStreak({
      db: databases,
      databaseId,
      checkInsCollectionId,
      cyclesCollectionId,
      Query,
      userId: String(profile?.$id || "").trim(),
    });

    return Response.json({
      streak: Number(result?.streak) || 0,
      cycleNames: Array.isArray(result?.cycleNames) ? result.cycleNames : [],
    });
  } catch (error) {
    if (error?.statusCode === 401 || error?.statusCode === 403) {
      return errorResponse(error);
    }
    return Response.json({ streak: 0, cycleNames: [] });
  }
}

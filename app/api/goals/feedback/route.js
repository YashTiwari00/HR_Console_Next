import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "hr"]);

    const { searchParams } = new URL(request.url);
    const goalId = searchParams.get("goalId");

    let goalIds = [];

    if (profile.role === "employee") {
      const goals = await databases.listDocuments(
        databaseId,
        appwriteConfig.goalsCollectionId,
        [Query.equal("employeeId", profile.$id), Query.limit(200)]
      );

      goalIds = goals.documents.map((doc) => doc.$id);
    }

    if (goalId) {
      goalIds = [goalId];
    }

    if (goalIds.length === 0) {
      return Response.json({ data: [] });
    }

    const approvals = await databases.listDocuments(
      databaseId,
      appwriteConfig.goalApprovalsCollectionId,
      [Query.equal("goalId", goalIds), Query.orderDesc("decidedAt"), Query.limit(500)]
    );

    const latestByGoal = new Map();

    for (const approval of approvals.documents) {
      if (!latestByGoal.has(approval.goalId)) {
        latestByGoal.set(approval.goalId, approval);
      }
    }

    return Response.json({ data: Array.from(latestByGoal.values()) });
  } catch (error) {
    return errorResponse(error);
  }
}

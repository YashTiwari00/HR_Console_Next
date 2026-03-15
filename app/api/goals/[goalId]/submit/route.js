import { appwriteConfig } from "@/lib/appwrite";
import { GOAL_STATUSES } from "@/lib/appwriteSchema";
import { databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";

export async function POST(request, context) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager"]);

    const params = await context.params;
    const goalId = params.goalId;
    const goal = await databases.getDocument(
      databaseId,
      appwriteConfig.goalsCollectionId,
      goalId
    );

    if (goal.employeeId !== profile.$id) {
      return Response.json({ error: "Forbidden for this goal." }, { status: 403 });
    }

    if (
      goal.status !== GOAL_STATUSES.DRAFT &&
      goal.status !== GOAL_STATUSES.NEEDS_CHANGES
    ) {
      return Response.json(
        { error: "Only draft or needs_changes goals can be submitted." },
        { status: 400 }
      );
    }

    const updated = await databases.updateDocument(
      databaseId,
      appwriteConfig.goalsCollectionId,
      goalId,
      {
        status: GOAL_STATUSES.SUBMITTED,
      }
    );

    return Response.json({ data: updated });
  } catch (error) {
    return errorResponse(error);
  }
}

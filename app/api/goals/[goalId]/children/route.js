import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { isGoalChildOfParent } from "@/app/api/goals/_lib/cascade";

function canReadGoal(profile, goal) {
  if (profile.role === "hr") return true;
  if (profile.role === "employee") {
    return String(goal?.employeeId || "").trim() === String(profile?.$id || "").trim();
  }

  if (profile.role === "manager") {
    const profileId = String(profile?.$id || "").trim();
    return (
      String(goal?.managerId || "").trim() === profileId ||
      String(goal?.employeeId || "").trim() === profileId
    );
  }

  return false;
}

export async function GET(request, context) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "hr"]);

    const params = await context.params;
    const goalId = String(params.goalId || "").trim();

    if (!goalId) {
      return Response.json({ error: "goalId is required." }, { status: 400 });
    }

    const parentGoal = await databases.getDocument(
      databaseId,
      appwriteConfig.goalsCollectionId,
      goalId
    );

    if (!canReadGoal(profile, parentGoal)) {
      return Response.json({ error: "Forbidden for this goal." }, { status: 403 });
    }

    const query = [
      Query.equal("cycleId", String(parentGoal.cycleId || "").trim()),
      Query.limit(300),
    ];

    if (profile.role === "employee") {
      query.unshift(Query.equal("employeeId", String(profile.$id || "").trim()));
    } else if (profile.role === "manager") {
      query.unshift(Query.equal("managerId", String(parentGoal.managerId || "").trim()));
    }

    const result = await databases.listDocuments(
      databaseId,
      appwriteConfig.goalsCollectionId,
      query
    );

    const children = result.documents.filter((goal) => isGoalChildOfParent(goal, goalId));

    return Response.json({
      data: children,
      meta: {
        parentGoalId: goalId,
        total: children.length,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

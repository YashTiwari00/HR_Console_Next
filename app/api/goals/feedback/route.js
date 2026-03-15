import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertManagerCanAccessEmployee } from "@/lib/teamAccess";

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "hr"]);

    const { searchParams } = new URL(request.url);
    const goalId = searchParams.get("goalId");
    const scope = (searchParams.get("scope") || "team").trim();
    const employeeId = (searchParams.get("employeeId") || "").trim();

    let goalIds = [];

    if (profile.role === "employee") {
      if (employeeId && employeeId !== profile.$id) {
        return Response.json({ error: "Forbidden for requested employee." }, { status: 403 });
      }

      const goals = await databases.listDocuments(
        databaseId,
        appwriteConfig.goalsCollectionId,
        [Query.equal("employeeId", profile.$id), Query.limit(200)]
      );

      goalIds = goals.documents.map((doc) => doc.$id);
    } else if (profile.role === "manager") {
      await assertManagerCanAccessEmployee(databases, profile.$id, employeeId);

      if (scope === "self") {
        const goals = await databases.listDocuments(
          databaseId,
          appwriteConfig.goalsCollectionId,
          [Query.equal("employeeId", profile.$id), Query.limit(200)]
        );

        goalIds = goals.documents.map((doc) => doc.$id);
      } else if (scope === "all") {
        const [selfGoals, teamGoals] = await Promise.all([
          databases.listDocuments(databaseId, appwriteConfig.goalsCollectionId, [
            Query.equal("employeeId", profile.$id),
            Query.limit(200),
          ]),
          databases.listDocuments(databaseId, appwriteConfig.goalsCollectionId, [
            Query.equal("managerId", profile.$id),
            Query.limit(200),
          ]),
        ]);

        goalIds = Array.from(
          new Set([
            ...selfGoals.documents.map((doc) => doc.$id),
            ...teamGoals.documents.map((doc) => doc.$id),
          ])
        );
      } else {
        const goals = await databases.listDocuments(
          databaseId,
          appwriteConfig.goalsCollectionId,
          [Query.equal("managerId", profile.$id), Query.limit(200)]
        );

        goalIds = goals.documents.map((doc) => doc.$id);
      }

      if (employeeId) {
        const authorizedGoals = await databases.listDocuments(
          databaseId,
          appwriteConfig.goalsCollectionId,
          [Query.equal("employeeId", employeeId), Query.limit(200)]
        );

        const authorizedGoalIds = new Set(authorizedGoals.documents.map((doc) => doc.$id));
        goalIds = goalIds.filter((id) => authorizedGoalIds.has(id));
      }
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

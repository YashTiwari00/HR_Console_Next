import { appwriteConfig } from "@/lib/appwrite";
import { GOAL_STATUSES } from "@/lib/appwriteSchema";
import { ID, Query, databaseId } from "@/lib/appwriteServer";
import { computeAndPersistEmployeeCycleScore, setCycleRatingsVisibility } from "@/lib/finalRatings";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";

export async function POST(request, context) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    const params = await context.params;
    const cycleId = String(params.cycleId || "").trim().toUpperCase();

    if (!cycleId) {
      return Response.json({ error: "cycleId is required." }, { status: 400 });
    }

    const goalsResult = await databases.listDocuments(databaseId, appwriteConfig.goalsCollectionId, [
      Query.equal("cycleId", cycleId),
      Query.limit(200),
    ]);

    const approvedGoals = goalsResult.documents.filter((goal) => {
      const status = String(goal.status || "");
      return status === GOAL_STATUSES.APPROVED || status === GOAL_STATUSES.CLOSED;
    });

    const pairs = new Map();
    for (const goal of approvedGoals) {
      const employeeId = String(goal.employeeId || "").trim();
      const managerId = String(goal.managerId || "").trim();
      if (!employeeId || !managerId) continue;
      pairs.set(`${employeeId}|${managerId}`, { employeeId, managerId });
    }

    for (const pair of pairs.values()) {
      await computeAndPersistEmployeeCycleScore(databases, {
        employeeId: pair.employeeId,
        managerId: pair.managerId,
        cycleId,
        visibility: "visible",
      });
    }

    await setCycleRatingsVisibility(databases, cycleId, true);

    try {
      const cycles = await databases.listDocuments(databaseId, appwriteConfig.goalCyclesCollectionId, [
        Query.equal("name", cycleId),
        Query.limit(1),
      ]);

      const cycle = cycles.documents[0];
      if (cycle) {
        await databases.updateDocument(databaseId, appwriteConfig.goalCyclesCollectionId, cycle.$id, {
          state: "closed",
          closedAt: new Date().toISOString(),
          closedBy: profile.$id,
        });
      } else {
        await databases.createDocument(databaseId, appwriteConfig.goalCyclesCollectionId, ID.unique(), {
          name: cycleId,
          periodType: "quarterly",
          startDate: new Date().toISOString(),
          endDate: new Date().toISOString(),
          state: "closed",
          closedAt: new Date().toISOString(),
          closedBy: profile.$id,
        });
      }
    } catch {
      // goal_cycles schema may not include closure attributes in all environments.
    }

    return Response.json({
      data: {
        cycleId,
        closed: true,
        employeesUpdated: pairs.size,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

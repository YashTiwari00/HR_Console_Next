import { appwriteConfig } from "@/lib/appwrite";
import { GOAL_STATUSES } from "@/lib/appwriteSchema";
import { Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { listUsersByIds, mapUserSummary } from "@/lib/teamAccess";

function toProgress(goal) {
  const numeric = Number(goal.progressPercent ?? goal.processPercent ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function latestReviewByCheckIn(approvals) {
  const map = new Map();

  for (const item of approvals) {
    const id = String(item.checkInId || "").trim();
    if (!id) continue;

    const existing = map.get(id);
    if (!existing) {
      map.set(id, item);
      continue;
    }

    const existingTime = new Date(existing.decidedAt || "").valueOf();
    const nextTime = new Date(item.decidedAt || "").valueOf();

    if (Number.isNaN(existingTime) || (!Number.isNaN(nextTime) && nextTime > existingTime)) {
      map.set(id, item);
    }
  }

  return map;
}

function isMissingCollectionError(error) {
  const message = String(error?.message || "").toLowerCase();
  const collectionId = String(appwriteConfig.checkInApprovalsCollectionId || "").toLowerCase();

  return (
    message.includes("collection") &&
    message.includes("requested id") &&
    message.includes("could not be found") &&
    (!collectionId || message.includes(collectionId))
  );
}

async function listCheckInApprovals(databases) {
  try {
    const response = await databases.listDocuments(
      databaseId,
      appwriteConfig.checkInApprovalsCollectionId,
      [Query.orderDesc("decidedAt"), Query.limit(400)]
    );

    return { rows: response.documents, available: true };
  } catch (error) {
    if (isMissingCollectionError(error)) {
      return { rows: [], available: false };
    }

    throw error;
  }
}

export async function GET(request, context) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    const params = await context.params;
    const managerId = String(params.managerId || "").trim();

    if (!managerId) {
      return Response.json({ error: "managerId is required." }, { status: 400 });
    }

    const [manager, employeesResult, goalsResult, checkInsResult, updatesResult, approvalsResult] = await Promise.all([
      databases.getDocument(databaseId, appwriteConfig.usersCollectionId, managerId),
      databases.listDocuments(databaseId, appwriteConfig.usersCollectionId, [
        Query.equal("role", "employee"),
        Query.limit(200),
      ]),
      databases.listDocuments(databaseId, appwriteConfig.goalsCollectionId, [
        Query.orderDesc("$createdAt"),
        Query.limit(200),
      ]),
      databases.listDocuments(databaseId, appwriteConfig.checkInsCollectionId, [
        Query.orderDesc("scheduledAt"),
        Query.limit(200),
      ]),
      databases.listDocuments(databaseId, appwriteConfig.progressUpdatesCollectionId, [
        Query.orderDesc("$createdAt"),
        Query.limit(200),
      ]),
      listCheckInApprovals(databases),
    ]);

    let managerCycleRatings = [];
    let employeeCycleScores = [];
    try {
      const [managerCycleRatingsResult, employeeCycleScoresResult] = await Promise.all([
        databases.listDocuments(databaseId, appwriteConfig.managerCycleRatingsCollectionId, [
          Query.equal("managerId", managerId),
          Query.orderDesc("ratedAt"),
          Query.limit(50),
        ]),
        databases.listDocuments(databaseId, appwriteConfig.employeeCycleScoresCollectionId, [
          Query.equal("managerId", managerId),
          Query.orderDesc("computedAt"),
          Query.limit(200),
        ]),
      ]);

      managerCycleRatings = managerCycleRatingsResult.documents;
      employeeCycleScores = employeeCycleScoresResult.documents;
    } catch {
      managerCycleRatings = [];
      employeeCycleScores = [];
    }

    if (manager.role !== "manager") {
      return Response.json({ error: "Requested profile is not a manager." }, { status: 400 });
    }

    const employees = employeesResult.documents;
    const goals = goalsResult.documents;
    const checkIns = checkInsResult.documents;
    const updates = updatesResult.documents.map((item) => ({
      ...item,
      createdAt: item.createdAt || item.$createdAt,
    }));
    const latestReviewMap = latestReviewByCheckIn(approvalsResult.rows);

    const assignedIds = employees
      .filter((employee) => String(employee.managerId || "").trim() === managerId)
      .map((employee) => employee.$id);

    const fallbackIds = goals
      .filter((goal) => String(goal.managerId || "").trim() === managerId)
      .map((goal) => String(goal.employeeId || "").trim())
      .filter(Boolean);

    const teamIds = Array.from(new Set([...assignedIds, ...fallbackIds]));
    const employeesById = new Map(employees.map((item) => [item.$id, item]));

    const missingIds = teamIds.filter((id) => !employeesById.has(id));
    if (missingIds.length > 0) {
      const missingProfiles = await listUsersByIds(databases, missingIds);
      missingProfiles.forEach((item) => {
        employeesById.set(item.$id, item);
      });
    }

    const teamMembers = teamIds
      .map((id) => employeesById.get(id))
      .filter((item) => item && item.role === "employee")
      .map(mapUserSummary);

    const teamGoals = goals.filter(
      (goal) => String(goal.managerId || "").trim() === managerId && teamIds.includes(String(goal.employeeId || "").trim())
    );

    const managerCheckIns = checkIns.filter((item) => String(item.managerId || "").trim() === managerId);
    const completedCheckIns = managerCheckIns.filter((item) => item.status === "completed");
    const pendingCheckInApprovals = completedCheckIns.filter((item) => {
      const latest = latestReviewMap.get(item.$id);
      if (!latest) return true;
      return latest.decision === "needs_changes";
    }).length;

    const summary = {
      managerId: manager.$id,
      managerName: manager.name || "Unnamed",
      managerEmail: manager.email || "",
      teamSize: teamMembers.length,
      teamGoals: teamGoals.length,
      teamAverageProgress:
        teamGoals.length === 0
          ? 0
          : Math.round(teamGoals.reduce((sum, goal) => sum + toProgress(goal), 0) / teamGoals.length),
      plannedCheckIns: managerCheckIns.filter((item) => item.status === "planned").length,
      completedCheckIns: completedCheckIns.length,
      pendingManagerGoalApprovals: goals.filter(
        (goal) => String(goal.employeeId || "").trim() === managerId && goal.status === GOAL_STATUSES.SUBMITTED
      ).length,
      pendingCheckInApprovals,
      teamMembers,
      managerQuarterHistory: managerCycleRatings.map((item) => ({
        cycleId: item.cycleId,
        rating: Number(item.rating || 0),
        ratingLabel: item.ratingLabel || "",
        comments: item.comments || "",
        ratedAt: item.ratedAt,
      })),
    };

    const employeeRows = teamMembers.map((employee) => ({
      employee,
      goals: teamGoals.filter((goal) => String(goal.employeeId || "").trim() === employee.$id),
      progressUpdates: updates.filter((item) => String(item.employeeId || "").trim() === employee.$id),
      checkIns: managerCheckIns.filter((item) => String(item.employeeId || "").trim() === employee.$id),
      quarterHistory: employeeCycleScores
        .filter((item) => String(item.employeeId || "").trim() === employee.$id)
        .map((item) => ({
          cycleId: item.cycleId,
          scoreX100: Number(item.scoreX100 || 0),
          scoreLabel: item.scoreLabel || "",
          visibility: item.visibility || "hidden",
          computedAt: item.computedAt,
        })),
    }));

    return Response.json({
      data: {
        manager: mapUserSummary(manager),
        summary,
        employees: employeeRows,
      },
      meta: {
        checkInApprovalsCollectionAvailable: approvalsResult.available,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

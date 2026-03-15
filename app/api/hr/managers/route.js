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

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    const [managersResult, employeesResult, goalsResult, checkInsResult, approvalsResult] = await Promise.all([
      databases.listDocuments(databaseId, appwriteConfig.usersCollectionId, [
        Query.equal("role", "manager"),
        Query.orderAsc("name"),
        Query.limit(200),
      ]),
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
      listCheckInApprovals(databases),
    ]);

    const managers = managersResult.documents;
    const employees = employeesResult.documents;
    const goals = goalsResult.documents;
    const checkIns = checkInsResult.documents;
    const latestReviewMap = latestReviewByCheckIn(approvalsResult.rows);

    const employeesById = new Map(employees.map((item) => [item.$id, item]));

    const rows = [];

    for (const manager of managers) {
      const assignedIds = employees
        .filter((employee) => String(employee.managerId || "").trim() === manager.$id)
        .map((employee) => employee.$id);

      const fallbackIds = goals
        .filter((goal) => String(goal.managerId || "").trim() === manager.$id)
        .map((goal) => String(goal.employeeId || "").trim())
        .filter(Boolean);

      const teamIds = Array.from(new Set([...assignedIds, ...fallbackIds]));
      const missingIds = teamIds.filter((id) => !employeesById.has(id));

      let missingProfiles = [];
      if (missingIds.length > 0) {
        missingProfiles = await listUsersByIds(databases, missingIds);
        missingProfiles.forEach((item) => {
          employeesById.set(item.$id, item);
        });
      }

      const teamMembers = teamIds
        .map((id) => employeesById.get(id))
        .filter((item) => item && item.role === "employee")
        .map(mapUserSummary);

      const teamGoals = goals.filter(
        (goal) => String(goal.managerId || "").trim() === manager.$id && teamIds.includes(String(goal.employeeId || "").trim())
      );

      const managerSubmittedGoals = goals.filter(
        (goal) => String(goal.employeeId || "").trim() === manager.$id && goal.status === GOAL_STATUSES.SUBMITTED
      );

      const managerCheckIns = checkIns.filter(
        (item) => String(item.managerId || "").trim() === manager.$id
      );

      const completedCheckIns = managerCheckIns.filter((item) => item.status === "completed");
      const pendingCheckInApprovals = completedCheckIns.filter((item) => {
        const latest = latestReviewMap.get(item.$id);
        if (!latest) return true;
        return latest.decision === "needs_changes";
      }).length;

      const totalProgress = teamGoals.reduce((sum, goal) => sum + toProgress(goal), 0);
      const teamAverageProgress = teamGoals.length === 0 ? 0 : Math.round(totalProgress / teamGoals.length);

      rows.push({
        managerId: manager.$id,
        managerName: manager.name || "Unnamed",
        managerEmail: manager.email || "",
        teamSize: teamMembers.length,
        teamGoals: teamGoals.length,
        teamAverageProgress,
        plannedCheckIns: managerCheckIns.filter((item) => item.status === "planned").length,
        completedCheckIns: completedCheckIns.length,
        pendingManagerGoalApprovals: managerSubmittedGoals.length,
        pendingCheckInApprovals,
        teamMembers,
      });
    }

    return Response.json({
      data: rows,
      meta: {
        checkInApprovalsCollectionAvailable: approvalsResult.available,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

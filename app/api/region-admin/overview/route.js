import { appwriteConfig } from "@/lib/appwrite";
import { GOAL_STATUSES } from "@/lib/appwriteSchema";
import { Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { mapUserSummary } from "@/lib/teamAccess";

const PAGE_LIMIT = 100;

function toProgress(goal) {
  const numeric = Number(goal.progressPercent ?? goal.processPercent ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => String(b).localeCompare(String(a)));
}

async function listAllDocuments(databases, collectionId, queries = []) {
  const all = [];
  let cursor = null;

  while (true) {
    const nextQueries = [...queries, Query.limit(PAGE_LIMIT)];
    if (cursor) {
      nextQueries.push(Query.cursorAfter(cursor));
    }

    const response = await databases.listDocuments(databaseId, collectionId, nextQueries);
    const docs = response.documents || [];
    all.push(...docs);

    if (docs.length < PAGE_LIMIT) {
      break;
    }

    cursor = docs[docs.length - 1].$id;
  }

  return all;
}

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["leadership"]);

    const [users, goalsAll, updatesAll, checkInsAll] = await Promise.all([
      listAllDocuments(databases, appwriteConfig.usersCollectionId, [
        Query.equal("role", ["employee", "manager"]),
      ]),
      listAllDocuments(databases, appwriteConfig.goalsCollectionId, [
        Query.orderDesc("$createdAt"),
      ]),
      listAllDocuments(databases, appwriteConfig.progressUpdatesCollectionId, [
        Query.orderDesc("$createdAt"),
      ]),
      listAllDocuments(databases, appwriteConfig.checkInsCollectionId, [
        Query.orderDesc("scheduledAt"),
      ]),
    ]);

    const members = users;
    const managers = members.filter((item) => item.role === "manager");
    const employees = members.filter((item) => item.role === "employee");

    const managerIds = new Set(managers.map((item) => item.$id));
    const employeeIds = new Set(employees.map((item) => item.$id));
    const memberIds = new Set(members.map((item) => item.$id));

    const goals = goalsAll.filter((item) => {
      const managerId = String(item.managerId || "").trim();
      const employeeId = String(item.employeeId || "").trim();
      return managerIds.has(managerId) || memberIds.has(employeeId);
    });

    const goalIds = new Set(goals.map((item) => item.$id));

    const progressUpdates = updatesAll
      .filter((item) => {
        const goalId = String(item.goalId || "").trim();
        const employeeId = String(item.employeeId || "").trim();
        return goalIds.has(goalId) || memberIds.has(employeeId);
      })
      .map((item) => ({
        ...item,
        createdAt: item.createdAt || item.$createdAt,
      }));

    const checkIns = checkInsAll.filter((item) => {
      const managerId = String(item.managerId || "").trim();
      const employeeId = String(item.employeeId || "").trim();
      return managerIds.has(managerId) || memberIds.has(employeeId);
    });

    const rows = managers.map((manager) => {
      const assignedIds = employees
        .filter((employee) => String(employee.managerId || "").trim() === manager.$id)
        .map((employee) => employee.$id);

      const fallbackIds = goals
        .filter((goal) => String(goal.managerId || "").trim() === manager.$id)
        .map((goal) => String(goal.employeeId || "").trim())
        .filter((employeeId) => employeeIds.has(employeeId));

      const teamIds = Array.from(new Set([...assignedIds, ...fallbackIds]));
      const teamMembers = teamIds
        .map((id) => employees.find((employee) => employee.$id === id))
        .filter(Boolean)
        .map(mapUserSummary);

      const teamGoals = goals.filter(
        (goal) =>
          String(goal.managerId || "").trim() === manager.$id &&
          teamIds.includes(String(goal.employeeId || "").trim())
      );

      const managerSubmittedGoals = goals.filter(
        (goal) =>
          String(goal.employeeId || "").trim() === manager.$id &&
          goal.status === GOAL_STATUSES.SUBMITTED
      );

      const managerCheckIns = checkIns.filter((item) => String(item.managerId || "").trim() === manager.$id);
      const totalProgress = teamGoals.reduce((sum, goal) => sum + toProgress(goal), 0);
      const teamAverageProgress = teamGoals.length === 0 ? 0 : Math.round(totalProgress / teamGoals.length);

      return {
        managerId: manager.$id,
        managerName: manager.name || "Unnamed",
        managerEmail: manager.email || "",
        teamSize: teamMembers.length,
        teamGoals: teamGoals.length,
        teamAverageProgress,
        plannedCheckIns: managerCheckIns.filter((item) => item.status === "planned").length,
        completedCheckIns: managerCheckIns.filter((item) => item.status === "completed").length,
        pendingManagerGoalApprovals: managerSubmittedGoals.length,
        pendingCheckInApprovals: 0,
        teamMembers,
      };
    });

    return Response.json({
      data: {
        region: "all",
        managers: rows,
        goals,
        progressUpdates,
        members: members.map(mapUserSummary),
        checkIns,
        cycles: uniqueSorted(goals.map((goal) => String(goal.cycleId || "").trim())),
        deprecated: true,
        redirectTo: "/api/leadership/overview",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

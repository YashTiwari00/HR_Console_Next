import { appwriteConfig } from "@/lib/appwrite";
import { GOAL_STATUSES } from "@/lib/appwriteSchema";
import { Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { listLeadershipMetricDefinitions } from "@/app/api/leadership/_lib/metricRegistry";

const PAGE_LIMIT = 100;

function toProgress(goal) {
  const numeric = Number(goal?.progressPercent ?? goal?.processPercent ?? 0);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : 0;
}

function toCheckInRate(checkIns) {
  const rows = Array.isArray(checkIns) ? checkIns : [];
  const completed = rows.filter((item) => String(item?.status || "") === "completed").length;
  const planned = rows.filter((item) => String(item?.status || "") === "planned").length;
  const denominator = completed + planned;
  if (denominator === 0) return 0;
  return Math.round((completed / denominator) * 100);
}

function safeDepartment(value) {
  return String(value || "").trim() || "Unassigned";
}

function isAtRiskGoal(goal, latestUpdateByGoalId) {
  if (String(goal?.status || "") === GOAL_STATUSES.CLOSED) {
    return false;
  }

  const progress = toProgress(goal);
  if (progress < 45) {
    return true;
  }

  const latest = latestUpdateByGoalId.get(String(goal?.$id || "").trim());
  return String(latest?.ragStatus || "").trim() === "behind";
}

function round(value) {
  return Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) / 100 : 0;
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

    const [users, goals, progressUpdates, checkIns] = await Promise.all([
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
        Query.orderDesc("$createdAt"),
      ]),
    ]);

    const employees = users.filter((item) => String(item?.role || "") === "employee");
    const managers = users.filter((item) => String(item?.role || "") === "manager");

    const employeeIds = new Set(employees.map((item) => String(item.$id || "").trim()).filter(Boolean));
    const managerIds = new Set(managers.map((item) => String(item.$id || "").trim()).filter(Boolean));

    const scopedGoals = goals.filter((goal) => {
      const employeeId = String(goal?.employeeId || "").trim();
      const managerId = String(goal?.managerId || "").trim();
      return employeeIds.has(employeeId) || managerIds.has(managerId);
    });

    const goalIds = new Set(scopedGoals.map((goal) => String(goal.$id || "").trim()).filter(Boolean));

    const scopedUpdates = progressUpdates
      .filter((item) => goalIds.has(String(item?.goalId || "").trim()))
      .map((item) => ({
        ...item,
        createdAt: item.createdAt || item.$createdAt,
      }));

    const latestUpdateByGoalId = new Map();
    for (const item of scopedUpdates) {
      const goalId = String(item?.goalId || "").trim();
      if (!goalId) continue;
      const current = latestUpdateByGoalId.get(goalId);
      const nextTs = new Date(item.createdAt || 0).valueOf();
      const currentTs = new Date(current?.createdAt || 0).valueOf();
      if (!current || nextTs > currentTs) {
        latestUpdateByGoalId.set(goalId, item);
      }
    }

    const scopedCheckIns = checkIns.filter((item) => {
      const employeeId = String(item?.employeeId || "").trim();
      const managerId = String(item?.managerId || "").trim();
      return employeeIds.has(employeeId) || managerIds.has(managerId);
    });

    const activeGoals = scopedGoals.filter((goal) => String(goal?.status || "") !== GOAL_STATUSES.CLOSED);
    const activeGoalProgress = activeGoals.map((goal) => toProgress(goal));
    const avgProgressPercent =
      activeGoalProgress.length > 0
        ? round(activeGoalProgress.reduce((sum, value) => sum + value, 0) / activeGoalProgress.length)
        : 0;

    const atRiskGoals = activeGoals.filter((goal) => isAtRiskGoal(goal, latestUpdateByGoalId));

    const memberById = new Map(users.map((item) => [String(item.$id || "").trim(), item]));

    const byCycle = new Map();
    for (const goal of scopedGoals) {
      const cycleId = String(goal?.cycleId || "").trim() || "unknown";
      const bucket = byCycle.get(cycleId) || {
        goals: [],
        checkIns: [],
      };
      bucket.goals.push(goal);
      byCycle.set(cycleId, bucket);
    }

    for (const item of scopedCheckIns) {
      const cycleFromGoal = (() => {
        const goalId = String(item?.goalId || "").trim();
        if (!goalId) return "unknown";
        const match = scopedGoals.find((goal) => String(goal.$id || "").trim() === goalId);
        return String(match?.cycleId || "").trim() || "unknown";
      })();

      const bucket = byCycle.get(cycleFromGoal) || {
        goals: [],
        checkIns: [],
      };
      bucket.checkIns.push(item);
      byCycle.set(cycleFromGoal, bucket);
    }

    const trendsByCycle = Array.from(byCycle.entries())
      .map(([cycleId, bucket]) => {
        const cycleGoals = bucket.goals.filter(
          (goal) => String(goal?.status || "") !== GOAL_STATUSES.CLOSED
        );
        const progressList = cycleGoals.map((goal) => toProgress(goal));
        const atRisk = cycleGoals.filter((goal) => isAtRiskGoal(goal, latestUpdateByGoalId)).length;

        return {
          cycleId,
          goals: cycleGoals.length,
          avgProgressPercent:
            progressList.length > 0
              ? round(progressList.reduce((sum, value) => sum + value, 0) / progressList.length)
              : 0,
          checkInCompletionRate: toCheckInRate(bucket.checkIns),
          atRiskGoals: atRisk,
        };
      })
      .sort((a, b) => b.cycleId.localeCompare(a.cycleId));

    const byDepartment = new Map();

    for (const employee of employees) {
      const department = safeDepartment(employee?.department);
      const bucket = byDepartment.get(department) || {
        department,
        employees: 0,
        managers: 0,
        goals: [],
        checkIns: [],
      };
      bucket.employees += 1;
      byDepartment.set(department, bucket);
    }

    for (const manager of managers) {
      const department = safeDepartment(manager?.department);
      const bucket = byDepartment.get(department) || {
        department,
        employees: 0,
        managers: 0,
        goals: [],
        checkIns: [],
      };
      bucket.managers += 1;
      byDepartment.set(department, bucket);
    }

    for (const goal of activeGoals) {
      const employee = memberById.get(String(goal?.employeeId || "").trim());
      const manager = memberById.get(String(goal?.managerId || "").trim());
      const department = safeDepartment(employee?.department || manager?.department);
      const bucket = byDepartment.get(department) || {
        department,
        employees: 0,
        managers: 0,
        goals: [],
        checkIns: [],
      };
      bucket.goals.push(goal);
      byDepartment.set(department, bucket);
    }

    for (const item of scopedCheckIns) {
      const employee = memberById.get(String(item?.employeeId || "").trim());
      const manager = memberById.get(String(item?.managerId || "").trim());
      const department = safeDepartment(employee?.department || manager?.department);
      const bucket = byDepartment.get(department) || {
        department,
        employees: 0,
        managers: 0,
        goals: [],
        checkIns: [],
      };
      bucket.checkIns.push(item);
      byDepartment.set(department, bucket);
    }

    const departmentRows = Array.from(byDepartment.values())
      .map((bucket) => {
        const progressList = bucket.goals.map((goal) => toProgress(goal));
        return {
          department: bucket.department,
          employees: bucket.employees,
          managers: bucket.managers,
          goals: bucket.goals.length,
          avgProgressPercent:
            progressList.length > 0
              ? round(progressList.reduce((sum, value) => sum + value, 0) / progressList.length)
              : 0,
          checkInCompletionRate: toCheckInRate(bucket.checkIns),
          atRiskGoals: bucket.goals.filter((goal) => isAtRiskGoal(goal, latestUpdateByGoalId)).length,
        };
      })
      .sort((a, b) => b.atRiskGoals - a.atRiskGoals || a.department.localeCompare(b.department));

    const managerScoreBands = {
      strong: 0,
      watch: 0,
      critical: 0,
    };

    for (const manager of managers) {
      const managerId = String(manager?.$id || "").trim();
      const managerCheckIns = scopedCheckIns.filter(
        (item) => String(item?.managerId || "").trim() === managerId
      );
      const score = toCheckInRate(managerCheckIns);

      if (score >= 75) {
        managerScoreBands.strong += 1;
      } else if (score >= 45) {
        managerScoreBands.watch += 1;
      } else {
        managerScoreBands.critical += 1;
      }
    }

    return Response.json({
      data: {
        summary: {
          employees: employees.length,
          managers: managers.length,
          departments: departmentRows.length,
          activeGoals: activeGoals.length,
          avgProgressPercent,
          checkInCompletionRate: toCheckInRate(scopedCheckIns),
          atRiskGoals: atRiskGoals.length,
          activeCycles: trendsByCycle.filter((item) => item.cycleId !== "unknown").length,
        },
        trendsByCycle,
        departmentRows,
        managerQualityBands: [
          { band: "strong", managers: managerScoreBands.strong },
          { band: "watch", managers: managerScoreBands.watch },
          { band: "critical", managers: managerScoreBands.critical },
        ],
        metricDefinitions: listLeadershipMetricDefinitions(),
        asOf: new Date().toISOString(),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

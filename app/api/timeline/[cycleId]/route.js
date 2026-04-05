import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { emitTimelineTelemetry } from "@/lib/telemetry/timeline";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertManagerCanAccessEmployee } from "@/lib/teamAccess";
import { resolveTimelineState } from "@/lib/workflow/timelineState";

function dedupeById(documents) {
  const seen = new Set();
  const merged = [];

  for (const document of documents) {
    if (!seen.has(document.$id)) {
      seen.add(document.$id);
      merged.push(document);
    }
  }

  return merged;
}

function sortByTimestampDesc(items) {
  return [...items].sort((a, b) => {
    const first = new Date(a.at || 0).valueOf();
    const second = new Date(b.at || 0).valueOf();
    return second - first;
  });
}

function buildGoalEvents(goals) {
  const events = [];

  for (const goal of goals) {
    events.push({
      id: `goal-created-${goal.$id}`,
      type: "goal_created",
      at: goal.$createdAt,
      goalId: goal.$id,
      employeeId: goal.employeeId,
      managerId: goal.managerId,
      cycleId: goal.cycleId,
      payload: {
        title: goal.title,
        status: goal.status,
        frameworkType: goal.frameworkType,
      },
    });

    if (goal.$updatedAt && goal.$updatedAt !== goal.$createdAt) {
      events.push({
        id: `goal-updated-${goal.$id}`,
        type: "goal_updated",
        at: goal.$updatedAt,
        goalId: goal.$id,
        employeeId: goal.employeeId,
        managerId: goal.managerId,
        cycleId: goal.cycleId,
        payload: {
          status: goal.status,
          progressPercent: goal.progressPercent ?? goal.processPercent ?? 0,
        },
      });
    }
  }

  return events;
}

function buildProgressEvents(progressRows) {
  return progressRows.map((item) => ({
    id: `progress-${item.$id}`,
    type: "progress_updated",
    at: item.createdAt || item.$createdAt,
    goalId: item.goalId,
    employeeId: item.employeeId,
    managerId: item.managerId,
    cycleId: item.cycleId,
    payload: {
      percentComplete: item.percentComplete,
      ragStatus: item.ragStatus,
    },
  }));
}

function buildCheckInEvents(checkIns) {
  const events = [];

  for (const item of checkIns) {
    events.push({
      id: `checkin-planned-${item.$id}`,
      type: "checkin_planned",
      at: item.scheduledAt || item.$createdAt,
      goalId: item.goalId,
      employeeId: item.employeeId,
      managerId: item.managerId,
      cycleId: item.cycleId,
      payload: {
        status: item.status,
        isFinalCheckIn: Boolean(item.isFinalCheckIn),
      },
    });

    if (String(item.status || "") === "completed") {
      events.push({
        id: `checkin-completed-${item.$id}`,
        type: "checkin_completed",
        at: item.$updatedAt || item.scheduledAt || item.$createdAt,
        goalId: item.goalId,
        employeeId: item.employeeId,
        managerId: item.managerId,
        cycleId: item.cycleId,
        payload: {
          managerRating: item.managerRating ?? null,
        },
      });
    }
  }

  return events;
}

async function listGoalsByRole({ databases, profile, employeeId, scope }) {
  if (profile.role === "employee") {
    const result = await databases.listDocuments(
      databaseId,
      appwriteConfig.goalsCollectionId,
      [
        Query.equal("employeeId", profile.$id),
        Query.orderDesc("$createdAt"),
        Query.limit(250),
      ]
    );

    return result.documents;
  }

  if (profile.role === "manager") {
    await assertManagerCanAccessEmployee(databases, profile.$id, employeeId);

    if (scope === "self") {
      const result = await databases.listDocuments(
        databaseId,
        appwriteConfig.goalsCollectionId,
        [
          Query.equal("employeeId", profile.$id),
          Query.orderDesc("$createdAt"),
          Query.limit(250),
        ]
      );

      return result.documents;
    }

    if (scope === "all") {
      const [selfResult, teamResult] = await Promise.all([
        databases.listDocuments(databaseId, appwriteConfig.goalsCollectionId, [
          Query.equal("employeeId", profile.$id),
          Query.orderDesc("$createdAt"),
          Query.limit(250),
        ]),
        databases.listDocuments(databaseId, appwriteConfig.goalsCollectionId, [
          Query.equal("managerId", profile.$id),
          Query.orderDesc("$createdAt"),
          Query.limit(250),
        ]),
      ]);

      return dedupeById([...selfResult.documents, ...teamResult.documents]);
    }

    const result = await databases.listDocuments(
      databaseId,
      appwriteConfig.goalsCollectionId,
      [
        Query.equal("managerId", profile.$id),
        Query.orderDesc("$createdAt"),
        Query.limit(250),
      ]
    );

    return result.documents;
  }

  const result = await databases.listDocuments(
    databaseId,
    appwriteConfig.goalsCollectionId,
    [Query.orderDesc("$createdAt"), Query.limit(300)]
  );

  return result.documents;
}

async function listProgressByScope({ databases, profile, goalIds, scope }) {
  if (goalIds.length === 0) return [];

  if (profile.role === "employee" || (profile.role === "manager" && scope === "self")) {
    const result = await databases.listDocuments(
      databaseId,
      appwriteConfig.progressUpdatesCollectionId,
      [
        Query.equal("employeeId", profile.$id),
        Query.orderDesc("$createdAt"),
        Query.limit(250),
      ]
    );

    return result.documents;
  }

  const result = await databases.listDocuments(
    databaseId,
    appwriteConfig.progressUpdatesCollectionId,
    [
      Query.equal("goalId", goalIds),
      Query.orderDesc("$createdAt"),
      Query.limit(300),
    ]
  );

  return result.documents;
}

async function listCheckInsByScope({ databases, profile, goalIds, scope }) {
  if (profile.role === "employee") {
    const result = await databases.listDocuments(
      databaseId,
      appwriteConfig.checkInsCollectionId,
      [
        Query.equal("employeeId", profile.$id),
        Query.orderDesc("scheduledAt"),
        Query.limit(250),
      ]
    );

    return result.documents;
  }

  if (profile.role === "manager") {
    if (scope === "self") {
      const result = await databases.listDocuments(
        databaseId,
        appwriteConfig.checkInsCollectionId,
        [
          Query.equal("employeeId", profile.$id),
          Query.orderDesc("scheduledAt"),
          Query.limit(250),
        ]
      );

      return result.documents;
    }

    if (scope === "all") {
      const [selfResult, teamResult] = await Promise.all([
        databases.listDocuments(databaseId, appwriteConfig.checkInsCollectionId, [
          Query.equal("employeeId", profile.$id),
          Query.orderDesc("scheduledAt"),
          Query.limit(250),
        ]),
        databases.listDocuments(databaseId, appwriteConfig.checkInsCollectionId, [
          Query.equal("managerId", profile.$id),
          Query.orderDesc("scheduledAt"),
          Query.limit(250),
        ]),
      ]);

      return dedupeById([...selfResult.documents, ...teamResult.documents]);
    }

    const result = await databases.listDocuments(
      databaseId,
      appwriteConfig.checkInsCollectionId,
      [
        Query.equal("managerId", profile.$id),
        Query.orderDesc("scheduledAt"),
        Query.limit(250),
      ]
    );

    return result.documents;
  }

  if (goalIds.length === 0) return [];

  const result = await databases.listDocuments(
    databaseId,
    appwriteConfig.checkInsCollectionId,
    [Query.equal("goalId", goalIds), Query.orderDesc("scheduledAt"), Query.limit(300)]
  );

  return result.documents;
}

export async function GET(request, context) {
  let cycleId = "";

  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "hr"]);

    const params = await context.params;
    cycleId = String(params?.cycleId || "").trim();

    if (!cycleId) {
      return Response.json({ error: "cycleId path parameter is required." }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const employeeId = String(searchParams.get("employeeId") || "").trim();
    const scope = String(searchParams.get("scope") || "team").trim();
    const includeEvents = String(searchParams.get("includeEvents") || "true").toLowerCase() !== "false";
    const limit = Math.max(1, Math.min(400, Number.parseInt(searchParams.get("limit") || "200", 10) || 200));

    if (profile.role === "employee" && employeeId && employeeId !== profile.$id) {
      return Response.json({ error: "Forbidden for requested employee." }, { status: 403 });
    }

    const goals = await listGoalsByRole({ databases, profile, employeeId, scope });
    let filteredGoals = goals.filter((item) => String(item.cycleId || "") === cycleId);

    if (employeeId) {
      filteredGoals = filteredGoals.filter((item) => String(item.employeeId || "") === employeeId);
    }

    const goalIds = filteredGoals.map((item) => String(item.$id || "")).filter(Boolean);

    const [progressRows, checkIns] = await Promise.all([
      listProgressByScope({ databases, profile, goalIds, scope }),
      listCheckInsByScope({ databases, profile, goalIds, scope }),
    ]);

    const goalIdSet = new Set(goalIds);
    const filteredProgress = progressRows.filter((item) => goalIdSet.has(String(item.goalId || "")));
    const filteredCheckIns = checkIns.filter((item) => goalIdSet.has(String(item.goalId || "")));

    const state = resolveTimelineState({
      goals: filteredGoals,
      checkIns: filteredCheckIns,
      cycleId,
    });

    const events = includeEvents
      ? sortByTimestampDesc([
          ...buildGoalEvents(filteredGoals),
          ...buildProgressEvents(filteredProgress),
          ...buildCheckInEvents(filteredCheckIns),
        ]).slice(0, limit)
      : [];

    emitTimelineTelemetry("timeline.aggregate.read", {
      role: profile.role,
      userId: profile.$id,
      cycleId,
      scope,
      includeEvents,
      currentStage: state.currentStage,
      counts: {
        goals: filteredGoals.length,
        progress: filteredProgress.length,
        checkIns: filteredCheckIns.length,
      },
    });

    return Response.json({
      data: {
        cycleId,
        state,
        events,
      },
      meta: {
        sourceCounts: {
          goals: filteredGoals.length,
          progressUpdates: filteredProgress.length,
          checkIns: filteredCheckIns.length,
        },
      },
    });
  } catch (error) {
    emitTimelineTelemetry("timeline.aggregate.error", {
      cycleId,
      message: String(error?.message || "Timeline aggregate failed"),
    });

    return errorResponse(error);
  }
}

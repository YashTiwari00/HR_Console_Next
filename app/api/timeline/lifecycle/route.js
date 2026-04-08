import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { parseStringList } from "@/lib/meetingIntelligence";
import { listMeetingIntelligenceMap } from "@/lib/meetingIntelligenceStore";
import { applyMeetingMetadataMap, listMeetingMetadataMap } from "@/lib/meetingMetadataStore";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertManagerCanAccessEmployee } from "@/lib/teamAccess";

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
        weightage: goal.weightage,
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
          title: goal.title,
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
      updateText: item.updateText,
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
          status: item.status,
          managerRating: item.managerRating ?? null,
        },
      });

      if (
        Boolean(item.isFinalCheckIn) &&
        String(item.selfReviewStatus || "") === "submitted"
      ) {
        events.push({
          id: `self-review-submitted-${item.$id}`,
          type: "self_review_submitted",
          at: item.selfReviewSubmittedAt || item.$updatedAt || item.$createdAt,
          goalId: item.goalId,
          employeeId: item.employeeId,
          managerId: item.managerId,
          cycleId: item.cycleId,
          payload: {
            status: item.selfReviewStatus,
          },
        });
      }
    }
  }

  return events;
}

function buildMeetingEvents(meetings, intelligenceMap) {
  const events = [];

  for (const meeting of meetings) {
    const linkedGoalIds = parseStringList(meeting?.linkedGoalIds);
    const meetingAt =
      meeting?.scheduledStartTime ||
      meeting?.startTime ||
      meeting?.requestedAt ||
      meeting?.$createdAt;

    events.push({
      id: `meeting-scheduled-${meeting.$id}`,
      type: "meeting_scheduled",
      at: meetingAt,
      goalId: linkedGoalIds[0],
      employeeId: meeting.employeeId,
      managerId: meeting.managerId,
      cycleId: meeting.cycleId,
      payload: {
        title: meeting.title,
        status: meeting.status,
        meetingType: meeting.meetingType || "individual",
        linkedGoalIds,
      },
    });

    const generatedAt = String(meeting?.intelligenceGeneratedAt || "").trim();
    if (generatedAt) {
      const intelligence = intelligenceMap?.get(String(meeting.$id || "").trim()) || null;
      events.push({
        id: `meeting-intel-${meeting.$id}`,
        type: "meeting_intelligence_ready",
        at: generatedAt,
        goalId: linkedGoalIds[0],
        employeeId: meeting.employeeId,
        managerId: meeting.managerId,
        cycleId: meeting.cycleId,
        payload: {
          title: meeting.title,
          status: meeting.status,
          summary:
            String(intelligence?.summary || "").trim() ||
            String(meeting?.intelligenceSummary || "").trim(),
          linkedGoalIds,
        },
      });
    }
  }

  return events;
}

async function listMeetingsByScope({ databases, profile, employeeId, scope }) {
  const base = [Query.orderDesc("requestedAt"), Query.limit(300)];

  try {
    if (profile.role === "employee") {
      const result = await databases.listDocuments(
        databaseId,
        appwriteConfig.googleMeetRequestsCollectionId,
        [Query.equal("employeeId", profile.$id), ...base]
      );
      return result.documents;
    }

    if (profile.role === "manager") {
      await assertManagerCanAccessEmployee(databases, profile.$id, employeeId);

      if (scope === "self") {
        const result = await databases.listDocuments(
          databaseId,
          appwriteConfig.googleMeetRequestsCollectionId,
          [Query.equal("employeeId", profile.$id), ...base]
        );
        return result.documents;
      }

      if (scope === "all") {
        const [selfRows, teamRows] = await Promise.all([
          databases.listDocuments(databaseId, appwriteConfig.googleMeetRequestsCollectionId, [
            Query.equal("employeeId", profile.$id),
            ...base,
          ]),
          databases.listDocuments(databaseId, appwriteConfig.googleMeetRequestsCollectionId, [
            Query.equal("managerId", profile.$id),
            ...base,
          ]),
        ]);

        return dedupeById([...selfRows.documents, ...teamRows.documents]);
      }

      const result = await databases.listDocuments(
        databaseId,
        appwriteConfig.googleMeetRequestsCollectionId,
        [Query.equal("managerId", profile.$id), ...base]
      );
      return result.documents;
    }

    const result = await databases.listDocuments(
      databaseId,
      appwriteConfig.googleMeetRequestsCollectionId,
      base
    );
    return result.documents;
  } catch (error) {
    const message = String(error?.message || "").toLowerCase();
    if (!message.includes("attribute not found in schema: requestedat")) {
      throw error;
    }

    const fallbackBase = [Query.orderDesc("$createdAt"), Query.limit(300)];
    if (profile.role === "employee") {
      const result = await databases.listDocuments(
        databaseId,
        appwriteConfig.googleMeetRequestsCollectionId,
        [Query.equal("employeeId", profile.$id), ...fallbackBase]
      );
      return result.documents;
    }

    if (profile.role === "manager") {
      if (scope === "self") {
        const result = await databases.listDocuments(
          databaseId,
          appwriteConfig.googleMeetRequestsCollectionId,
          [Query.equal("employeeId", profile.$id), ...fallbackBase]
        );
        return result.documents;
      }

      if (scope === "all") {
        const [selfRows, teamRows] = await Promise.all([
          databases.listDocuments(databaseId, appwriteConfig.googleMeetRequestsCollectionId, [
            Query.equal("employeeId", profile.$id),
            ...fallbackBase,
          ]),
          databases.listDocuments(databaseId, appwriteConfig.googleMeetRequestsCollectionId, [
            Query.equal("managerId", profile.$id),
            ...fallbackBase,
          ]),
        ]);
        return dedupeById([...selfRows.documents, ...teamRows.documents]);
      }

      const result = await databases.listDocuments(
        databaseId,
        appwriteConfig.googleMeetRequestsCollectionId,
        [Query.equal("managerId", profile.$id), ...fallbackBase]
      );
      return result.documents;
    }

    const result = await databases.listDocuments(
      databaseId,
      appwriteConfig.googleMeetRequestsCollectionId,
      fallbackBase
    );
    return result.documents;
  }
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

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "hr"]);

    const { searchParams } = new URL(request.url);
    const cycleId = String(searchParams.get("cycleId") || "").trim();
    const goalId = String(searchParams.get("goalId") || "").trim();
    const employeeId = String(searchParams.get("employeeId") || "").trim();
    const limit = Math.max(1, Math.min(400, Number.parseInt(searchParams.get("limit") || "200", 10) || 200));
    const scope = String(searchParams.get("scope") || "team").trim();

    if (profile.role === "employee" && employeeId && employeeId !== profile.$id) {
      return Response.json({ error: "Forbidden for requested employee." }, { status: 403 });
    }

    const goals = await listGoalsByRole({ databases, profile, employeeId, scope });

    let filteredGoals = goals;

    if (cycleId) {
      filteredGoals = filteredGoals.filter((item) => String(item.cycleId || "") === cycleId);
    }

    if (goalId) {
      filteredGoals = filteredGoals.filter((item) => String(item.$id || "") === goalId);
    }

    if (employeeId) {
      filteredGoals = filteredGoals.filter((item) => String(item.employeeId || "") === employeeId);
    }

    const goalIds = filteredGoals.map((item) => String(item.$id || "")).filter(Boolean);

    const [progressRows, checkIns, meetings] = await Promise.all([
      listProgressByScope({ databases, profile, goalIds, scope }),
      listCheckInsByScope({ databases, profile, goalIds, scope }),
      listMeetingsByScope({ databases, profile, employeeId, scope }),
    ]);

    const meetingMetadataMap = await listMeetingMetadataMap(
      databases,
      meetings.map((item) => String(item.$id || "").trim())
    );
    const meetingsWithMetadata = applyMeetingMetadataMap(meetings, meetingMetadataMap);

    const progressByGoal = new Set(goalIds);
    const filteredProgress = progressRows.filter((item) => progressByGoal.has(String(item.goalId || "")));
    const filteredCheckIns = checkIns.filter((item) => progressByGoal.has(String(item.goalId || "")));
    const filteredMeetings = meetingsWithMetadata.filter((item) => {
      if (employeeId && String(item.employeeId || "") !== employeeId) return false;

      const linkedGoalIds = parseStringList(item?.linkedGoalIds);
      if (goalId) {
        return linkedGoalIds.includes(goalId);
      }

      if (goalIds.length > 0) {
        return linkedGoalIds.some((id) => progressByGoal.has(id));
      }

      return true;
    });

    const intelligenceMap = await listMeetingIntelligenceMap(
      databases,
      filteredMeetings.map((item) => String(item.$id || "").trim())
    );

    const allEvents = [
      ...buildGoalEvents(filteredGoals),
      ...buildProgressEvents(filteredProgress),
      ...buildCheckInEvents(filteredCheckIns),
      ...buildMeetingEvents(filteredMeetings, intelligenceMap),
    ];

    const sorted = sortByTimestampDesc(allEvents).slice(0, limit);

    return Response.json({
      data: sorted,
      meta: {
        total: sorted.length,
        sourceCounts: {
          goals: filteredGoals.length,
          progressUpdates: filteredProgress.length,
          checkIns: filteredCheckIns.length,
          meetings: filteredMeetings.length,
        },
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

import { appwriteConfig } from "@/lib/appwrite";
import { CHECKIN_STATUSES, GOAL_STATUSES } from "@/lib/appwriteSchema";
import { ID, Query, databaseId } from "@/lib/appwriteServer";
import { buildCheckInCode } from "@/lib/cycle";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertManagerCanAccessEmployee, getManagerTeamEmployeeIds } from "@/lib/teamAccess";
import { getManagerRatingGate } from "@/lib/workflow/selfReviewGate";

const VALID_STATUSES = Object.values(CHECKIN_STATUSES);

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

function isMissingCollectionError(error, collectionId) {
  const message = String(error?.message || "").toLowerCase();
  const normalizedCollection = String(collectionId || "").toLowerCase();

  return (
    message.includes("collection") &&
    message.includes("requested id") &&
    message.includes("could not be found") &&
    (!normalizedCollection || message.includes(normalizedCollection))
  );
}

async function listCheckInApprovalsSafe(databases) {
  try {
    const response = await databases.listDocuments(
      databaseId,
      appwriteConfig.checkInApprovalsCollectionId,
      [Query.orderDesc("decidedAt"), Query.limit(400)]
    );

    return response.documents;
  } catch (error) {
    if (isMissingCollectionError(error, appwriteConfig.checkInApprovalsCollectionId)) {
      return [];
    }

    throw error;
  }
}

async function listManagerCycleRatingsSafe(databases) {
  try {
    const response = await databases.listDocuments(
      databaseId,
      appwriteConfig.managerCycleRatingsCollectionId,
      [Query.orderDesc("ratedAt"), Query.limit(400)]
    );

    return response.documents;
  } catch (error) {
    if (isMissingCollectionError(error, appwriteConfig.managerCycleRatingsCollectionId)) {
      return [];
    }

    throw error;
  }
}

async function listGoalSelfReviewsSafe(databases, goalIds) {
  if (!Array.isArray(goalIds) || goalIds.length === 0) return [];

  try {
    const response = await databases.listDocuments(
      databaseId,
      appwriteConfig.goalSelfReviewsCollectionId,
      [Query.equal("goalId", goalIds), Query.limit(500)]
    );

    return response.documents;
  } catch (error) {
    if (isMissingCollectionError(error, appwriteConfig.goalSelfReviewsCollectionId)) {
      return [];
    }

    throw error;
  }
}

async function listGoalCyclesSafe(databases, cycleIds) {
  if (!Array.isArray(cycleIds) || cycleIds.length === 0) return [];

  try {
    const response = await databases.listDocuments(
      databaseId,
      appwriteConfig.goalCyclesCollectionId,
      [Query.equal("name", cycleIds), Query.limit(200)]
    );

    return response.documents;
  } catch (error) {
    if (isMissingCollectionError(error, appwriteConfig.goalCyclesCollectionId)) {
      return [];
    }

    throw error;
  }
}

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "leadership", "hr"]);

    const { searchParams } = new URL(request.url);
    const goalId = searchParams.get("goalId");
    const employeeId = (searchParams.get("employeeId") || "").trim();

    const scope = (searchParams.get("scope") || "team").trim();

    let documents = [];

    if (profile.role === "employee") {
      if (employeeId && employeeId !== profile.$id) {
        return Response.json({ error: "Forbidden for requested employee." }, { status: 403 });
      }

      const result = await databases.listDocuments(
        databaseId,
        appwriteConfig.checkInsCollectionId,
        [
          Query.equal("employeeId", profile.$id),
          Query.orderDesc("scheduledAt"),
          Query.limit(100),
        ]
      );
      documents = result.documents;
    } else if (profile.role === "manager" || profile.role === "leadership") {
      await assertManagerCanAccessEmployee(databases, profile.$id, employeeId);
      const teamEmployeeIds = await getManagerTeamEmployeeIds(databases, profile.$id, {
        includeFallback: true,
      });

      if (scope === "self") {
        const selfResult = await databases.listDocuments(
          databaseId,
          appwriteConfig.checkInsCollectionId,
          [
            Query.equal("employeeId", profile.$id),
            Query.orderDesc("scheduledAt"),
            Query.limit(100),
          ]
        );
        documents = selfResult.documents;
      } else if (scope === "all") {
        const [selfResult, teamResult] = await Promise.all([
          databases.listDocuments(databaseId, appwriteConfig.checkInsCollectionId, [
            Query.equal("employeeId", profile.$id),
            Query.orderDesc("scheduledAt"),
            Query.limit(100),
          ]),
          teamEmployeeIds.length > 0
            ? databases.listDocuments(databaseId, appwriteConfig.checkInsCollectionId, [
                Query.equal("employeeId", teamEmployeeIds),
                Query.orderDesc("scheduledAt"),
                Query.limit(100),
              ])
            : Promise.resolve({ documents: [] }),
        ]);

        const merged = [...selfResult.documents];
        const ids = new Set(selfResult.documents.map((item) => item.$id));

        for (const item of teamResult.documents) {
          if (!ids.has(item.$id)) {
            ids.add(item.$id);
            merged.push(item);
          }
        }

        documents = merged;
      } else {
        if (teamEmployeeIds.length === 0) {
          documents = [];
        } else {
        const teamResult = await databases.listDocuments(
          databaseId,
          appwriteConfig.checkInsCollectionId,
          [
            Query.equal("employeeId", teamEmployeeIds),
            Query.orderDesc("scheduledAt"),
            Query.limit(100),
          ]
        );
        documents = teamResult.documents;
        }
      }
    } else {
      const result = await databases.listDocuments(
        databaseId,
        appwriteConfig.checkInsCollectionId,
        [Query.orderDesc("scheduledAt"), Query.limit(100)]
      );
      documents = result.documents;
    }

    if (goalId) {
      documents = documents.filter((item) => item.goalId === goalId);
    }

    if (employeeId) {
      documents = documents.filter((item) => item.employeeId === employeeId);
    }

    const goalIds = Array.from(new Set(documents.map((item) => String(item.goalId || "").trim()).filter(Boolean)));
    const goalById = new Map();

    const [approvalRows, managerCycleRatings, goalSelfReviews] = await Promise.all([
      listCheckInApprovalsSafe(databases),
      listManagerCycleRatingsSafe(databases),
      listGoalSelfReviewsSafe(databases, goalIds),
    ]);

    const latestReviewMap = latestReviewByCheckIn(approvalRows);
    const managerRatingByCycle = new Map();
    const goalSelfReviewById = new Map();
    const goalSelfReviewByKey = new Map();

    for (const row of managerCycleRatings) {
      const key = `${String(row.managerId || "").trim()}|${String(row.cycleId || "").trim()}`;
      if (!key.trim()) continue;
      if (!managerRatingByCycle.has(key)) {
        managerRatingByCycle.set(key, row);
      }
    }

    for (const row of goalSelfReviews) {
      const id = String(row.$id || "").trim();
      if (id) {
        goalSelfReviewById.set(id, row);
      }

      const key = `${String(row.employeeId || "").trim()}|${String(row.goalId || "").trim()}|${String(row.cycleId || "").trim()}`;
      if (key.trim() && !goalSelfReviewByKey.has(key)) {
        goalSelfReviewByKey.set(key, row);
      }
    }

    if (goalIds.length > 0) {
      const goalRows = await databases.listDocuments(databaseId, appwriteConfig.goalsCollectionId, [
        Query.equal("$id", goalIds),
        Query.limit(200),
      ]);

      goalRows.documents.forEach((goal) => {
        goalById.set(goal.$id, goal);
      });
    }

    const cycleIds = Array.from(
      new Set(
        documents
          .map((item) => {
            const goal = goalById.get(String(item.goalId || "").trim());
            return String(goal?.cycleId || "").trim();
          })
          .filter(Boolean)
      )
    );

    const cycleRows = await listGoalCyclesSafe(databases, cycleIds);
    const cycleByName = new Map();
    cycleRows.forEach((cycle) => {
      cycleByName.set(String(cycle.name || "").trim(), cycle);
    });

    const shaped = documents.map((item) => {
      const goal = goalById.get(String(item.goalId || "").trim());
      const goalSelfReviewId = String(item.goalSelfReviewId || "").trim();
      const reviewLookupKey = `${String(item.employeeId || "").trim()}|${String(item.goalId || "").trim()}|${String(goal?.cycleId || "").trim()}`;
      const goalSelfReview =
        goalSelfReviewById.get(goalSelfReviewId) || goalSelfReviewByKey.get(reviewLookupKey) || null;
      const latestReview = latestReviewMap.get(String(item.$id || "").trim());
      const managerCycleRating = managerRatingByCycle.get(
        `${String(item.managerId || "").trim()}|${String(goal?.cycleId || "").trim()}`
      );
      const managerReviewStatus = String(item.status || "") === CHECKIN_STATUSES.COMPLETED ? "reviewed" : "pending";
      const ratingVisibleToEmployee = Boolean(goal?.ratingVisibleToEmployee);
      const isManagerSelfRecord =
        profile.role === "manager" && String(item.employeeId || "").trim() === String(profile.$id || "").trim();
      const cycle = cycleByName.get(String(goal?.cycleId || "").trim()) || null;
      const managerRatingGate = getManagerRatingGate({
        isFinalCheckIn: Boolean(item.isFinalCheckIn),
        checkIn: item,
        goalSelfReview,
        cycle,
      });

      if ((profile.role === "employee" && !ratingVisibleToEmployee) || isManagerSelfRecord) {
        return {
          ...item,
          managerRating: null,
          ratedAt: null,
          selfReviewText: item.selfReviewText || "",
          selfReviewStatus: item.selfReviewStatus || "draft",
          selfReviewSubmittedAt: item.selfReviewSubmittedAt || null,
          selfReviewSubmittedBy: item.selfReviewSubmittedBy || null,
          selfReviewReopenedAt: item.selfReviewReopenedAt || null,
          selfReviewReopenedBy: item.selfReviewReopenedBy || null,
          selfReviewReopenReason: item.selfReviewReopenReason || "",
          employeeSelfReview: goalSelfReview
            ? {
                reviewId: goalSelfReview.$id,
                status: goalSelfReview.status || "draft",
                submittedAt: goalSelfReview.submittedAt || null,
                achievements: goalSelfReview.achievements || "",
                challenges: goalSelfReview.challenges || "",
                selfRatingValue: goalSelfReview.selfRatingValue ?? null,
                selfRatingLabel: goalSelfReview.selfRatingLabel || null,
                comments: goalSelfReview.selfComment || "",
              }
            : null,
          managerFinalRatingLabel: null,
          hrReviewStatus: latestReview?.decision || null,
          hrReviewComments: latestReview?.comments || "",
          hrReviewedAt: latestReview?.decidedAt || null,
          hrReviewedBy: latestReview?.hrId || null,
          hrManagerRating: managerCycleRating ? Number(managerCycleRating.rating || 0) : null,
          hrManagerRatingLabel: managerCycleRating?.ratingLabel || null,
          hrManagerRatingComments: managerCycleRating?.comments || "",
          hrManagerRatedAt: managerCycleRating?.ratedAt || null,
          managerReviewStatus,
          managerReviewedAt: managerReviewStatus === "reviewed" ? item.$updatedAt || null : null,
          managerReviewComments: item.managerNotes || "",
          canManagerSubmitRating: managerRatingGate.canManagerSubmitRating,
          selfReviewDeadlinePassed: managerRatingGate.selfReviewDeadlinePassed,
          managerRatingBlockMessage: managerRatingGate.blockedReason,
          checkInCode: buildCheckInCode(item),
        };
      }

      return {
        ...item,
        selfReviewText: item.selfReviewText || "",
        selfReviewStatus: item.selfReviewStatus || "draft",
        selfReviewSubmittedAt: item.selfReviewSubmittedAt || null,
        selfReviewSubmittedBy: item.selfReviewSubmittedBy || null,
        selfReviewReopenedAt: item.selfReviewReopenedAt || null,
        selfReviewReopenedBy: item.selfReviewReopenedBy || null,
        selfReviewReopenReason: item.selfReviewReopenReason || "",
        employeeSelfReview: goalSelfReview
          ? {
              reviewId: goalSelfReview.$id,
              status: goalSelfReview.status || "draft",
              submittedAt: goalSelfReview.submittedAt || null,
              achievements: goalSelfReview.achievements || "",
              challenges: goalSelfReview.challenges || "",
              selfRatingValue: goalSelfReview.selfRatingValue ?? null,
              selfRatingLabel: goalSelfReview.selfRatingLabel || null,
              comments: goalSelfReview.selfComment || "",
            }
          : null,
        managerFinalRatingLabel: goal?.managerFinalRatingLabel || null,
        hrReviewStatus: latestReview?.decision || null,
        hrReviewComments: latestReview?.comments || "",
        hrReviewedAt: latestReview?.decidedAt || null,
        hrReviewedBy: latestReview?.hrId || null,
        hrManagerRating: managerCycleRating ? Number(managerCycleRating.rating || 0) : null,
        hrManagerRatingLabel: managerCycleRating?.ratingLabel || null,
        hrManagerRatingComments: managerCycleRating?.comments || "",
        hrManagerRatedAt: managerCycleRating?.ratedAt || null,
        managerReviewStatus,
        managerReviewedAt: managerReviewStatus === "reviewed" ? item.$updatedAt || null : null,
        managerReviewComments: item.managerNotes || "",
        canManagerSubmitRating: managerRatingGate.canManagerSubmitRating,
        selfReviewDeadlinePassed: managerRatingGate.selfReviewDeadlinePassed,
        managerRatingBlockMessage: managerRatingGate.blockedReason,
        checkInCode: buildCheckInCode(item),
      };
    });

    return Response.json({ data: shaped });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "leadership"]);

    if (profile.role === "employee") {
      return Response.json(
        {
          error:
            "Single check-in creation is deprecated for employees. Use /api/check-ins/import/preview and /api/check-ins/import/commit.",
        },
        { status: 410 }
      );
    }

    const body = await request.json();
    const goalId = (body.goalId || "").trim();
    const requestedEmployeeId = (body.employeeId || "").trim();
    const managerIdInput = (body.managerId || "").trim();
    const scheduledAt = body.scheduledAt;
    const status = (body.status || CHECKIN_STATUSES.PLANNED).trim();
    const employeeNotes = body.employeeNotes || "";
    const managerNotes = body.managerNotes || "";
    const transcriptText = body.transcriptText || "";
    const isFinalCheckIn = Boolean(body.isFinalCheckIn);
    const attachmentIds = Array.isArray(body.attachmentIds) ? body.attachmentIds : [];

    if (!goalId || !scheduledAt) {
      return Response.json(
        { error: "goalId, employeeId and scheduledAt are required." },
        { status: 400 }
      );
    }

    if (!VALID_STATUSES.includes(status)) {
      return Response.json({ error: "Invalid check-in status." }, { status: 400 });
    }

    const goal = await databases.getDocument(
      databaseId,
      appwriteConfig.goalsCollectionId,
      goalId
    );

    const goalOwnerId = String(goal.employeeId || "").trim();
    const goalManagerId = String(goal.managerId || "").trim();
    const isManagerActor = profile.role === "manager" || profile.role === "leadership";
    const employeeId = isManagerActor
      ? goalOwnerId
      : (requestedEmployeeId || String(profile.$id || "").trim());
    const isManagerSelfGoal =
      (profile.role === "manager" || profile.role === "leadership") && goalOwnerId === String(profile.$id || "").trim();

    if (!employeeId) {
      return Response.json(
        { error: "goalId, employeeId and scheduledAt are required." },
        { status: 400 }
      );
    }

    const managerId = managerIdInput || (isManagerSelfGoal ? String(profile.$id || "").trim() : goalManagerId);

    if (!managerId) {
      return Response.json(
        { error: "managerId is required and could not be resolved from goal." },
        { status: 400 }
      );
    }

    const isGoalOwner = goalOwnerId === String(profile.$id || "").trim();
    const isGoalManager = goalManagerId === String(profile.$id || "").trim();

    if (profile.role === "employee" && !isGoalOwner) {
      return Response.json({ error: "Forbidden for this goal." }, { status: 403 });
    }

    if (profile.role === "manager" || profile.role === "leadership") {
      if (!isGoalManager && !isGoalOwner) {
        await assertManagerCanAccessEmployee(databases, profile.$id, goalOwnerId);
      }
    }

    if (requestedEmployeeId && requestedEmployeeId !== goalOwnerId) {
      return Response.json(
        { error: "employeeId must match the goal owner." },
        { status: 400 }
      );
    }

    if (goal.status !== GOAL_STATUSES.APPROVED) {
      return Response.json(
        { error: "Check-ins can only be created after goal approval." },
        { status: 400 }
      );
    }

    const existingCheckIns = await databases.listDocuments(
      databaseId,
      appwriteConfig.checkInsCollectionId,
      [Query.equal("goalId", goalId), Query.limit(100)]
    );

    if (existingCheckIns.total >= 5) {
      return Response.json(
        { error: "Maximum 5 check-ins allowed for this goal cycle." },
        { status: 400 }
      );
    }

    let checkIn;

    try {
      checkIn = await databases.createDocument(
        databaseId,
        appwriteConfig.checkInsCollectionId,
        ID.unique(),
        {
          goalId,
          employeeId,
          managerId,
          scheduledAt,
          status,
          employeeNotes,
          managerNotes,
          transcriptText,
          isFinalCheckIn,
          ...(attachmentIds.length > 0 ? { attachmentIds } : {}),
        }
      );
    } catch (error) {
      // Backward compatibility: if check_ins schema does not yet have attachmentIds,
      // retry without attachment payload to avoid blocking core check-in creation.
      if (
        attachmentIds.length > 0 &&
        error?.message &&
        String(error.message).toLowerCase().includes("unknown attribute")
      ) {
        checkIn = await databases.createDocument(
          databaseId,
          appwriteConfig.checkInsCollectionId,
          ID.unique(),
          {
            goalId,
            employeeId,
            managerId,
            scheduledAt,
            status,
            employeeNotes,
            managerNotes,
            transcriptText,
            isFinalCheckIn,
          }
        );
      } else {
        throw error;
      }
    }

    return Response.json({ data: { ...checkIn, checkInCode: buildCheckInCode(checkIn) } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

import { appwriteConfig } from "@/lib/appwrite";
import { NOTIFICATION_TRIGGER_TYPES } from "@/lib/appwriteSchema";
import { Query, databaseId } from "@/lib/appwriteServer";
import { sendInAppAndQueueEmail } from "@/app/api/notifications/_lib/workflows";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";

function normalize(value) {
  return String(value || "").trim();
}

function isUnknownAttributeError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("unknown attribute") || message.includes("attribute not found in schema");
}

function isMissingRequiredForSubmit(review) {
  const selfComment = normalize(review?.selfComment);
  const achievements = normalize(review?.achievements);
  const challenges = normalize(review?.challenges);

  const missing = [];
  if (!selfComment) missing.push("selfComment");
  if (!achievements) missing.push("achievements");
  if (!challenges) missing.push("challenges");

  return missing;
}

async function updateGoalCompat(databases, goalId, payload) {
  try {
    await databases.updateDocument(databaseId, appwriteConfig.goalsCollectionId, goalId, payload);
  } catch (error) {
    if (!isUnknownAttributeError(error)) {
      throw error;
    }
  }
}

async function updateFinalCheckInsCompat(databases, goalId, employeeId, payload) {
  try {
    const checkIns = await databases.listDocuments(databaseId, appwriteConfig.checkInsCollectionId, [
      Query.equal("goalId", goalId),
      Query.equal("employeeId", employeeId),
      Query.equal("isFinalCheckIn", true),
      Query.limit(20),
    ]);

    for (const item of checkIns.documents || []) {
      try {
        await databases.updateDocument(databaseId, appwriteConfig.checkInsCollectionId, item.$id, payload);
      } catch (error) {
        if (!isUnknownAttributeError(error)) {
          throw error;
        }
      }
    }
  } catch (error) {
    if (!isUnknownAttributeError(error)) {
      throw error;
    }
  }
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee"]);

    const body = await request.json().catch(() => ({}));
    const cycleId = normalize(body.cycleId);

    if (!cycleId) {
      return Response.json({ error: "cycleId is required." }, { status: 400 });
    }

    const goalsResult = await databases.listDocuments(databaseId, appwriteConfig.goalsCollectionId, [
      Query.equal("employeeId", profile.$id),
      Query.equal("cycleId", cycleId),
      Query.orderAsc("$createdAt"),
      Query.limit(300),
    ]);

    const cycleGoals = goalsResult.documents || [];
    if (cycleGoals.length === 0) {
      return Response.json(
        { error: "Cannot submit self-review because no goals exist for this cycle." },
        { status: 400 }
      );
    }

    const cycleGoalIds = cycleGoals.map((goal) => normalize(goal.$id)).filter(Boolean);
    let eligibleGoalIds = new Set();

    if (cycleGoalIds.length > 0) {
      const finalCheckInsResult = await databases.listDocuments(
        databaseId,
        appwriteConfig.checkInsCollectionId,
        [
          Query.equal("employeeId", profile.$id),
          Query.equal("goalId", cycleGoalIds),
          Query.equal("isFinalCheckIn", true),
          Query.equal("status", "completed"),
          Query.limit(500),
        ]
      );

      eligibleGoalIds = new Set(
        (finalCheckInsResult.documents || []).map((item) => normalize(item.goalId)).filter(Boolean)
      );
    }

    const goals = cycleGoals.filter((goal) => eligibleGoalIds.has(normalize(goal.$id)));
    if (goals.length === 0) {
      return Response.json(
        { error: "Cannot submit self-review until at least one final check-in is completed." },
        { status: 400 }
      );
    }

    const goalById = new Map();
    for (const goal of cycleGoals) {
      goalById.set(normalize(goal.$id), goal);
    }

    const reviewsResult = await databases.listDocuments(
      databaseId,
      appwriteConfig.goalSelfReviewsCollectionId,
      [
        Query.equal("employeeId", profile.$id),
        Query.equal("cycleId", cycleId),
        Query.limit(500),
      ]
    );
    const reviews = reviewsResult.documents || [];

    const reviewByGoalId = new Map();
    for (const review of reviews) {
      reviewByGoalId.set(normalize(review.goalId), review);
    }

    const allAlreadySubmitted = goals.every((goal) => {
      const review = reviewByGoalId.get(normalize(goal.$id));
      return normalize(review?.status) === "submitted";
    });

    if (allAlreadySubmitted) {
      return Response.json(
        { error: "Self-review already submitted for this cycle." },
        { status: 409 }
      );
    }

    const validationErrors = [];

    for (const goal of goals) {
      const goalId = normalize(goal.$id);
      const review = reviewByGoalId.get(goalId);

      if (!review) {
        validationErrors.push({ goalId, reason: "Missing self-review draft." });
        continue;
      }

      if (normalize(review.status) === "submitted") {
        continue;
      }

      const missingFields = isMissingRequiredForSubmit(review);
      if (missingFields.length > 0) {
        validationErrors.push({
          goalId,
          reason: `Missing required fields: ${missingFields.join(", ")}`,
        });
      }
    }

    if (validationErrors.length > 0) {
      return Response.json(
        {
          error: "Validation failed. Complete required self-review fields before submission.",
          details: validationErrors,
        },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const updatedGoalIds = [];
    const managerIds = new Set();

    for (const goal of goals) {
      const goalId = normalize(goal.$id);
      const review = reviewByGoalId.get(goalId);
      if (!review || normalize(review.status) === "submitted") {
        continue;
      }

      const updatedReview = await databases.updateDocument(
        databaseId,
        appwriteConfig.goalSelfReviewsCollectionId,
        review.$id,
        {
          status: "submitted",
          submittedAt: nowIso,
          updatedAt: nowIso,
        }
      );

      await updateGoalCompat(databases, goalId, {
        selfReviewId: updatedReview.$id,
        selfReviewStatus: "submitted",
        selfReviewSubmittedAt: nowIso,
      });

      await updateFinalCheckInsCompat(databases, goalId, profile.$id, {
        goalSelfReviewId: updatedReview.$id,
        goalSelfReviewStatus: "submitted",
      });

      const goalManagerId = normalize(goalById.get(goalId)?.managerId);
      if (goalManagerId) {
        managerIds.add(goalManagerId);
      }

      updatedGoalIds.push(goalId);
    }

    if (updatedGoalIds.length > 0) {
      try {
        await sendInAppAndQueueEmail(databases, {
          userId: profile.$id,
          triggerType: NOTIFICATION_TRIGGER_TYPES.SELF_REVIEW_SUBMITTED,
          title: "Self-review submitted",
          message: "Your self-review has been submitted successfully.",
          actionUrl: `/employee/timeline/${cycleId}`,
          dedupeKey: `self-review-submitted-${profile.$id}-${cycleId}`,
          metadata: {
            cycleId,
            submittedGoals: updatedGoalIds.length,
            submittedAt: nowIso,
          },
        });
      } catch {
        // Notification failures should not block self-review submission.
      }

      for (const managerId of managerIds) {
        try {
          await sendInAppAndQueueEmail(databases, {
            userId: managerId,
            triggerType: NOTIFICATION_TRIGGER_TYPES.SELF_REVIEW_SUBMITTED_MANAGER,
            title: "Employee self-review submitted",
            message: "A team member has submitted self-review for final evaluation.",
            actionUrl: "/manager/team-check-ins",
            dedupeKey: `self-review-submitted-manager-${managerId}-${profile.$id}-${cycleId}`,
            metadata: {
              cycleId,
              employeeId: profile.$id,
              submittedGoals: updatedGoalIds.length,
              submittedAt: nowIso,
            },
          });
        } catch {
          // Notification failures should not block self-review submission.
        }
      }
    }

    return Response.json({
      ok: true,
      data: {
        cycleId,
        submittedAt: nowIso,
        submittedGoals: updatedGoalIds.length,
        goalIds: updatedGoalIds,
      },
    });
  } catch (error) {
    if (isUnknownAttributeError(error)) {
      return Response.json(
        {
          error:
            "Schema is missing goal self-review attributes. Run schema apply and retry.",
        },
        { status: 500 }
      );
    }

    return errorResponse(error);
  }
}

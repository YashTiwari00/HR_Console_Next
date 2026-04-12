import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";

function normalize(value) {
  return String(value || "").trim();
}

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee"]);

    const { searchParams } = new URL(request.url);
    const cycleId = normalize(searchParams.get("cycleId"));

    if (!cycleId) {
      return Response.json({ error: "cycleId is required." }, { status: 400 });
    }

    const goalsResult = await databases.listDocuments(databaseId, appwriteConfig.goalsCollectionId, [
      Query.equal("employeeId", profile.$id),
      Query.equal("cycleId", cycleId),
      Query.orderAsc("$createdAt"),
      Query.limit(300),
    ]);

    const goals = goalsResult.documents || [];
    const cycleGoalIds = goals.map((goal) => normalize(goal.$id)).filter(Boolean);

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

    const eligibleGoals = goals.filter((goal) => eligibleGoalIds.has(normalize(goal.$id)));
    const goalIds = eligibleGoals.map((goal) => normalize(goal.$id)).filter(Boolean);

    let reviews = [];
    try {
      const reviewsResult = await databases.listDocuments(
        databaseId,
        appwriteConfig.goalSelfReviewsCollectionId,
        [
          Query.equal("employeeId", profile.$id),
          Query.equal("cycleId", cycleId),
          Query.limit(500),
        ]
      );
      reviews = reviewsResult.documents || [];
    } catch (error) {
      const message = String(error?.message || "").toLowerCase();
      if (!message.includes("could not be found") && !message.includes("unknown")) {
        throw error;
      }
      reviews = [];
    }

    const reviewByGoalId = new Map();
    for (const review of reviews) {
      reviewByGoalId.set(normalize(review.goalId), review);
    }

    const data = eligibleGoals.map((goal) => {
      const goalId = normalize(goal.$id);
      const review = reviewByGoalId.get(goalId) || null;

      return {
        goal: {
          $id: goal.$id,
          title: goal.title,
          description: goal.description,
          cycleId: goal.cycleId,
          status: goal.status,
          frameworkType: goal.frameworkType,
          weightage: goal.weightage,
          dueDate: goal.dueDate || null,
          progressPercent: goal.progressPercent,
        },
        selfReview: review
          ? {
              $id: review.$id,
              employeeId: review.employeeId,
              goalId: review.goalId,
              cycleId: review.cycleId,
              status: review.status || "draft",
              submittedAt: review.submittedAt || null,
              selfRatingValue: review.selfRatingValue ?? null,
              selfRatingLabel: review.selfRatingLabel || null,
              selfComment: review.selfComment || "",
              achievements: review.achievements || "",
              challenges: review.challenges || "",
              evidenceLinks: Array.isArray(review.evidenceLinks) ? review.evidenceLinks : [],
              achievementsJson: review.achievementsJson || "",
              challengesJson: review.challengesJson || "",
              updatedAt: review.updatedAt || review.$updatedAt || null,
            }
          : null,
        editable: !review || normalize(review.status) !== "submitted",
      };
    });

    return Response.json({
      data,
      meta: {
        cycleId,
        totalGoals: eligibleGoals.length,
        cycleGoals: goals.length,
        reviewedGoals: data.filter((item) => Boolean(item.selfReview)).length,
        submittedGoals: data.filter((item) => normalize(item.selfReview?.status) === "submitted").length,
        goalIds,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

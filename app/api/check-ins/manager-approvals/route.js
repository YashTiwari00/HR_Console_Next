import { NextResponse } from "next/server";
import { appwriteConfig } from "@/lib/appwrite";
import { CHECKIN_STATUSES, GOAL_STATUSES } from "@/lib/appwriteSchema";
import { Query, databaseId } from "@/lib/appwriteServer";
import { computeAndPersistEmployeeCycleScore, getCycleState } from "@/lib/finalRatings";
import { parseRatingInput } from "@/lib/ratings";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertManagerCanAccessEmployee } from "@/lib/teamAccess";
import { getManagerRatingGate } from "@/lib/workflow/selfReviewGate";

function hasManagerRating(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 5;
}

function isMissingCollectionOrAttributeError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("unknown attribute") || message.includes("could not be found");
}

async function getGoalSelfReviewForCheckIn(databases, checkIn, goal) {
  try {
    const response = await databases.listDocuments(databaseId, appwriteConfig.goalSelfReviewsCollectionId, [
      Query.equal("employeeId", String(checkIn.employeeId || "").trim()),
      Query.equal("goalId", String(goal.$id || goal.id || checkIn.goalId || "").trim()),
      Query.equal("cycleId", String(goal.cycleId || "").trim()),
      Query.limit(1),
    ]);

    return response.documents[0] || null;
  } catch (error) {
    if (isMissingCollectionOrAttributeError(error)) {
      return null;
    }

    throw error;
  }
}

function normalizeItem(raw) {
  return {
    checkInId: String(raw?.checkInId || "").trim(),
    managerNotes: String(raw?.managerNotes || "").trim(),
    transcriptText: String(raw?.transcriptText || "").trim(),
    managerRating: raw?.managerRating,
    managerGoalRatingLabel: raw?.managerGoalRatingLabel,
    isFinalCheckIn:
      typeof raw?.isFinalCheckIn === "boolean" ? raw.isFinalCheckIn : null,
  };
}

async function completeOneCheckIn(databases, profile, item) {
  const checkIn = await databases.getDocument(
    databaseId,
    appwriteConfig.checkInsCollectionId,
    item.checkInId
  );

  const goal = await databases.getDocument(
    databaseId,
    appwriteConfig.goalsCollectionId,
    checkIn.goalId
  );

  const goalOwnerId = String(goal.employeeId || "").trim();
  const checkInManagerId = String(checkIn.managerId || "").trim();
  const actorId = String(profile.$id || "").trim();
  const isManagerSelfGoal = goalOwnerId === actorId;

  if (checkInManagerId !== actorId && !isManagerSelfGoal) {
    await assertManagerCanAccessEmployee(databases, actorId, goalOwnerId);
  }

  if (goal.status !== GOAL_STATUSES.APPROVED && goal.status !== GOAL_STATUSES.CLOSED) {
    throw new Error("Only approved/active goals can receive completed check-ins.");
  }

  const isFinalCheckIn =
    typeof item.isFinalCheckIn === "boolean"
      ? item.isFinalCheckIn
      : Boolean(checkIn.isFinalCheckIn);

  const ratingInput =
    item.managerGoalRatingLabel ||
    item.managerRating ||
    (isFinalCheckIn ? checkIn.managerRating : null);

  const parsedRating = parseRatingInput(ratingInput);

  if (isFinalCheckIn) {
    if (!Number.isInteger(parsedRating.value) || parsedRating.value < 1 || parsedRating.value > 5) {
      throw new Error("Final check-in requires managerRating between 1 and 5.");
    }

    const isLegacyRated =
      hasManagerRating(checkIn.managerRating) ||
      hasManagerRating(goal.managerFinalRating) ||
      Boolean(goal.managerFinalRatedAt);

    const [cycleState, goalSelfReview] = await Promise.all([
      getCycleState(databases, goal.cycleId),
      getGoalSelfReviewForCheckIn(databases, checkIn, goal),
    ]);

    const managerRatingGate = getManagerRatingGate({
      isFinalCheckIn: true,
      checkIn,
      goalSelfReview,
      cycle: cycleState?.cycle || null,
    });

    if (!isLegacyRated && !managerRatingGate.canManagerSubmitRating) {
      throw new Error(
        managerRatingGate.blockedReason || "Waiting for employee self-review"
      );
    }
  }

  let updated = checkIn;

  if (checkIn.status !== CHECKIN_STATUSES.COMPLETED) {
    updated = await databases.updateDocument(
      databaseId,
      appwriteConfig.checkInsCollectionId,
      checkIn.$id,
      {
        status: CHECKIN_STATUSES.COMPLETED,
        managerNotes: item.managerNotes,
        transcriptText: item.transcriptText,
        isFinalCheckIn,
        managerRating: isFinalCheckIn ? parsedRating.value : null,
        ratedAt: isFinalCheckIn ? new Date().toISOString() : null,
        managerId: checkInManagerId,
      }
    );
  }

  if (isFinalCheckIn) {
    const cycleState = await getCycleState(databases, goal.cycleId);
    const ratingVisibleToEmployee = cycleState.state === "closed";
    const effectiveManagerId =
      goalOwnerId === actorId ? actorId : String(goal.managerId || "").trim();

    await databases.updateDocument(databaseId, appwriteConfig.goalsCollectionId, goal.$id, {
      managerFinalRating: parsedRating.value,
      managerFinalRatingLabel: parsedRating.label,
      managerFinalRatedAt: new Date().toISOString(),
      managerFinalRatedBy: actorId,
      ratingVisibleToEmployee,
    });

    await computeAndPersistEmployeeCycleScore(databases, {
      employeeId: goal.employeeId,
      managerId: effectiveManagerId,
      cycleId: goal.cycleId,
      visibility: ratingVisibleToEmployee ? "visible" : "hidden",
    });
  }

  return { checkInId: checkIn.$id, status: updated.status };
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["manager", "leadership"]);

    const body = await request.json().catch(() => ({}));

    const rawItems = Array.isArray(body?.items)
      ? body.items
      : body?.checkInId
      ? [body]
      : [];

    const items = rawItems.map((item) => normalizeItem(item)).filter((item) => item.checkInId);

    if (items.length === 0) {
      return NextResponse.json({ error: "At least one checkInId is required." }, { status: 400 });
    }

    if (items.length > 50) {
      return NextResponse.json({ error: "Bulk approval supports up to 50 check-ins per request." }, { status: 400 });
    }

    const successes = [];
    const failures = [];

    for (const item of items) {
      try {
        const result = await completeOneCheckIn(databases, profile, item);
        successes.push(result);
      } catch (error) {
        failures.push({
          checkInId: item.checkInId,
          reason: String(error?.message || "Unable to approve check-in."),
        });
      }
    }

    return NextResponse.json(
      {
        ok: true,
        summary: {
          total: items.length,
          approved: successes.length,
          failed: failures.length,
          successes,
          failures,
        },
      },
      { status: failures.length === items.length ? 422 : 200 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

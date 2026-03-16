import { appwriteConfig } from "@/lib/appwrite";
import { CHECKIN_STATUSES, GOAL_STATUSES } from "@/lib/appwriteSchema";
import { databaseId } from "@/lib/appwriteServer";
import { computeAndPersistEmployeeCycleScore, getCycleState } from "@/lib/finalRatings";
import { parseRatingInput } from "@/lib/ratings";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";

export async function PATCH(request, context) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["manager", "hr"]);

    const params = await context.params;
    const checkInId = params.checkInId;

    const checkIn = await databases.getDocument(
      databaseId,
      appwriteConfig.checkInsCollectionId,
      checkInId
    );

    const goal = await databases.getDocument(
      databaseId,
      appwriteConfig.goalsCollectionId,
      checkIn.goalId
    );

    const goalOwnerId = String(goal.employeeId || "").trim();
    const checkInManagerId = String(checkIn.managerId || "").trim();
    const isManagerSelfGoal =
      profile.role === "manager" && goalOwnerId === String(profile.$id || "").trim();

    if (profile.role === "manager" && checkInManagerId !== profile.$id && !isManagerSelfGoal) {
      return Response.json({ error: "Forbidden for this check-in." }, { status: 403 });
    }

    if (goal.status !== GOAL_STATUSES.APPROVED && goal.status !== GOAL_STATUSES.CLOSED) {
      return Response.json(
        { error: "Only approved/active goals can receive completed check-ins." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const nextStatus = (body.status || CHECKIN_STATUSES.COMPLETED).trim();
    const managerNotes = (body.managerNotes || "").trim();
    const transcriptText = (body.transcriptText || "").trim();
    const isFinalCheckIn = Boolean(body.isFinalCheckIn);
    const ratingInput = body.managerGoalRatingLabel || body.managerGoalRating || body.managerRating;
    const parsedRating = parseRatingInput(ratingInput);

    if (nextStatus !== CHECKIN_STATUSES.COMPLETED) {
      return Response.json(
        { error: "Only transition to completed is supported in this endpoint." },
        { status: 400 }
      );
    }

    if (checkIn.status === CHECKIN_STATUSES.COMPLETED) {
      return Response.json({ data: checkIn });
    }

    if (isFinalCheckIn) {
      if (profile.role !== "manager") {
        return Response.json(
          { error: "Only managers can submit final employee rating." },
          { status: 403 }
        );
      }

      if (!Number.isInteger(parsedRating.value) || parsedRating.value < 1 || parsedRating.value > 5) {
        return Response.json(
          { error: "Final check-in requires managerRating between 1 and 5." },
          { status: 400 }
        );
      }
    }

    const updatePayload = {
      status: CHECKIN_STATUSES.COMPLETED,
      managerNotes,
      transcriptText,
      isFinalCheckIn,
      managerRating: isFinalCheckIn ? parsedRating.value : null,
      ratedAt: isFinalCheckIn ? new Date().toISOString() : null,
      // Normalize legacy rows where manager self-goal check-ins were stamped with HR approver id.
      managerId: profile.role === "manager" ? profile.$id : checkIn.managerId,
    };

    let updated;

    try {
      updated = await databases.updateDocument(
        databaseId,
        appwriteConfig.checkInsCollectionId,
        checkInId,
        updatePayload
      );
    } catch (error) {
      if (
        error?.message &&
        String(error.message).toLowerCase().includes("unknown attribute")
      ) {
        return Response.json(
          {
            error:
              "check_ins schema is missing managerRating and/or ratedAt. Add both attributes in Appwrite and retry.",
          },
          { status: 500 }
        );
      }

      throw error;
    }

    if (isFinalCheckIn && profile.role === "manager") {
      try {
        const cycleState = await getCycleState(databases, goal.cycleId);
        const ratingVisibleToEmployee = cycleState.state === "closed";
        const effectiveManagerId =
          goalOwnerId === String(profile.$id || "").trim()
            ? String(profile.$id || "").trim()
            : String(goal.managerId || "").trim();

        await databases.updateDocument(databaseId, appwriteConfig.goalsCollectionId, goal.$id, {
          managerFinalRating: parsedRating.value,
          managerFinalRatingLabel: parsedRating.label,
          managerFinalRatedAt: new Date().toISOString(),
          managerFinalRatedBy: profile.$id,
          ratingVisibleToEmployee,
        });

        await computeAndPersistEmployeeCycleScore(databases, {
          employeeId: goal.employeeId,
          managerId: effectiveManagerId,
          cycleId: goal.cycleId,
          visibility: ratingVisibleToEmployee ? "visible" : "hidden",
        });
      } catch (error) {
        if (
          error?.message &&
          String(error.message).toLowerCase().includes("unknown attribute")
        ) {
          return Response.json(
            {
              error:
                "goals schema is missing final rating attributes. Run schema sync and retry.",
            },
            { status: 500 }
          );
        }

        throw error;
      }
    }

    return Response.json({ data: updated });
  } catch (error) {
    return errorResponse(error);
  }
}

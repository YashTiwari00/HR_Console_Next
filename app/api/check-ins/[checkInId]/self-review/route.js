import { appwriteConfig } from "@/lib/appwrite";
import { CHECKIN_STATUSES, GOAL_STATUSES, SELF_REVIEW_STATUSES } from "@/lib/appwriteSchema";
import { databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";

export async function POST(request, context) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee"]);

    const params = await context.params;
    const checkInId = String(params.checkInId || "").trim();

    if (!checkInId) {
      return Response.json({ error: "checkInId is required." }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const selfReviewText = String(body.selfReviewText || "").trim();

    if (selfReviewText.length < 10) {
      return Response.json(
        { error: "selfReviewText is required and must be at least 10 characters." },
        { status: 400 }
      );
    }

    const checkIn = await databases.getDocument(
      databaseId,
      appwriteConfig.checkInsCollectionId,
      checkInId
    );

    if (String(checkIn.employeeId || "").trim() !== String(profile.$id || "").trim()) {
      return Response.json({ error: "Forbidden for requested check-in." }, { status: 403 });
    }

    if (String(checkIn.status || "") !== CHECKIN_STATUSES.COMPLETED) {
      return Response.json(
        { error: "Self Review can be submitted only after completing the final check-in." },
        { status: 400 }
      );
    }

    if (!Boolean(checkIn.isFinalCheckIn)) {
      return Response.json(
        { error: "Self Review is supported only for final check-ins." },
        { status: 400 }
      );
    }

    const goal = await databases.getDocument(databaseId, appwriteConfig.goalsCollectionId, checkIn.goalId);
    const goalStatus = String(goal.status || "").trim();
    if (goalStatus !== GOAL_STATUSES.APPROVED && goalStatus !== GOAL_STATUSES.CLOSED) {
      return Response.json(
        { error: "Self Review can only be submitted for approved or closed goals." },
        { status: 400 }
      );
    }

    const currentStatus = String(checkIn.selfReviewStatus || "").trim();
    if (currentStatus === SELF_REVIEW_STATUSES.SUBMITTED) {
      return Response.json(
        { error: "Self Review is read-only after submission. Ask HR to reopen if edits are needed." },
        { status: 409 }
      );
    }

    try {
      const updated = await databases.updateDocument(
        databaseId,
        appwriteConfig.checkInsCollectionId,
        checkInId,
        {
          selfReviewText,
          selfReviewStatus: SELF_REVIEW_STATUSES.SUBMITTED,
          selfReviewSubmittedAt: new Date().toISOString(),
          selfReviewSubmittedBy: profile.$id,
        }
      );

      return Response.json({ data: updated });
    } catch (error) {
      const message = String(error?.message || "").toLowerCase();
      if (message.includes("unknown attribute")) {
        return Response.json(
          {
            error:
              "check_ins schema is missing self review attributes. Run schema sync and retry.",
          },
          { status: 500 }
        );
      }

      throw error;
    }
  } catch (error) {
    return errorResponse(error);
  }
}

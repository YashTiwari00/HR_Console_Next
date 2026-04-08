import { appwriteConfig } from "@/lib/appwrite";
import { SELF_REVIEW_STATUSES } from "@/lib/appwriteSchema";
import { databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";

export async function POST(request, context) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    const params = await context.params;
    const checkInId = String(params.checkInId || "").trim();

    if (!checkInId) {
      return Response.json({ error: "checkInId is required." }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const reason = String(body.reason || "").trim();

    const checkIn = await databases.getDocument(
      databaseId,
      appwriteConfig.checkInsCollectionId,
      checkInId
    );

    if (!Boolean(checkIn.isFinalCheckIn)) {
      return Response.json(
        { error: "Self Review reopen is supported only for final check-ins." },
        { status: 400 }
      );
    }

    const currentStatus = String(checkIn.selfReviewStatus || "").trim();
    if (currentStatus !== SELF_REVIEW_STATUSES.SUBMITTED) {
      return Response.json(
        { error: "Only submitted self reviews can be reopened." },
        { status: 409 }
      );
    }

    try {
      const updated = await databases.updateDocument(
        databaseId,
        appwriteConfig.checkInsCollectionId,
        checkInId,
        {
          selfReviewStatus: SELF_REVIEW_STATUSES.REOPENED,
          selfReviewReopenedAt: new Date().toISOString(),
          selfReviewReopenedBy: profile.$id,
          selfReviewReopenReason: reason,
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

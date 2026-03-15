import { appwriteConfig } from "@/lib/appwrite";
import { CHECKIN_STATUSES, GOAL_STATUSES } from "@/lib/appwriteSchema";
import { databaseId } from "@/lib/appwriteServer";
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

    if (profile.role === "manager" && checkIn.managerId !== profile.$id) {
      return Response.json({ error: "Forbidden for this check-in." }, { status: 403 });
    }

    const goal = await databases.getDocument(
      databaseId,
      appwriteConfig.goalsCollectionId,
      checkIn.goalId
    );

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

    if (nextStatus !== CHECKIN_STATUSES.COMPLETED) {
      return Response.json(
        { error: "Only transition to completed is supported in this endpoint." },
        { status: 400 }
      );
    }

    if (checkIn.status === CHECKIN_STATUSES.COMPLETED) {
      return Response.json({ data: checkIn });
    }

    const updated = await databases.updateDocument(
      databaseId,
      appwriteConfig.checkInsCollectionId,
      checkInId,
      {
        status: CHECKIN_STATUSES.COMPLETED,
        managerNotes,
        transcriptText,
        isFinalCheckIn,
      }
    );

    return Response.json({ data: updated });
  } catch (error) {
    return errorResponse(error);
  }
}

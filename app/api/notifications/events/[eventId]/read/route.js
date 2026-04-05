import { appwriteConfig } from "@/lib/appwrite";
import { databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { isMissingCollectionError } from "@/app/api/notifications/_lib/engine";

export async function PATCH(request, context) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "hr", "leadership"]);

    const params = await context.params;
    const eventId = String(params.eventId || "").trim();

    if (!eventId) {
      return Response.json({ error: "eventId is required." }, { status: 400 });
    }

    let event;
    try {
      event = await databases.getDocument(
        databaseId,
        appwriteConfig.notificationEventsCollectionId,
        eventId
      );
    } catch (error) {
      if (isMissingCollectionError(error, appwriteConfig.notificationEventsCollectionId)) {
        return Response.json(
          { error: "notification_events collection is not available." },
          { status: 409 }
        );
      }
      throw error;
    }

    if (String(event.userId || "").trim() !== String(profile.$id || "").trim()) {
      return Response.json({ error: "Forbidden for this notification event." }, { status: 403 });
    }

    const updated = await databases.updateDocument(
      databaseId,
      appwriteConfig.notificationEventsCollectionId,
      eventId,
      {
        isRead: true,
        readAt: new Date().toISOString(),
      }
    );

    return Response.json({
      data: {
        id: updated.$id,
        isRead: Boolean(updated.isRead),
        readAt: updated.readAt || null,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
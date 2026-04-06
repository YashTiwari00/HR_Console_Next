import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import {
  decodeNotificationId,
  findNotificationForUser,
  markNotificationReadByCollection,
} from "@/app/api/notifications/_lib/store";

export async function PATCH(request, context) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "hr", "leadership"]);

    const params = await context.params;
    const eventId = String(params.eventId || "").trim();

    if (!eventId) {
      return Response.json({ error: "eventId is required." }, { status: 400 });
    }

    const found = await findNotificationForUser(
      databases,
      eventId,
      String(profile.$id || "").trim()
    );

    if (!found) {
      return Response.json({ error: "Notification not found." }, { status: 404 });
    }

    const { collectionId, doc } = found;
    if (String(doc.userId || "").trim() !== String(profile.$id || "").trim()) {
      return Response.json({ error: "Forbidden for this notification event." }, { status: 403 });
    }

    const decoded = decodeNotificationId(eventId);
    const updated = await markNotificationReadByCollection(
      databases,
      collectionId,
      decoded.documentId || doc.$id
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
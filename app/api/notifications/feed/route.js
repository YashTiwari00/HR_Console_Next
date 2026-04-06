import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import {
  isMissingCollectionError,
  isUnknownAttributeError,
  parsePayload,
} from "@/app/api/notifications/_lib/engine";
import { encodeNotificationId, listNotificationsForUser } from "@/app/api/notifications/_lib/store";

function toPositiveLimit(value, fallback = 25) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(1, Math.min(100, parsed));
}

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "hr", "leadership"]);

    const { searchParams } = new URL(request.url);
    const includeRead = String(searchParams.get("includeRead") || "false").toLowerCase() === "true";
    const limit = toPositiveLimit(searchParams.get("limit"), 25);

    let rows;
    try {
      rows = await listNotificationsForUser(databases, {
        userId: String(profile.$id || "").trim(),
        limit,
        includeRead,
      });
    } catch (error) {
      if (isMissingCollectionError(error, appwriteConfig.notificationsCollectionId)) {
        return Response.json({
          data: [],
          meta: {
            skipped: true,
            reason: "notifications collection is not available.",
          },
        });
      }

      if (!isUnknownAttributeError(error)) {
        throw error;
      }

      const fallbackResult = await databases.listDocuments(
        databaseId,
        appwriteConfig.notificationEventsCollectionId,
        [
          Query.equal("userId", String(profile.$id || "").trim()),
          Query.orderDesc("$createdAt"),
          Query.limit(limit),
        ]
      );
      rows = fallbackResult.documents.map((row) => ({
        ...row,
        __collectionId: appwriteConfig.notificationEventsCollectionId,
      }));
    }

    const data = rows.map((row) => ({
      id: encodeNotificationId(String(row.__collectionId || appwriteConfig.notificationsCollectionId), row.$id),
      triggerType: row.triggerType || row.type || "manual",
      channel: row.channel || "in_app",
      deliveryStatus: row.deliveryStatus || "delivered",
      title: row.title,
      message: row.message,
      actionUrl: row.actionUrl || "",
      isRead: Boolean(row.isRead),
      readAt: row.readAt || null,
      createdAt: row.createdAt || row.$createdAt,
      metadata:
        typeof row.metadata === "string"
          ? parsePayload(row.metadata)
          : row.metadata && typeof row.metadata === "object"
          ? row.metadata
          : {},
    }));

    return Response.json({
      data,
      meta: {
        skipped: false,
        includeRead,
        total: data.length,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
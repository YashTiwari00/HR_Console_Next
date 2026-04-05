import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import {
  isMissingCollectionError,
  isUnknownAttributeError,
  parsePayload,
} from "@/app/api/notifications/_lib/engine";

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

    const baseQueries = [
      Query.equal("userId", String(profile.$id || "").trim()),
      Query.limit(limit),
    ];

    const queries = [...baseQueries, Query.orderDesc("createdAt")];

    if (!includeRead) {
      queries.push(Query.equal("isRead", false));
    }

    let rows;
    try {
      const result = await databases.listDocuments(
        databaseId,
        appwriteConfig.notificationEventsCollectionId,
        queries
      );
      rows = result.documents;
    } catch (error) {
      if (isMissingCollectionError(error, appwriteConfig.notificationEventsCollectionId)) {
        return Response.json({
          data: [],
          meta: {
            skipped: true,
            reason: "notification_events collection is not available.",
          },
        });
      }

      if (!includeRead && isUnknownAttributeError(error)) {
        const fallbackResult = await databases.listDocuments(
          databaseId,
          appwriteConfig.notificationEventsCollectionId,
          [
            Query.equal("userId", String(profile.$id || "").trim()),
            Query.orderDesc("$createdAt"),
            Query.limit(limit),
          ]
        );
        rows = fallbackResult.documents;
      } else if (isUnknownAttributeError(error)) {
        const fallbackResult = await databases.listDocuments(
          databaseId,
          appwriteConfig.notificationEventsCollectionId,
          [...baseQueries, Query.orderDesc("$createdAt")]
        );
        rows = fallbackResult.documents;
      } else {
        throw error;
      }
    }

    const data = rows.map((row) => ({
      id: row.$id,
      triggerType: row.triggerType,
      channel: row.channel,
      deliveryStatus: row.deliveryStatus,
      title: row.title,
      message: row.message,
      actionUrl: row.actionUrl || "",
      isRead: Boolean(row.isRead),
      readAt: row.readAt || null,
      createdAt: row.createdAt || row.$createdAt,
      metadata: parsePayload(row.metadata),
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
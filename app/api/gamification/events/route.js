import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import {
  decodeNotificationId,
  encodeNotificationId,
  findNotificationForUser,
  listNotificationsForUser,
  markNotificationReadByCollection,
} from "@/app/api/notifications/_lib/store";
import { parsePayload } from "@/app/api/notifications/_lib/engine";

const EVENT_PREFIX = "gamification_";

function toPositiveLimit(value, fallback = 8) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(1, Math.min(25, parsed));
}

function normalizeType(row) {
  return String(row?.triggerType || row?.type || "").trim().toLowerCase();
}

function isGamificationRow(row) {
  return normalizeType(row).startsWith(EVENT_PREFIX);
}

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee"]);

    const { searchParams } = new URL(request.url);
    const limit = toPositiveLimit(searchParams.get("limit"), 8);

    const notifications = await listNotificationsForUser(databases, {
      userId: String(profile.$id || "").trim(),
      includeRead: false,
      limit: Math.max(limit * 3, limit),
    });

    const filtered = notifications
      .filter((row) => isGamificationRow(row))
      .slice(0, limit)
      .map((row) => ({
        id: encodeNotificationId(String(row.__collectionId || ""), String(row.$id || "").trim()),
        eventType: normalizeType(row),
        title: String(row.title || "Milestone unlocked").trim() || "Milestone unlocked",
        message: String(row.message || "Keep up the great work.").trim() || "Keep up the great work.",
        actionUrl: String(row.actionUrl || "").trim(),
        createdAt: row.createdAt || row.$createdAt,
        metadata:
          typeof row.metadata === "string"
            ? parsePayload(row.metadata)
            : row.metadata && typeof row.metadata === "object"
            ? row.metadata
            : {},
      }));

    return Response.json({
      data: filtered,
      meta: {
        total: filtered.length,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee"]);

    const body = await request.json().catch(() => ({}));
    const ids = Array.isArray(body?.ids)
      ? body.ids.map((value) => String(value || "").trim()).filter(Boolean)
      : [];

    if (ids.length === 0) {
      return Response.json({ error: "ids array is required." }, { status: 400 });
    }

    let acknowledged = 0;

    for (const id of ids) {
      const found = await findNotificationForUser(databases, id, String(profile.$id || "").trim());
      if (!found) continue;

      const decoded = decodeNotificationId(id);
      await markNotificationReadByCollection(
        databases,
        found.collectionId,
        decoded.documentId || found.doc.$id
      );
      acknowledged += 1;
    }

    return Response.json({
      data: {
        acknowledged,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

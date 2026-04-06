import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import {
  listNotificationsForUser,
  markNotificationReadByCollection,
} from "@/app/api/notifications/_lib/store";

function toPositiveLimit(value, fallback = 200) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(1, Math.min(500, parsed));
}

export async function PATCH(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "hr", "leadership"]);

    const body = await request.json().catch(() => ({}));
    const limit = toPositiveLimit(body?.limit, 200);

    const rows = await listNotificationsForUser(databases, {
      userId: String(profile.$id || "").trim(),
      includeRead: false,
      limit,
    });

    let marked = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        await markNotificationReadByCollection(
          databases,
          String(row.__collectionId || "").trim(),
          String(row.$id || "").trim()
        );
        marked += 1;
      } catch {
        failed += 1;
      }
    }

    return Response.json({
      data: {
        marked,
        failed,
      },
      meta: {
        total: rows.length,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  return PATCH(request);
}

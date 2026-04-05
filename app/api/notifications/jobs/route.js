import { appwriteConfig } from "@/lib/appwrite";
import { NOTIFICATION_JOB_STATUSES } from "@/lib/appwriteSchema";
import { Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import {
  createNotificationJobCompat,
  isMissingCollectionError,
  normalizeNotificationChannel,
  normalizeNotificationTriggerType,
  parsePayload,
} from "@/app/api/notifications/_lib/engine";

function toPositiveLimit(value, fallback = 25) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(1, Math.min(100, parsed));
}

function toIsoOrNull(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const time = new Date(text).valueOf();
  if (Number.isNaN(time)) return null;
  return new Date(time).toISOString();
}

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    const { searchParams } = new URL(request.url);
    const limit = toPositiveLimit(searchParams.get("limit"), 25);
    const status = String(searchParams.get("status") || "").trim();
    const userId = String(searchParams.get("userId") || "").trim();

    const queries = [Query.orderDesc("scheduledAt"), Query.limit(limit)];
    if (status) {
      queries.push(Query.equal("status", status));
    }
    if (userId) {
      queries.push(Query.equal("userId", userId));
    }

    let rows;
    try {
      const result = await databases.listDocuments(
        databaseId,
        appwriteConfig.notificationJobsCollectionId,
        queries
      );
      rows = result.documents;
    } catch (error) {
      if (isMissingCollectionError(error, appwriteConfig.notificationJobsCollectionId)) {
        return Response.json({
          data: [],
          meta: {
            skipped: true,
            reason: "notification_jobs collection is not available.",
          },
        });
      }
      throw error;
    }

    return Response.json({
      data: rows.map((item) => ({
        id: item.$id,
        userId: item.userId,
        templateId: item.templateId || null,
        triggerType: item.triggerType,
        channel: item.channel,
        status: item.status,
        scheduledAt: item.scheduledAt,
        attemptCount: Number(item.attemptCount || 0),
        maxAttempts: Number(item.maxAttempts || 0),
        dedupeKey: item.dedupeKey || "",
        payload: parsePayload(item.payload),
        lastError: item.lastError || "",
      })),
      meta: {
        skipped: false,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    const body = await request.json();
    const userId = String(body?.userId || "").trim();
    const templateId = String(body?.templateId || "").trim();
    const triggerType = normalizeNotificationTriggerType(body?.triggerType);
    const channel = normalizeNotificationChannel(body?.channel);
    const scheduledAt = toIsoOrNull(body?.scheduledAt) || new Date().toISOString();
    const dedupeKey = String(body?.dedupeKey || "").trim();
    const payload = body?.payload && typeof body.payload === "object" ? body.payload : {};
    const maxAttemptsRaw = Number.parseInt(String(body?.maxAttempts || "3"), 10);
    const maxAttempts = Number.isNaN(maxAttemptsRaw) ? 3 : Math.max(1, Math.min(20, maxAttemptsRaw));

    if (!userId || !triggerType || !channel) {
      return Response.json(
        { error: "userId, triggerType and channel are required." },
        { status: 400 }
      );
    }

    let created;
    try {
      created = await createNotificationJobCompat(databases, {
        userId,
        templateId: templateId || null,
        triggerType,
        channel,
        status: NOTIFICATION_JOB_STATUSES.PENDING,
        scheduledAt,
        attemptCount: 0,
        maxAttempts,
        dedupeKey,
        payload: JSON.stringify(payload),
        lastError: "",
        nextRetryAt: null,
        lockedAt: null,
        processedAt: null,
      });
    } catch (error) {
      if (isMissingCollectionError(error, appwriteConfig.notificationJobsCollectionId)) {
        return Response.json(
          { error: "notification_jobs collection is not available. Run schema apply first." },
          { status: 409 }
        );
      }
      throw error;
    }

    return Response.json(
      {
        data: {
          id: created.$id,
          userId: created.userId,
          templateId: created.templateId || null,
          triggerType: created.triggerType,
          channel: created.channel,
          status: created.status,
          scheduledAt: created.scheduledAt,
          attemptCount: Number(created.attemptCount || 0),
          maxAttempts: Number(created.maxAttempts || 0),
          dedupeKey: created.dedupeKey || "",
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
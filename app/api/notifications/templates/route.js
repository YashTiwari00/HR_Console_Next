import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import {
  createNotificationTemplateCompat,
  isMissingCollectionError,
  isUnknownAttributeError,
  normalizeNotificationChannel,
  normalizeNotificationTriggerType,
} from "@/app/api/notifications/_lib/engine";

function toLimit(value, fallback = 25) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(1, Math.min(100, parsed));
}

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "hr", "leadership"]);

    const { searchParams } = new URL(request.url);
    const includeDisabled =
      String(searchParams.get("includeDisabled") || "false").toLowerCase() === "true";
    const limit = toLimit(searchParams.get("limit"), 25);

    const queries = [Query.orderDesc("$updatedAt"), Query.limit(limit)];
    if (profile.role !== "hr" || !includeDisabled) {
      queries.push(Query.equal("isEnabled", true));
    }

    let rows;
    try {
      const result = await databases.listDocuments(
        databaseId,
        appwriteConfig.notificationTemplatesCollectionId,
        queries
      );
      rows = result.documents;
    } catch (error) {
      if (isMissingCollectionError(error, appwriteConfig.notificationTemplatesCollectionId)) {
        return Response.json({
          data: [],
          meta: {
            skipped: true,
            reason: "notification_templates collection is not available.",
          },
        });
      }

      if ((profile.role !== "hr" || !includeDisabled) && isUnknownAttributeError(error)) {
        const fallbackResult = await databases.listDocuments(
          databaseId,
          appwriteConfig.notificationTemplatesCollectionId,
          [Query.orderDesc("$updatedAt"), Query.limit(limit)]
        );
        rows = fallbackResult.documents;
      } else {
        throw error;
      }
    }

    return Response.json({
      data: rows.map((item) => ({
        id: item.$id,
        name: item.name,
        triggerType: item.triggerType,
        channel: item.channel,
        subject: item.subject || "",
        body: item.body,
        isEnabled: Boolean(item.isEnabled),
        suppressWindowMinutes: Number(item.suppressWindowMinutes || 0),
        updatedAt: item.updatedAt || item.$updatedAt || null,
        updatedBy: item.updatedBy || null,
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
    const name = String(body?.name || "").trim();
    const triggerType = normalizeNotificationTriggerType(body?.triggerType);
    const channel = normalizeNotificationChannel(body?.channel);
    const subject = String(body?.subject || "").trim();
    const messageBody = String(body?.body || "").trim();
    const isEnabled = typeof body?.isEnabled === "boolean" ? body.isEnabled : true;
    const suppressWindowMinutesRaw = Number.parseInt(String(body?.suppressWindowMinutes || "0"), 10);
    const suppressWindowMinutes = Number.isNaN(suppressWindowMinutesRaw)
      ? 0
      : Math.max(0, Math.min(10080, suppressWindowMinutesRaw));

    if (!name || !triggerType || !channel || !messageBody) {
      return Response.json(
        {
          error: "name, triggerType, channel and body are required.",
        },
        { status: 400 }
      );
    }

    let created;
    try {
      created = await createNotificationTemplateCompat(databases, {
        name,
        triggerType,
        channel,
        subject,
        body: messageBody,
        isEnabled,
        suppressWindowMinutes,
        createdBy: String(profile.$id || "").trim(),
        updatedBy: String(profile.$id || "").trim(),
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      if (isMissingCollectionError(error, appwriteConfig.notificationTemplatesCollectionId)) {
        return Response.json(
          { error: "notification_templates collection is not available. Run schema apply first." },
          { status: 409 }
        );
      }
      throw error;
    }

    return Response.json(
      {
        data: {
          id: created.$id,
          name: created.name,
          triggerType: created.triggerType,
          channel: created.channel,
          subject: created.subject || "",
          body: created.body,
          isEnabled: Boolean(created.isEnabled),
          suppressWindowMinutes: Number(created.suppressWindowMinutes || 0),
          updatedAt: created.updatedAt || created.$updatedAt || null,
          updatedBy: created.updatedBy || null,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
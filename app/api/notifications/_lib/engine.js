import { appwriteConfig } from "@/lib/appwrite";
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_DELIVERY_STATUSES,
  NOTIFICATION_JOB_STATUSES,
  NOTIFICATION_TRIGGER_TYPES,
} from "@/lib/appwriteSchema";
import { sendNotificationEmail } from "@/lib/emailProvider";
import { ID, Query, databaseId } from "@/lib/appwriteServer";

function toStringSafe(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export function isMissingCollectionError(error, collectionId) {
  const message = String(error?.message || "").toLowerCase();
  const normalizedCollectionId = String(collectionId || "").trim().toLowerCase();

  return (
    message.includes("collection") &&
    (message.includes("could not be found") || message.includes("not found")) &&
    (!normalizedCollectionId || message.includes(normalizedCollectionId))
  );
}

function extractUnknownAttributeName(error) {
  const message = String(error?.message || "");
  const match =
    message.match(/attribute not found in schema:\s*([a-zA-Z0-9_]+)/i) ||
    message.match(/unknown attribute:\s*"?([a-zA-Z0-9_]+)"?/i);

  return String(match?.[1] || "").trim();
}

export function isUnknownAttributeError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("attribute not found in schema") || message.includes("unknown attribute");
}

export function parsePayload(payloadText) {
  const raw = toStringSafe(payloadText, "").trim();
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function createNotificationEventCompat(databases, payload) {
  const collectionIds = Array.from(
    new Set(
      [
        String(appwriteConfig.notificationsCollectionId || "").trim(),
        String(appwriteConfig.notificationEventsCollectionId || "").trim(),
      ].filter(Boolean)
    )
  );

  for (const collectionId of collectionIds) {
    let nextPayload = {
      ...payload,
      type: String(payload?.type || payload?.triggerType || "manual").trim().toLowerCase(),
      dedupeKey: String(parsePayload(payload?.metadata).dedupeKey || "").trim(),
    };

    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        return await databases.createDocument(databaseId, collectionId, ID.unique(), nextPayload);
      } catch (error) {
        if (isMissingCollectionError(error, collectionId)) {
          break;
        }

        if (!isUnknownAttributeError(error)) {
          throw error;
        }

        const unknownAttr = extractUnknownAttributeName(error);
        if (!unknownAttr || !(unknownAttr in nextPayload)) {
          throw error;
        }

        const rest = { ...nextPayload };
        delete rest[unknownAttr];
        nextPayload = rest;
      }
    }
  }

  throw new Error("Unable to create notification event with compatible schema fallback.");
}

export async function dispatchNotification({ databases, job, template }) {
  const payload = parsePayload(job.payload);
  const title =
    toStringSafe(payload.title).trim() ||
    toStringSafe(template?.subject).trim() ||
    "Performance action pending";
  const message =
    toStringSafe(payload.message).trim() ||
    toStringSafe(template?.body).trim() ||
    "You have a pending performance workflow action.";
  const actionUrl = toStringSafe(payload.actionUrl).trim() || "";

  if (job.channel === NOTIFICATION_CHANNELS.EMAIL) {
    const userId = String(job.userId || "").trim();
    if (!userId) {
      throw new Error("Notification job is missing userId.");
    }

    const profile = await databases.getDocument(
      databaseId,
      appwriteConfig.usersCollectionId,
      userId
    );

    const recipientEmail = toStringSafe(profile?.email).trim();
    if (!recipientEmail) {
      throw new Error(`User ${userId} has no email configured.`);
    }

    const emailResult = await sendNotificationEmail({
      to: recipientEmail,
      subject: title,
      message,
      actionUrl,
    });

    return {
      ok: true,
      deliveryStatus: NOTIFICATION_DELIVERY_STATUSES.DELIVERED,
      title,
      message,
      actionUrl,
      provider: emailResult.provider || "resend",
      reason: null,
    };
  }

  return {
    ok: true,
    deliveryStatus: NOTIFICATION_DELIVERY_STATUSES.DELIVERED,
    title,
    message,
    actionUrl,
    provider: "in_app",
    reason: null,
  };
}

export function computeRetryTimeIso(attemptCount) {
  const safeAttempts = Number.isFinite(Number(attemptCount)) ? Number(attemptCount) : 0;
  const backoffMinutes = Math.min(60, 2 ** Math.max(1, safeAttempts));
  const next = new Date(Date.now() + backoffMinutes * 60 * 1000);
  return next.toISOString();
}

export async function shouldSuppressByDedupe(databases, job, template) {
  const dedupeKey = toStringSafe(job.dedupeKey).trim();
  const windowMinutes = Number(template?.suppressWindowMinutes || 0);

  if (!dedupeKey || !Number.isFinite(windowMinutes) || windowMinutes <= 0) {
    return false;
  }

  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

  const collectionIds = Array.from(
    new Set(
      [
        String(appwriteConfig.notificationsCollectionId || "").trim(),
        String(appwriteConfig.notificationEventsCollectionId || "").trim(),
      ].filter(Boolean)
    )
  );

  for (const collectionId of collectionIds) {
    try {
      const result = await databases.listDocuments(databaseId, collectionId, [
        Query.equal("userId", String(job.userId || "").trim()),
        Query.greaterThanEqual("createdAt", since),
        Query.limit(100),
      ]);

      const suppressed = result.documents.some((item) => {
        const metadata = parsePayload(item.metadata);
        const itemDedupe = String(item.dedupeKey || metadata.dedupeKey || "").trim();
        const itemTrigger = String(item.triggerType || item.type || "").trim();
        return itemDedupe === dedupeKey && itemTrigger === String(job.triggerType || "").trim();
      });

      if (suppressed) return true;
    } catch (error) {
      if (isMissingCollectionError(error, collectionId) || isUnknownAttributeError(error)) {
        continue;
      }
      throw error;
    }
  }

  return false;
}

export async function listDueNotificationJobs(databases, limit = 25) {
  const now = new Date().toISOString();

  const result = await databases.listDocuments(
    databaseId,
    appwriteConfig.notificationJobsCollectionId,
    [
      Query.equal("status", [NOTIFICATION_JOB_STATUSES.PENDING, NOTIFICATION_JOB_STATUSES.RETRY]),
      Query.lessThanEqual("scheduledAt", now),
      Query.orderAsc("scheduledAt"),
      Query.limit(Math.max(1, Math.min(100, Number(limit) || 25))),
    ]
  );

  return result.documents;
}

export function normalizeNotificationChannel(value) {
  const channel = String(value || "").trim().toLowerCase();
  if (channel === NOTIFICATION_CHANNELS.EMAIL) return NOTIFICATION_CHANNELS.EMAIL;
  if (channel === NOTIFICATION_CHANNELS.IN_APP) return NOTIFICATION_CHANNELS.IN_APP;
  return "";
}

export function normalizeNotificationTriggerType(value) {
  const triggerType = String(value || "").trim().toLowerCase();
  const valid = new Set(Object.values(NOTIFICATION_TRIGGER_TYPES));
  return valid.has(triggerType) ? triggerType : "";
}

async function createDocumentCompat(databases, collectionId, payload) {
  let nextPayload = { ...payload };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await databases.createDocument(databaseId, collectionId, ID.unique(), nextPayload);
    } catch (error) {
      if (!isUnknownAttributeError(error)) {
        throw error;
      }

      const unknownAttr = extractUnknownAttributeName(error);
      if (!unknownAttr || !(unknownAttr in nextPayload)) {
        throw error;
      }

      const rest = { ...nextPayload };
      delete rest[unknownAttr];
      nextPayload = rest;
    }
  }

  throw new Error("Unable to create document with compatible schema fallback.");
}

export async function createNotificationTemplateCompat(databases, payload) {
  return createDocumentCompat(databases, appwriteConfig.notificationTemplatesCollectionId, payload);
}

export async function createNotificationJobCompat(databases, payload) {
  return createDocumentCompat(databases, appwriteConfig.notificationJobsCollectionId, payload);
}
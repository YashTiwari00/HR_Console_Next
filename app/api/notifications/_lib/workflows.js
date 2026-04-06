import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_JOB_STATUSES,
} from "@/lib/appwriteSchema";
import { createNotificationJobCompat } from "@/app/api/notifications/_lib/engine";
import { createInAppNotification } from "@/app/api/notifications/_lib/store";

function safeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeMetadata(metadata, fallback = {}) {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return metadata;
  }
  return fallback;
}

export async function sendInAppAndQueueEmail(databases, input) {
  const userId = safeText(input?.userId);
  const triggerType = safeText(input?.triggerType, "manual").toLowerCase();
  const title = safeText(input?.title, "Notification");
  const message = safeText(input?.message, "You have a new notification.");
  const actionUrl = safeText(input?.actionUrl);
  const dedupeKey = safeText(input?.dedupeKey);
  const metadata = normalizeMetadata(input?.metadata);
  const maxAttempts = Math.max(1, Math.min(20, Number(input?.maxAttempts || 3) || 3));
  const scheduledAt = safeText(input?.scheduledAt) || new Date().toISOString();

  if (!userId) {
    throw new Error("userId is required.");
  }

  const inAppResult = await createInAppNotification(databases, {
    userId,
    type: triggerType,
    triggerType,
    title,
    message,
    actionUrl,
    dedupeKey,
    metadata,
  });

  const emailJob = await createNotificationJobCompat(databases, {
    userId,
    templateId: null,
    triggerType,
    channel: NOTIFICATION_CHANNELS.EMAIL,
    status: NOTIFICATION_JOB_STATUSES.PENDING,
    scheduledAt,
    attemptCount: 0,
    maxAttempts,
    dedupeKey,
    payload: JSON.stringify({
      title,
      message,
      actionUrl,
      metadata,
    }),
    lastError: "",
    nextRetryAt: null,
    lockedAt: null,
    processedAt: null,
  });

  return {
    inAppResult,
    emailJob,
  };
}

import { appwriteConfig } from "@/lib/appwrite";
import {
  NOTIFICATION_DELIVERY_STATUSES,
  NOTIFICATION_JOB_STATUSES,
} from "@/lib/appwriteSchema";
import { databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import {
  computeRetryTimeIso,
  createNotificationEventCompat,
  dispatchNotification,
  isMissingCollectionError,
  listDueNotificationJobs,
  shouldSuppressByDedupe,
} from "@/app/api/notifications/_lib/engine";

async function loadTemplateSafe(databases, templateId) {
  const safeTemplateId = String(templateId || "").trim();
  if (!safeTemplateId) return null;

  try {
    return await databases.getDocument(
      databaseId,
      appwriteConfig.notificationTemplatesCollectionId,
      safeTemplateId
    );
  } catch (error) {
    if (isMissingCollectionError(error, appwriteConfig.notificationTemplatesCollectionId)) {
      return null;
    }
    throw error;
  }
}

async function processJob(databases, job) {
  const nowIso = new Date().toISOString();
  const attempts = Number(job.attemptCount || 0);
  const maxAttempts = Math.max(1, Number(job.maxAttempts || 3));

  await databases.updateDocument(
    databaseId,
    appwriteConfig.notificationJobsCollectionId,
    job.$id,
    {
      status: NOTIFICATION_JOB_STATUSES.PROCESSING,
      lockedAt: nowIso,
      attemptCount: attempts + 1,
    }
  );

  const template = await loadTemplateSafe(databases, job.templateId);
  if (template && template.isEnabled === false) {
    await databases.updateDocument(
      databaseId,
      appwriteConfig.notificationJobsCollectionId,
      job.$id,
      {
        status: NOTIFICATION_JOB_STATUSES.CANCELED,
        processedAt: new Date().toISOString(),
        lastError: "Template disabled.",
      }
    );

    return { status: "canceled", eventStatus: null };
  }

  const suppressed = await shouldSuppressByDedupe(databases, job, template);
  if (suppressed) {
    await createNotificationEventCompat(databases, {
      userId: String(job.userId || "").trim(),
      jobId: String(job.$id || "").trim(),
      templateId: String(job.templateId || "").trim() || null,
      triggerType: String(job.triggerType || "manual").trim(),
      channel: String(job.channel || "in_app").trim(),
      deliveryStatus: NOTIFICATION_DELIVERY_STATUSES.SUPPRESSED,
      title: "Suppressed duplicate notification",
      message: "Notification was suppressed by dedupe policy.",
      actionUrl: "",
      isRead: false,
      readAt: null,
      createdAt: new Date().toISOString(),
      metadata: JSON.stringify({ dedupeKey: String(job.dedupeKey || "").trim() }),
    });

    await databases.updateDocument(
      databaseId,
      appwriteConfig.notificationJobsCollectionId,
      job.$id,
      {
        status: NOTIFICATION_JOB_STATUSES.SUPPRESSED,
        processedAt: new Date().toISOString(),
        lastError: "Suppressed by dedupe window.",
      }
    );

    return { status: "suppressed", eventStatus: NOTIFICATION_DELIVERY_STATUSES.SUPPRESSED };
  }

  try {
    const dispatched = await dispatchNotification({ databases, job, template });

    await createNotificationEventCompat(databases, {
      userId: String(job.userId || "").trim(),
      jobId: String(job.$id || "").trim(),
      templateId: String(job.templateId || "").trim() || null,
      triggerType: String(job.triggerType || "manual").trim(),
      channel: String(job.channel || "in_app").trim(),
      deliveryStatus: dispatched.deliveryStatus,
      title: dispatched.title,
      message: dispatched.message,
      actionUrl: dispatched.actionUrl || "",
      isRead: false,
      readAt: null,
      createdAt: new Date().toISOString(),
      metadata: JSON.stringify({ provider: dispatched.provider, dedupeKey: String(job.dedupeKey || "").trim() }),
    });

    await databases.updateDocument(
      databaseId,
      appwriteConfig.notificationJobsCollectionId,
      job.$id,
      {
        status: NOTIFICATION_JOB_STATUSES.SENT,
        processedAt: new Date().toISOString(),
        lastError: null,
      }
    );

    return { status: "sent", eventStatus: dispatched.deliveryStatus };
  } catch (error) {
    const nextAttempts = attempts + 1;
    const canRetry = nextAttempts < maxAttempts;
    const nextStatus = canRetry
      ? NOTIFICATION_JOB_STATUSES.RETRY
      : NOTIFICATION_JOB_STATUSES.FAILED;

    await databases.updateDocument(
      databaseId,
      appwriteConfig.notificationJobsCollectionId,
      job.$id,
      {
        status: nextStatus,
        nextRetryAt: canRetry ? computeRetryTimeIso(nextAttempts) : null,
        lastError: String(error?.message || "Unknown dispatch error."),
      }
    );

    try {
      await createNotificationEventCompat(databases, {
        userId: String(job.userId || "").trim(),
        jobId: String(job.$id || "").trim(),
        templateId: String(job.templateId || "").trim() || null,
        triggerType: String(job.triggerType || "manual").trim(),
        channel: String(job.channel || "in_app").trim(),
        deliveryStatus: NOTIFICATION_DELIVERY_STATUSES.FAILED,
        title: "Notification delivery failed",
        message: "A scheduled notification failed to dispatch.",
        actionUrl: "",
        isRead: false,
        readAt: null,
        createdAt: new Date().toISOString(),
        metadata: JSON.stringify({ reason: String(error?.message || "Unknown"), dedupeKey: String(job.dedupeKey || "").trim() }),
      });
    } catch {
      // Event log failures should not break scheduler loop.
    }

    return { status: canRetry ? "retry" : "failed", eventStatus: NOTIFICATION_DELIVERY_STATUSES.FAILED };
  }
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    const body = await request.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(100, Number(body?.limit || 25) || 25));

    let dueJobs;
    try {
      dueJobs = await listDueNotificationJobs(databases, limit);
    } catch (error) {
      if (isMissingCollectionError(error, appwriteConfig.notificationJobsCollectionId)) {
        return Response.json({
          data: {
            processed: 0,
            sent: 0,
            failed: 0,
            suppressed: 0,
            retried: 0,
            canceled: 0,
          },
          meta: {
            skipped: true,
            reason: "notification_jobs collection is not available.",
          },
        });
      }
      throw error;
    }

    const summary = {
      processed: 0,
      sent: 0,
      failed: 0,
      suppressed: 0,
      retried: 0,
      canceled: 0,
    };

    for (const job of dueJobs) {
      const result = await processJob(databases, job);
      summary.processed += 1;
      if (result.status === "sent") summary.sent += 1;
      if (result.status === "failed") summary.failed += 1;
      if (result.status === "retry") summary.retried += 1;
      if (result.status === "suppressed") summary.suppressed += 1;
      if (result.status === "canceled") summary.canceled += 1;
    }

    return Response.json({
      data: summary,
      meta: {
        skipped: false,
        scanned: dueJobs.length,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request) {
  return POST(request);
}
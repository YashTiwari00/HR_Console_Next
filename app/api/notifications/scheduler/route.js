import { appwriteConfig } from "@/lib/appwrite";
import {
  CYCLE_AUTO_APPROVAL_DEFAULTS,
  GOAL_STATUSES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_DELIVERY_STATUSES,
  NOTIFICATION_JOB_STATUSES,
  NOTIFICATION_TRIGGER_TYPES,
} from "@/lib/appwriteSchema";
import { createAdminServices } from "@/lib/appwriteServer";
import { Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import {
  computeRetryTimeIso,
  createNotificationJobCompat,
  createNotificationEventCompat,
  dispatchNotification,
  isMissingCollectionError,
  listDueNotificationJobs,
  shouldSuppressByDedupe,
} from "@/app/api/notifications/_lib/engine";
import { applyGoalDecision } from "@/app/api/approvals/_lib/goalDecision";
import { sendInAppAndQueueEmail } from "@/app/api/notifications/_lib/workflows";

function toPositiveLimit(value, fallback = 100) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(1, Math.min(500, parsed));
}

function toBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

function toDays(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(1, Math.min(90, parsed));
}

function parseDateToMs(value) {
  const time = new Date(String(value || "")).valueOf();
  if (Number.isNaN(time)) return 0;
  return time;
}

function formatDateKey(timestampMs) {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

function getCronSecretFromRequest(request) {
  const authHeader = String(request.headers.get("authorization") || "").trim();
  const headerSecret = String(request.headers.get("x-scheduler-secret") || "").trim();

  if (headerSecret) return headerSecret;
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  return "";
}

async function resolveSchedulerContext(request) {
  const sharedSecret = String(process.env.SCHEDULER_SHARED_SECRET || "").trim();
  const requestSecret = getCronSecretFromRequest(request);

  if (sharedSecret && requestSecret && requestSecret === sharedSecret) {
    const { databases } = createAdminServices();
    return {
      profile: {
        $id: "system-scheduler",
        role: "hr",
        mode: "cron",
      },
      databases,
      mode: "cron",
    };
  }

  const { profile, databases } = await requireAuth(request);
  requireRole(profile, ["hr"]);
  return { profile, databases, mode: "session" };
}

async function listSubmittedGoals(databases, limit) {
  const safeLimit = toPositiveLimit(limit, 100);
  const pageSize = Math.min(100, safeLimit);
  const documents = [];

  let offset = 0;
  while (documents.length < safeLimit) {
    const remaining = safeLimit - documents.length;
    const batch = await databases.listDocuments(databaseId, appwriteConfig.goalsCollectionId, [
      Query.equal("status", GOAL_STATUSES.SUBMITTED),
      Query.orderAsc("$createdAt"),
      Query.limit(Math.min(pageSize, remaining)),
      Query.offset(offset),
    ]);

    documents.push(...batch.documents);
    if (batch.documents.length < Math.min(pageSize, remaining)) {
      break;
    }

    offset += batch.documents.length;
  }

  return documents;
}

async function getCycleConfig(databases, cycleId, cache) {
  if (cache.has(cycleId)) {
    return cache.get(cycleId);
  }

  let cycleDoc = null;
  try {
    const result = await databases.listDocuments(databaseId, appwriteConfig.goalCyclesCollectionId, [
      Query.equal("name", cycleId),
      Query.limit(1),
    ]);
    cycleDoc = result.documents[0] || null;
  } catch (error) {
    if (!isMissingCollectionError(error, appwriteConfig.goalCyclesCollectionId)) {
      throw error;
    }
  }

  const config = {
    enabled: toBoolean(cycleDoc?.autoApprovalEnabled, CYCLE_AUTO_APPROVAL_DEFAULTS.ENABLED),
    autoApprovalDays: toDays(cycleDoc?.autoApprovalDays, CYCLE_AUTO_APPROVAL_DEFAULTS.DAYS),
  };
  cache.set(cycleId, config);
  return config;
}

async function enqueueReminderJob(databases, goal, dueTimestampMs) {
  const managerId = String(goal.managerId || "").trim();
  if (!managerId) {
    return { enqueued: false, reason: "missing_manager" };
  }

  const goalId = String(goal.$id || "").trim();
  const dueDateKey = formatDateKey(dueTimestampMs);
  const dedupeKey = `goal-reminder-${goalId}-${dueDateKey}`;

  await createNotificationJobCompat(databases, {
    userId: managerId,
    templateId: null,
    triggerType: NOTIFICATION_TRIGGER_TYPES.GOAL_PENDING_APPROVAL,
    channel: NOTIFICATION_CHANNELS.IN_APP,
    status: NOTIFICATION_JOB_STATUSES.PENDING,
    scheduledAt: new Date().toISOString(),
    attemptCount: 0,
    maxAttempts: 3,
    dedupeKey,
    payload: JSON.stringify({
      title: "Goal pending approval reminder",
      message: `A submitted goal (${goal.title || goalId}) will auto-approve on ${dueDateKey} if no action is taken.`,
      actionUrl: "/manager/team-approvals",
      goalId,
      cycleId: String(goal.cycleId || "").trim(),
      autoApproveOn: new Date(dueTimestampMs).toISOString(),
    }),
    lastError: "",
    nextRetryAt: null,
    lockedAt: null,
    processedAt: null,
  });

  return { enqueued: true, reason: "ok" };
}

async function processGoalAutoApprovalJobs(databases, profile, options) {
  const nowMs = Date.now();
  const reminderLeadMs = CYCLE_AUTO_APPROVAL_DEFAULTS.REMINDER_LEAD_DAYS * 24 * 60 * 60 * 1000;
  const scopeLimit = toPositiveLimit(options?.autoApprovalScanLimit, 200);
  const submittedGoals = await listSubmittedGoals(databases, scopeLimit);
  const cycleCache = new Map();

  const summary = {
    scanned: submittedGoals.length,
    reminderCandidates: 0,
    remindersEnqueued: 0,
    remindersSkipped: 0,
    autoApproveCandidates: 0,
    autoApproved: 0,
    skipped: 0,
    failed: 0,
    failures: [],
  };

  for (const goal of submittedGoals) {
    const goalId = String(goal.$id || "").trim();
    try {
      const cycleId = String(goal.cycleId || "").trim();
      if (!cycleId) {
        summary.skipped += 1;
        continue;
      }

      const cycleConfig = await getCycleConfig(databases, cycleId, cycleCache);
      if (!cycleConfig.enabled || cycleConfig.autoApprovalDays < 1) {
        summary.skipped += 1;
        continue;
      }

      const submittedAtMs = parseDateToMs(goal.submittedAt || goal.$updatedAt || goal.$createdAt);
      if (!submittedAtMs) {
        summary.skipped += 1;
        continue;
      }

      const dueTimestampMs = submittedAtMs + cycleConfig.autoApprovalDays * 24 * 60 * 60 * 1000;
      const reminderTimestampMs = dueTimestampMs - reminderLeadMs;

      if (nowMs >= reminderTimestampMs && nowMs < dueTimestampMs) {
        summary.reminderCandidates += 1;
        const reminderResult = await enqueueReminderJob(databases, goal, dueTimestampMs);
        if (reminderResult.enqueued) summary.remindersEnqueued += 1;
        if (!reminderResult.enqueued) summary.remindersSkipped += 1;
      }

      if (nowMs >= dueTimestampMs) {
        summary.autoApproveCandidates += 1;
        await applyGoalDecision({
          databases,
          profile,
          goalId,
          decision: "approved",
          comments: `Auto-approved by scheduler after ${cycleConfig.autoApprovalDays} days without manager action.`,
          mode: "system_auto",
        });
        summary.autoApproved += 1;
      }
    } catch (error) {
      summary.failed += 1;
      summary.failures.push({
        goalId,
        reason: String(error?.message || "Unknown auto-approval error."),
      });
    }
  }

  return summary;
}

async function processDeadlineNearNotifications(databases, options) {
  const nowMs = Date.now();
  const lookAheadMs = 48 * 60 * 60 * 1000;
  const scopeLimit = toPositiveLimit(options?.deadlineScanLimit, 200);

  let goals = [];
  try {
    const result = await databases.listDocuments(databaseId, appwriteConfig.goalsCollectionId, [
      Query.orderAsc("$createdAt"),
      Query.limit(scopeLimit),
    ]);
    goals = result.documents;
  } catch (error) {
    if (isMissingCollectionError(error, appwriteConfig.goalsCollectionId)) {
      return {
        scanned: 0,
        candidates: 0,
        sent: 0,
        skipped: 0,
        failed: 0,
        failures: [],
      };
    }
    throw error;
  }

  const summary = {
    scanned: goals.length,
    candidates: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    failures: [],
  };

  for (const goal of goals) {
    const goalId = String(goal.$id || "").trim();
    try {
      const status = String(goal.status || "").trim().toLowerCase();
      if (status === GOAL_STATUSES.CLOSED) {
        summary.skipped += 1;
        continue;
      }

      const dueDateMs = parseDateToMs(goal.dueDate);
      if (!dueDateMs) {
        summary.skipped += 1;
        continue;
      }

      if (dueDateMs <= nowMs || dueDateMs > nowMs + lookAheadMs) {
        summary.skipped += 1;
        continue;
      }

      const employeeId = String(goal.employeeId || "").trim();
      if (!employeeId) {
        summary.skipped += 1;
        continue;
      }

      summary.candidates += 1;

      const dueKey = formatDateKey(dueDateMs);
      await sendInAppAndQueueEmail(databases, {
        userId: employeeId,
        triggerType: "deadline_near",
        title: "Goal deadline is near",
        message: `Goal \"${String(goal.title || "Untitled Goal").trim()}\" is due on ${dueKey}.`,
        actionUrl: "/employee/timeline",
        dedupeKey: `deadline-near-${goalId}-${dueKey}`,
        metadata: {
          goalId,
          dueDate: new Date(dueDateMs).toISOString(),
        },
      });

      summary.sent += 1;
    } catch (error) {
      summary.failed += 1;
      summary.failures.push({
        goalId,
        reason: String(error?.message || "Unknown deadline notification error."),
      });
    }
  }

  return summary;
}

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
    const { profile, databases, mode } = await resolveSchedulerContext(request);

    const body = await request.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(100, Number(body?.limit || 25) || 25));
    const runAutoApproval = toBoolean(body?.runAutoApproval, true);
    const runDeadlineNear = toBoolean(body?.runDeadlineNear, true);

    let autoApprovalSummary = null;
    if (runAutoApproval) {
      autoApprovalSummary = await processGoalAutoApprovalJobs(databases, profile, {
        autoApprovalScanLimit: body?.autoApprovalScanLimit,
      });
    }

    let deadlineNearSummary = null;
    if (runDeadlineNear) {
      deadlineNearSummary = await processDeadlineNearNotifications(databases, {
        deadlineScanLimit: body?.deadlineScanLimit,
      });
    }

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
        mode,
        runAutoApproval,
        autoApproval: autoApprovalSummary,
        runDeadlineNear,
        deadlineNear: deadlineNearSummary,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request) {
  return POST(request);
}
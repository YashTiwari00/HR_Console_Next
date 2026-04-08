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
import {
  resolveSelfReviewDeadlineIso,
  resolveSelfReviewWindowOpenIso,
} from "@/lib/workflow/selfReviewGate";

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

async function listExistingUserNotificationsByTrigger(databases, userId, triggerType, limit = 200) {
  const safeUserId = String(userId || "").trim();
  const safeTrigger = String(triggerType || "").trim();
  if (!safeUserId || !safeTrigger) return [];

  const collectionIds = Array.from(
    new Set(
      [
        String(appwriteConfig.notificationsCollectionId || "").trim(),
        String(appwriteConfig.notificationEventsCollectionId || "").trim(),
      ].filter(Boolean)
    )
  );

  const allRows = [];

  for (const collectionId of collectionIds) {
    try {
      const rows = await databases.listDocuments(databaseId, collectionId, [
        Query.equal("userId", safeUserId),
        Query.equal("triggerType", safeTrigger),
        Query.limit(Math.max(1, Math.min(500, Number(limit) || 200))),
      ]);
      allRows.push(...(rows.documents || []));
    } catch (error) {
      if (isMissingCollectionError(error, collectionId)) {
        continue;
      }

      const message = String(error?.message || "").toLowerCase();
      if (message.includes("unknown attribute") || message.includes("attribute not found")) {
        continue;
      }

      throw error;
    }
  }

  return allRows;
}

function hasDedupeKey(rows, dedupeKey) {
  const key = String(dedupeKey || "").trim();
  if (!key) return false;

  return rows.some((row) => String(row?.dedupeKey || "").trim() === key);
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

async function processSelfReviewNotifications(databases, options) {
  const nowMs = Date.now();
  const reminderLeadMs = 24 * 60 * 60 * 1000;
  const scopeLimit = toPositiveLimit(options?.selfReviewScanLimit, 200);

  let goals = [];
  let cycles = [];
  let reviews = [];

  try {
    const [goalResult, cycleResult, reviewResult] = await Promise.all([
      databases.listDocuments(databaseId, appwriteConfig.goalsCollectionId, [Query.limit(scopeLimit)]),
      databases.listDocuments(databaseId, appwriteConfig.goalCyclesCollectionId, [Query.limit(scopeLimit)]),
      databases.listDocuments(databaseId, appwriteConfig.goalSelfReviewsCollectionId, [
        Query.limit(Math.max(scopeLimit, 500)),
      ]),
    ]);

    goals = goalResult.documents || [];
    cycles = cycleResult.documents || [];
    reviews = reviewResult.documents || [];
  } catch (error) {
    if (
      isMissingCollectionError(error, appwriteConfig.goalsCollectionId) ||
      isMissingCollectionError(error, appwriteConfig.goalCyclesCollectionId) ||
      isMissingCollectionError(error, appwriteConfig.goalSelfReviewsCollectionId)
    ) {
      return {
        scannedCycles: 0,
        windowOpenedSent: 0,
        reminderSent: 0,
        skipped: 0,
        failed: 0,
        failures: [],
      };
    }
    throw error;
  }

  const summary = {
    scannedCycles: cycles.length,
    windowOpenedSent: 0,
    reminderSent: 0,
    skipped: 0,
    failed: 0,
    failures: [],
  };

  const goalsByCycle = new Map();
  const reviewsByEmployeeCycle = new Map();

  for (const goal of goals) {
    const cycleId = String(goal?.cycleId || "").trim();
    const employeeId = String(goal?.employeeId || "").trim();
    if (!cycleId || !employeeId) continue;

    if (!goalsByCycle.has(cycleId)) {
      goalsByCycle.set(cycleId, []);
    }
    goalsByCycle.get(cycleId).push(goal);
  }

  for (const review of reviews) {
    const cycleId = String(review?.cycleId || "").trim();
    const employeeId = String(review?.employeeId || "").trim();
    if (!cycleId || !employeeId) continue;

    const key = `${employeeId}|${cycleId}`;
    if (!reviewsByEmployeeCycle.has(key)) {
      reviewsByEmployeeCycle.set(key, []);
    }
    reviewsByEmployeeCycle.get(key).push(review);
  }

  for (const cycle of cycles) {
    const cycleId = String(cycle?.name || "").trim();
    if (!cycleId) {
      summary.skipped += 1;
      continue;
    }

    const cycleGoals = goalsByCycle.get(cycleId) || [];
    if (cycleGoals.length === 0) {
      summary.skipped += 1;
      continue;
    }

    const openIso = resolveSelfReviewWindowOpenIso(cycle);
    const deadlineIso = resolveSelfReviewDeadlineIso(cycle);
    const openMs = parseDateToMs(openIso);
    const deadlineMs = parseDateToMs(deadlineIso);

    if (!openMs || !deadlineMs || deadlineMs <= openMs) {
      summary.skipped += 1;
      continue;
    }

    const employees = Array.from(
      new Set(cycleGoals.map((item) => String(item.employeeId || "").trim()).filter(Boolean))
    );

    for (const employeeId of employees) {
      try {
        const employeeGoals = cycleGoals.filter(
          (item) => String(item.employeeId || "").trim() === employeeId
        );

        if (employeeGoals.length === 0) {
          summary.skipped += 1;
          continue;
        }

        const reviewRows = reviewsByEmployeeCycle.get(`${employeeId}|${cycleId}`) || [];
        const submittedGoalIds = new Set(
          reviewRows
            .filter((item) => String(item.status || "").trim().toLowerCase() === "submitted")
            .map((item) => String(item.goalId || "").trim())
        );

        const allSubmitted = employeeGoals.every((goal) => submittedGoalIds.has(String(goal.$id || "").trim()));
        if (allSubmitted) {
          summary.skipped += 1;
          continue;
        }

        if (nowMs >= openMs) {
          const openDedupe = `self-review-open-${employeeId}-${cycleId}`;
          const existingOpen = await listExistingUserNotificationsByTrigger(
            databases,
            employeeId,
            NOTIFICATION_TRIGGER_TYPES.SELF_REVIEW_WINDOW_OPENED,
            300
          );

          if (!hasDedupeKey(existingOpen, openDedupe)) {
            await sendInAppAndQueueEmail(databases, {
              userId: employeeId,
              triggerType: NOTIFICATION_TRIGGER_TYPES.SELF_REVIEW_WINDOW_OPENED,
              title: "Self-review window is open",
              message: `Self-review is now open for cycle ${cycleId}.`,
              actionUrl: `/employee/timeline/${cycleId}`,
              dedupeKey: openDedupe,
              metadata: {
                cycleId,
                windowOpenedAt: openIso,
                deadlineAt: deadlineIso,
              },
            });
            summary.windowOpenedSent += 1;
          }
        }

        const reminderWindowStart = deadlineMs - reminderLeadMs;
        if (nowMs >= reminderWindowStart && nowMs < deadlineMs) {
          const deadlineKey = formatDateKey(deadlineMs);
          const reminderDedupe = `self-review-reminder-${employeeId}-${cycleId}-${deadlineKey}`;
          const existingReminder = await listExistingUserNotificationsByTrigger(
            databases,
            employeeId,
            NOTIFICATION_TRIGGER_TYPES.SELF_REVIEW_DEADLINE_REMINDER,
            300
          );

          if (!hasDedupeKey(existingReminder, reminderDedupe)) {
            await sendInAppAndQueueEmail(databases, {
              userId: employeeId,
              triggerType: NOTIFICATION_TRIGGER_TYPES.SELF_REVIEW_DEADLINE_REMINDER,
              title: "Self-review deadline reminder",
              message: `Submit your self-review by ${deadlineKey}.`,
              actionUrl: `/employee/timeline/${cycleId}`,
              dedupeKey: reminderDedupe,
              metadata: {
                cycleId,
                deadlineAt: deadlineIso,
              },
            });
            summary.reminderSent += 1;
          }
        }
      } catch (error) {
        summary.failed += 1;
        summary.failures.push({
          cycleId,
          employeeId,
          reason: String(error?.message || "Unknown self-review notification error."),
        });
      }
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
    const runSelfReview = toBoolean(body?.runSelfReview, true);

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

    let selfReviewSummary = null;
    if (runSelfReview) {
      selfReviewSummary = await processSelfReviewNotifications(databases, {
        selfReviewScanLimit: body?.selfReviewScanLimit,
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
        runSelfReview,
        selfReview: selfReviewSummary,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request) {
  return POST(request);
}
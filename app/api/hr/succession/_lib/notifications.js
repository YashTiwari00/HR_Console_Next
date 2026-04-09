import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { NOTIFICATION_TRIGGER_TYPES } from "@/lib/appwriteSchema";
import { sendInAppAndQueueEmail } from "@/app/api/notifications/_lib/workflows";

const PAGE_LIMIT = 100;

function safeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeTag(value) {
  return safeText(value).toLowerCase();
}

async function listAllDocuments(databases, collectionId, queries = []) {
  const all = [];
  let cursor = null;

  while (true) {
    const nextQueries = [...queries, Query.limit(PAGE_LIMIT)];
    if (cursor) {
      nextQueries.push(Query.cursorAfter(cursor));
    }

    const response = await databases.listDocuments(databaseId, collectionId, nextQueries);
    const docs = response.documents || [];
    all.push(...docs);

    if (docs.length < PAGE_LIMIT) break;
    cursor = docs[docs.length - 1].$id;
  }

  return all;
}

export async function listHrRecipientIds(databases) {
  try {
    const users = await listAllDocuments(databases, appwriteConfig.usersCollectionId, [
      Query.equal("role", "hr"),
    ]);

    return Array.from(
      new Set(
        users
          .map((item) => safeText(item?.$id))
          .filter(Boolean)
      )
    );
  } catch {
    return [];
  }
}

function resolveTransition(previousTag, nextTag) {
  const prev = normalizeTag(previousTag);
  const next = normalizeTag(nextTag);

  if (!next) return null;

  if (next === "ready" && prev !== "ready") {
    return {
      eventKey: "succession_marked_ready",
      title: "Succession status: Ready",
      messageBuilder: (name) => `${name} has been marked as ready for succession.`,
    };
  }

  if (next === "watch" && prev !== "watch") {
    return {
      eventKey: "succession_moved_watch",
      title: "Succession status: Watch",
      messageBuilder: (name) => `${name} has moved to watch status in succession planning.`,
    };
  }

  return null;
}

export async function notifySuccessionTagTransition(databases, input) {
  const transition = resolveTransition(input?.previousTag, input?.nextTag);
  if (!transition) return { sent: 0, skipped: true };

  const employeeId = safeText(input?.employeeId);
  if (!employeeId) return { sent: 0, skipped: true };

  const employeeName = safeText(input?.employeeName, employeeId);
  const managerId = safeText(input?.managerId);
  const cycleId = safeText(input?.cycleId);
  const updatedAt = safeText(input?.updatedAt, new Date().toISOString());
  const actorId = safeText(input?.actorId, "system");

  const hrRecipientIds = Array.isArray(input?.hrRecipientIds)
    ? input.hrRecipientIds.map((item) => safeText(item)).filter(Boolean)
    : [];

  const recipients = Array.from(new Set([...hrRecipientIds, managerId].filter(Boolean)));
  if (recipients.length === 0) return { sent: 0, skipped: true };

  const dateKey = updatedAt.slice(0, 10);
  const tasks = recipients.map((userId) => {
    const recipientRole = userId === managerId ? "manager" : "hr";

    return sendInAppAndQueueEmail(databases, {
      userId,
      triggerType: NOTIFICATION_TRIGGER_TYPES.MANUAL,
      title: transition.title,
      message: transition.messageBuilder(employeeName),
      actionUrl: "/hr/succession",
      dedupeKey: `${transition.eventKey}-${employeeId}-${userId}-${dateKey}`,
      metadata: {
        eventKey: transition.eventKey,
        employeeId,
        employeeName,
        previousTag: normalizeTag(input?.previousTag) || null,
        nextTag: normalizeTag(input?.nextTag),
        cycleId: cycleId || null,
        updatedAt,
        updatedBy: actorId,
        recipientRole,
      },
    });
  });

  const settled = await Promise.allSettled(tasks);
  const sent = settled.filter((item) => item.status === "fulfilled").length;

  return {
    sent,
    skipped: false,
    failures: settled.length - sent,
  };
}

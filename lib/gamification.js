import { createHash } from "node:crypto";
import { appwriteConfig } from "@/lib/appwrite";
import { ID, databaseId } from "@/lib/appwriteServer";

const GAMIFICATION_PREFIX = "gamification_";

function uniqueCollectionIds() {
  const ids = [
    String(appwriteConfig.notificationsCollectionId || "").trim(),
    String(appwriteConfig.notificationEventsCollectionId || "").trim(),
  ].filter(Boolean);

  return Array.from(new Set(ids));
}

function isUnknownAttributeError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("attribute not found in schema") || message.includes("unknown attribute");
}

function extractUnknownAttribute(error) {
  const message = String(error?.message || "");
  const match =
    message.match(/attribute not found in schema:\s*([a-zA-Z0-9_]+)/i) ||
    message.match(/unknown attribute:\s*"?([a-zA-Z0-9_]+)"?/i);
  return String(match?.[1] || "").trim();
}

function isMissingCollectionError(error, collectionId) {
  const message = String(error?.message || "").toLowerCase();
  const normalizedId = String(collectionId || "").toLowerCase();

  if (
    message.includes("collection") &&
    (message.includes("could not be found") ||
      message.includes("not found") ||
      message.includes("does not exist") ||
      message.includes("requested id"))
  ) {
    return true;
  }

  return Boolean(
    normalizedId &&
      message.includes(normalizedId) &&
      (message.includes("could not be found") ||
        message.includes("not found") ||
        message.includes("does not exist"))
  );
}

function isAlreadyExistsError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("already exists") || message.includes("document with the requested id");
}

function sanitizeEventType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return `${GAMIFICATION_PREFIX}event`;
  return normalized.startsWith(GAMIFICATION_PREFIX) ? normalized : `${GAMIFICATION_PREFIX}${normalized}`;
}

function toDocumentId(userId, eventKey) {
  const digest = createHash("sha1")
    .update(`${String(userId || "").trim()}|${String(eventKey || "").trim()}`)
    .digest("hex")
    .slice(0, 30);
  return `gmf_${digest}`;
}

function normalizeActionUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.startsWith("/") ? text : `/${text}`;
}

function toMetadataText(input) {
  try {
    return JSON.stringify(input || {});
  } catch {
    return "{}";
  }
}

function isGamificationEnabled() {
  return String(process.env.NEXT_PUBLIC_ENABLE_GAMIFICATION || "").trim().toLowerCase() === "true";
}

async function createDocumentCompat(databases, collectionId, documentId, payload) {
  let nextPayload = { ...payload };

  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      return await databases.createDocument(databaseId, collectionId, documentId, nextPayload);
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        return null;
      }

      if (!isUnknownAttributeError(error)) {
        throw error;
      }

      const unknownAttribute = extractUnknownAttribute(error);
      if (!unknownAttribute || !(unknownAttribute in nextPayload)) {
        throw error;
      }

      const fallbackPayload = { ...nextPayload };
      delete fallbackPayload[unknownAttribute];
      nextPayload = fallbackPayload;
    }
  }

  throw new Error("Unable to create gamification notification with schema fallback.");
}

export async function createGamificationEvent(databases, input) {
  if (!isGamificationEnabled()) {
    return { created: false, skipped: true };
  }

  const userId = String(input?.userId || "").trim();
  const eventKey = String(input?.eventKey || "").trim();

  if (!userId || !eventKey) {
    return { created: false, skipped: true };
  }

  const eventType = sanitizeEventType(input?.eventType);
  const now = new Date().toISOString();
  const metadata = {
    ...(input?.metadata && typeof input.metadata === "object" ? input.metadata : {}),
    eventType,
    eventKey,
  };

  const payload = {
    userId,
    type: eventType,
    triggerType: eventType,
    channel: "in_app",
    deliveryStatus: "delivered",
    title: String(input?.title || "Milestone unlocked").trim() || "Milestone unlocked",
    message: String(input?.message || "You have a new achievement.").trim() || "You have a new achievement.",
    actionUrl: normalizeActionUrl(input?.actionUrl),
    isRead: false,
    readAt: null,
    createdAt: now,
    dedupeKey: eventKey,
    metadata: toMetadataText(metadata),
  };

  const documentId = toDocumentId(userId, eventKey);

  for (const collectionId of uniqueCollectionIds()) {
    try {
      const created = await createDocumentCompat(databases, collectionId, documentId, payload);
      if (created) {
        return { created: true, eventId: created.$id, collectionId };
      }
      return { created: false, duplicate: true, collectionId };
    } catch (error) {
      if (isMissingCollectionError(error, collectionId)) {
        continue;
      }
      throw error;
    }
  }

  return { created: false, skipped: true, reason: "no-notification-collection" };
}

export const GAMIFICATION_MILESTONES = [25, 50, 75, 100];

import { appwriteConfig } from "@/lib/appwrite";
import { ID, Query, databaseId } from "@/lib/appwriteServer";
import { isMissingCollectionError, isUnknownAttributeError } from "@/app/api/notifications/_lib/engine";

function uniqueCollectionIds() {
  const ids = [
    String(appwriteConfig.notificationsCollectionId || "").trim(),
    String(appwriteConfig.notificationEventsCollectionId || "").trim(),
  ].filter(Boolean);

  return Array.from(new Set(ids));
}

function encodeNotificationId(collectionId, documentId) {
  return `${collectionId}:${documentId}`;
}

function decodeNotificationId(notificationId) {
  const raw = String(notificationId || "").trim();
  if (!raw.includes(":")) {
    return {
      collectionId: "",
      documentId: raw,
    };
  }

  const [collectionId, ...parts] = raw.split(":");
  return {
    collectionId: String(collectionId || "").trim(),
    documentId: String(parts.join(":") || "").trim(),
  };
}

async function createDocumentCompat(databases, collectionId, payload) {
  let nextPayload = { ...payload };

  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      return await databases.createDocument(databaseId, collectionId, ID.unique(), nextPayload);
    } catch (error) {
      if (!isUnknownAttributeError(error)) throw error;

      const message = String(error?.message || "");
      const match =
        message.match(/attribute not found in schema:\s*([a-zA-Z0-9_]+)/i) ||
        message.match(/unknown attribute:\s*"?([a-zA-Z0-9_]+)"?/i);

      const unknownAttr = String(match?.[1] || "").trim();
      if (!unknownAttr || !(unknownAttr in nextPayload)) {
        throw error;
      }

      const fallbackPayload = { ...nextPayload };
      delete fallbackPayload[unknownAttr];
      nextPayload = fallbackPayload;
    }
  }

  throw new Error("Unable to create notification with schema compatibility fallback.");
}

async function listCollectionRows(databases, collectionId, { userId, limit, includeRead }) {
  const queries = [
    Query.equal("userId", String(userId || "").trim()),
    Query.orderDesc("createdAt"),
    Query.limit(Math.max(1, Math.min(100, Number(limit) || 25))),
  ];

  if (!includeRead) {
    queries.push(Query.equal("isRead", false));
  }

  try {
    const result = await databases.listDocuments(databaseId, collectionId, queries);
    return result.documents;
  } catch (error) {
    if (isMissingCollectionError(error, collectionId)) {
      return [];
    }

    if (!isUnknownAttributeError(error)) {
      throw error;
    }

    const fallbackQueries = [
      Query.equal("userId", String(userId || "").trim()),
      Query.orderDesc("$createdAt"),
      Query.limit(Math.max(1, Math.min(100, Number(limit) || 25))),
    ];

    const fallbackResult = await databases.listDocuments(databaseId, collectionId, fallbackQueries);
    if (!includeRead) {
      return fallbackResult.documents.filter((item) => !Boolean(item.isRead));
    }

    return fallbackResult.documents;
  }
}

export async function createInAppNotification(databases, input) {
  const nowIso = new Date().toISOString();
  const type = String(input?.type || input?.triggerType || "manual").trim().toLowerCase();
  const payload = {
    userId: String(input?.userId || "").trim(),
    type,
    triggerType: String(input?.triggerType || type || "manual").trim().toLowerCase(),
    channel: "in_app",
    deliveryStatus: String(input?.deliveryStatus || "delivered").trim().toLowerCase(),
    title: String(input?.title || "Notification").trim() || "Notification",
    message: String(input?.message || "").trim() || "You have a new notification.",
    actionUrl: String(input?.actionUrl || "").trim(),
    isRead: false,
    readAt: null,
    createdAt: nowIso,
    dedupeKey: String(input?.dedupeKey || "").trim(),
  };

  if (!payload.userId) {
    throw new Error("userId is required for in-app notification.");
  }

  const collectionIds = uniqueCollectionIds();
  for (const collectionId of collectionIds) {
    try {
      return await createDocumentCompat(databases, collectionId, payload);
    } catch (error) {
      if (isMissingCollectionError(error, collectionId)) {
        continue;
      }
      if (isUnknownAttributeError(error)) {
        // Continue trying fallback collection only when current collection does not support fields.
        continue;
      }
      throw error;
    }
  }

  throw new Error("No notification collection is available.");
}

export async function listNotificationsForUser(databases, { userId, limit = 25, includeRead = false }) {
  const collectionIds = uniqueCollectionIds();
  const rowsByCollection = await Promise.all(
    collectionIds.map(async (collectionId) => {
      const rows = await listCollectionRows(databases, collectionId, { userId, limit, includeRead });
      return rows.map((row) => ({ ...row, __collectionId: collectionId }));
    })
  );

  const merged = rowsByCollection
    .flat()
    .sort((a, b) => {
      const first = new Date(String(a.createdAt || a.$createdAt || "")).valueOf();
      const second = new Date(String(b.createdAt || b.$createdAt || "")).valueOf();
      return second - first;
    })
    .slice(0, Math.max(1, Math.min(100, Number(limit) || 25)));

  return merged;
}

export async function findNotificationForUser(databases, notificationId, userId) {
  const decoded = decodeNotificationId(notificationId);
  const candidateCollections = decoded.collectionId
    ? [decoded.collectionId, ...uniqueCollectionIds().filter((id) => id !== decoded.collectionId)]
    : uniqueCollectionIds();

  for (const collectionId of candidateCollections) {
    try {
      const doc = await databases.getDocument(databaseId, collectionId, decoded.documentId);
      if (String(doc.userId || "").trim() !== String(userId || "").trim()) {
        return null;
      }

      return { doc, collectionId };
    } catch (error) {
      if (isMissingCollectionError(error, collectionId)) {
        continue;
      }
      const message = String(error?.message || "").toLowerCase();
      if (message.includes("could not be found") || message.includes("not found")) {
        continue;
      }
      throw error;
    }
  }

  return null;
}

export async function markNotificationReadByCollection(databases, collectionId, documentId) {
  try {
    return await databases.updateDocument(databaseId, collectionId, documentId, {
      isRead: true,
      readAt: new Date().toISOString(),
    });
  } catch (error) {
    if (isUnknownAttributeError(error)) {
      return databases.updateDocument(databaseId, collectionId, documentId, {
        isRead: true,
      });
    }
    throw error;
  }
}

export { decodeNotificationId, encodeNotificationId };

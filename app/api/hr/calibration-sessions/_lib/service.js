import { appwriteConfig } from "@/lib/appwrite";
import { ID, Query, databaseId } from "@/lib/appwriteServer";

const CALIBRATION_STATUS_FLOW = ["draft", "active", "locked", "closed"];

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

export function isMissingCollectionError(error, collectionId) {
  const message = String(error?.message || "").toLowerCase();
  const target = String(collectionId || "").trim().toLowerCase();
  return (
    message.includes("collection") &&
    (message.includes("not found") || message.includes("could not be found")) &&
    (!target || message.includes(target))
  );
}

async function createCompat(databases, collectionId, payload) {
  let nextPayload = { ...payload };

  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      return await databases.createDocument(databaseId, collectionId, ID.unique(), nextPayload);
    } catch (error) {
      if (!isUnknownAttributeError(error)) {
        throw error;
      }

      const unknown = extractUnknownAttribute(error);
      if (!unknown || !(unknown in nextPayload)) {
        throw error;
      }

      const rest = { ...nextPayload };
      delete rest[unknown];
      nextPayload = rest;
    }
  }

  throw new Error("Unable to create calibration document with compatible schema fallback.");
}

async function updateCompat(databases, collectionId, documentId, payload) {
  let nextPayload = { ...payload };

  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      return await databases.updateDocument(databaseId, collectionId, documentId, nextPayload);
    } catch (error) {
      if (!isUnknownAttributeError(error)) {
        throw error;
      }

      const unknown = extractUnknownAttribute(error);
      if (!unknown || !(unknown in nextPayload)) {
        throw error;
      }

      const rest = { ...nextPayload };
      delete rest[unknown];
      nextPayload = rest;
    }
  }

  throw new Error("Unable to update calibration document with compatible schema fallback.");
}

export function normalizeCalibrationStatus(value, fallback = "draft") {
  const normalized = String(value || "").trim().toLowerCase();
  return CALIBRATION_STATUS_FLOW.includes(normalized) ? normalized : fallback;
}

export function canTransitionCalibrationStatus(fromStatus, toStatus) {
  const from = normalizeCalibrationStatus(fromStatus, "");
  const to = normalizeCalibrationStatus(toStatus, "");

  if (!from || !to) return false;
  if (from === to) return true;

  const fromIndex = CALIBRATION_STATUS_FLOW.indexOf(from);
  const toIndex = CALIBRATION_STATUS_FLOW.indexOf(to);
  return toIndex === fromIndex + 1;
}

export function toIsoOrNow(value) {
  const raw = String(value || "").trim();
  if (!raw) return new Date().toISOString();
  const time = new Date(raw).valueOf();
  return Number.isNaN(time) ? new Date().toISOString() : new Date(time).toISOString();
}

export async function createCalibrationSessionCompat(databases, payload) {
  return createCompat(databases, appwriteConfig.calibrationSessionsCollectionId, payload);
}

export async function updateCalibrationSessionCompat(databases, sessionId, payload) {
  return updateCompat(
    databases,
    appwriteConfig.calibrationSessionsCollectionId,
    String(sessionId || "").trim(),
    payload
  );
}

export async function createCalibrationDecisionCompat(databases, payload) {
  return createCompat(databases, appwriteConfig.calibrationDecisionsCollectionId, payload);
}

export async function updateCalibrationDecisionCompat(databases, decisionId, payload) {
  return updateCompat(
    databases,
    appwriteConfig.calibrationDecisionsCollectionId,
    String(decisionId || "").trim(),
    payload
  );
}

export async function listCalibrationDecisionsBySession(databases, sessionId, limit = 200) {
  const result = await databases.listDocuments(
    databaseId,
    appwriteConfig.calibrationDecisionsCollectionId,
    [
      Query.equal("sessionId", String(sessionId || "").trim()),
      Query.orderDesc("decidedAt"),
      Query.limit(Math.max(1, Math.min(500, Number(limit) || 200))),
    ]
  );

  return result.documents;
}

export function shapeCalibrationTimeline(decisions) {
  return (Array.isArray(decisions) ? decisions : []).map((item) => ({
    id: item.$id,
    eventType: "decision_recorded",
    at: item.decidedAt || item.$createdAt,
    actorId: item.decidedBy || null,
    employeeId: item.employeeId || null,
    summary: `Rating ${item.proposedRating}${item.finalRating ? ` -> ${item.finalRating}` : ""}`,
    payload: {
      previousRating: item.previousRating ?? null,
      proposedRating: item.proposedRating ?? null,
      finalRating: item.finalRating ?? null,
      changed: Boolean(item.changed),
      rationale: item.rationale || "",
      version: Number(item.version || 1),
    },
  }));
}

export function shapeCalibrationSession(item) {
  return {
    id: item.$id,
    name: item.name,
    cycleId: item.cycleId,
    status: normalizeCalibrationStatus(item.status, "draft"),
    scope: item.scope || "",
    notes: item.notes || "",
    version: Number(item.version || 1),
    createdBy: item.createdBy || null,
    updatedBy: item.updatedBy || null,
    createdAt: item.createdAt || item.$createdAt,
    updatedAt: item.updatedAt || item.$updatedAt,
  };
}
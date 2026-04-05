import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId, ID } from "@/lib/appwriteServer";

function isUnknownAttributeError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("attribute not found in schema") || message.includes("unknown attribute");
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

function extractUnknownAttribute(error) {
  const message = String(error?.message || "");
  const match =
    message.match(/attribute not found in schema:\s*([a-zA-Z0-9_]+)/i) ||
    message.match(/unknown attribute:\s*"?([a-zA-Z0-9_]+)"?/i);
  return String(match?.[1] || "").trim();
}

export async function createCompat(databases, collectionId, payload) {
  let nextPayload = { ...payload };

  for (let attempt = 0; attempt < 8; attempt += 1) {
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

  throw new Error("Unable to create matrix review document with compatibility fallback.");
}

export function normalizeWeight(value) {
  const numeric = Number.parseInt(String(value || ""), 10);
  if (Number.isNaN(numeric)) return null;
  if (numeric < 1 || numeric > 100) return null;
  return numeric;
}

export async function listAssignments(databases, filters) {
  const queries = [Query.orderDesc("assignedAt"), Query.limit(200)];

  if (filters?.employeeId) queries.push(Query.equal("employeeId", String(filters.employeeId).trim()));
  if (filters?.cycleId) queries.push(Query.equal("cycleId", String(filters.cycleId).trim()));
  if (filters?.reviewerId) queries.push(Query.equal("reviewerId", String(filters.reviewerId).trim()));
  if (filters?.primaryManagerId) queries.push(Query.equal("primaryManagerId", String(filters.primaryManagerId).trim()));
  if (filters?.goalId) queries.push(Query.equal("goalId", String(filters.goalId).trim()));
  if (filters?.status) queries.push(Query.equal("status", String(filters.status).trim()));

  const result = await databases.listDocuments(
    databaseId,
    appwriteConfig.matrixReviewerAssignmentsCollectionId,
    queries
  );

  return result.documents || [];
}

export async function listFeedback(databases, filters) {
  const queries = [Query.orderDesc("createdAt"), Query.limit(300)];

  if (filters?.assignmentId) queries.push(Query.equal("assignmentId", String(filters.assignmentId).trim()));
  if (filters?.employeeId) queries.push(Query.equal("employeeId", String(filters.employeeId).trim()));
  if (filters?.reviewerId) queries.push(Query.equal("reviewerId", String(filters.reviewerId).trim()));
  if (filters?.cycleId) queries.push(Query.equal("cycleId", String(filters.cycleId).trim()));
  if (filters?.goalId) queries.push(Query.equal("goalId", String(filters.goalId).trim()));

  const result = await databases.listDocuments(
    databaseId,
    appwriteConfig.matrixReviewerFeedbackCollectionId,
    queries
  );

  return result.documents || [];
}

export function computeMatrixBlend(feedbackRows, assignmentRows) {
  const feedback = Array.isArray(feedbackRows) ? feedbackRows : [];
  const assignments = Array.isArray(assignmentRows) ? assignmentRows : [];

  const assignmentById = new Map(assignments.map((row) => [String(row.$id || "").trim(), row]));

  let weightedSum = 0;
  let weightTotal = 0;

  for (const row of feedback) {
    const assignment = assignmentById.get(String(row.assignmentId || "").trim());
    const suggestedRating = Number(row.suggestedRating);
    const weight = Number(assignment?.influenceWeight || 0);
    if (Number.isFinite(suggestedRating) && suggestedRating >= 1 && suggestedRating <= 5 && Number.isFinite(weight) && weight > 0) {
      weightedSum += suggestedRating * weight;
      weightTotal += weight;
    }
  }

  const keySignals = feedback
    .map((row) => String(row.feedbackText || "").trim())
    .filter(Boolean)
    .slice(0, 3);

  return {
    reviewerCount: new Set(feedback.map((row) => String(row.reviewerId || "").trim()).filter(Boolean)).size,
    responseCount: feedback.length,
    influenceWeightTotal: weightTotal,
    weightedRating: weightTotal > 0 ? Number((weightedSum / weightTotal).toFixed(2)) : null,
    keySignals,
  };
}

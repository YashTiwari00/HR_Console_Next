import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId, ID } from "@/lib/appwriteServer";
import { labelToRatingValue, valueToRatingLabel } from "@/lib/ratings";

const MAX_MANAGERS_PER_EMPLOYEE = 5;

/**
 * Fetch all manager assignments for a given employee.
 * Returns [{managerId, weightPercent, isPrimary, assignedAt, assignedBy, notes, $id}]
 */
export async function getEmployeeManagerAssignments(databases, employeeId) {
  if (!employeeId) return [];

  const result = await databases.listDocuments(
    databaseId,
    appwriteConfig.managerAssignmentsCollectionId,
    [Query.equal("employeeId", employeeId), Query.limit(MAX_MANAGERS_PER_EMPLOYEE)]
  );

  return result.documents || [];
}

/**
 * Fetch all employee IDs assigned to a given manager (via manager_assignments).
 */
export async function getAssignedEmployeeIdsForManager(databases, managerId) {
  if (!managerId) return [];

  const result = await databases.listDocuments(
    databaseId,
    appwriteConfig.managerAssignmentsCollectionId,
    [Query.equal("managerId", managerId), Query.limit(200)]
  );

  return (result.documents || []).map((doc) => String(doc.employeeId || "").trim()).filter(Boolean);
}

/**
 * Replace all manager assignments for an employee.
 * assignments: [{managerId, weightPercent}]  — must sum to 100.
 * Validates, deletes existing, creates new ones.
 */
export async function setEmployeeManagerAssignments(databases, employeeId, assignments, assignedBy) {
  if (!employeeId) throw Object.assign(new Error("employeeId is required."), { statusCode: 400 });
  if (!Array.isArray(assignments) || assignments.length === 0) {
    throw Object.assign(new Error("At least one assignment is required."), { statusCode: 400 });
  }
  if (assignments.length > MAX_MANAGERS_PER_EMPLOYEE) {
    throw Object.assign(new Error(`Maximum ${MAX_MANAGERS_PER_EMPLOYEE} managers per employee.`), { statusCode: 400 });
  }

  const totalWeight = assignments.reduce((sum, a) => sum + Number(a.weightPercent || 0), 0);
  if (totalWeight !== 100) {
    throw Object.assign(
      new Error(`Weights must sum to 100. Got ${totalWeight}.`),
      { statusCode: 400 }
    );
  }

  // Delete existing
  const existing = await getEmployeeManagerAssignments(databases, employeeId);
  await Promise.all(
    existing.map((doc) =>
      databases.deleteDocument(databaseId, appwriteConfig.managerAssignmentsCollectionId, doc.$id)
    )
  );

  // Sort descending by weight to determine primary
  const sorted = [...assignments].sort((a, b) => Number(b.weightPercent) - Number(a.weightPercent));

  // Create new
  const now = new Date().toISOString();
  const created = await Promise.all(
    sorted.map((a, index) =>
      databases.createDocument(
        databaseId,
        appwriteConfig.managerAssignmentsCollectionId,
        ID.unique(),
        {
          employeeId,
          managerId: String(a.managerId).trim(),
          weightPercent: Number(a.weightPercent),
          isPrimary: index === 0,
          assignedAt: now,
          assignedBy: assignedBy || "",
          effectiveFrom: a.effectiveFrom || null,
          notes: a.notes || null,
        }
      )
    )
  );

  return created;
}

/**
 * Get the primary manager ID for an employee from manager_assignments.
 * Falls back to profile.managerId if no assignments exist.
 */
export async function getPrimaryManagerId(databases, employeeId, fallbackManagerId) {
  const assignments = await getEmployeeManagerAssignments(databases, employeeId);
  if (assignments.length === 0) return fallbackManagerId || null;

  const primary = assignments.find((a) => a.isPrimary);
  return primary ? primary.managerId : assignments[0].managerId;
}

/**
 * Check if an employee has dual reporting (more than one manager assignment).
 */
export async function hasDualReporting(databases, employeeId) {
  const assignments = await getEmployeeManagerAssignments(databases, employeeId);
  return assignments.length > 1;
}

/**
 * Compute weighted-average final rating from an array of per-manager ratings.
 * ratings: [{rating: number, weightPercent: number}]
 * Returns {finalRating: number, finalRatingLabel: string} or null if no valid ratings.
 */
export function computeFinalRating(ratings) {
  const valid = ratings.filter(
    (r) => r.rating !== null && r.rating !== undefined && r.weightPercent > 0
  );
  if (valid.length === 0) return null;

  const totalWeight = valid.reduce((sum, r) => sum + r.weightPercent, 0);
  if (totalWeight === 0) return null;

  const weighted = valid.reduce((sum, r) => sum + Number(r.rating) * r.weightPercent, 0);
  const finalRating = Math.round((weighted / totalWeight) * 10) / 10;

  // Round to nearest integer for label lookup
  const roundedForLabel = Math.round(finalRating);
  const finalRatingLabel = valueToRatingLabel(roundedForLabel);

  return { finalRating, finalRatingLabel };
}

/**
 * Fetch all goal_ratings records for a goal.
 * Returns [{$id, managerId, rating, ratingLabel, weightPercent, ratedAt, notes}]
 */
export async function getGoalRatings(databases, goalId) {
  if (!goalId) return [];

  const result = await databases.listDocuments(
    databaseId,
    appwriteConfig.goalRatingsCollectionId,
    [Query.equal("goalId", goalId), Query.limit(MAX_MANAGERS_PER_EMPLOYEE)]
  );

  return result.documents || [];
}

/**
 * Submit or update a manager's rating for a goal.
 * If a rating already exists for this (goalId, managerId) pair, update it.
 * Returns { goalRatingDoc, finalRating, finalRatingLabel, ratingsComplete }
 */
export async function submitManagerGoalRating(databases, { goalId, managerId, employeeId, cycleId, rating, ratingLabel, notes }) {
  if (!goalId || !managerId) {
    throw Object.assign(new Error("goalId and managerId are required."), { statusCode: 400 });
  }

  // Resolve the manager's weight for this employee
  const assignments = await getEmployeeManagerAssignments(databases, employeeId);
  const assignment = assignments.find((a) => a.managerId === managerId);

  // If no formal assignment exists, fall back to 100% (single-manager legacy path)
  const weightPercent = assignment ? assignment.weightPercent : 100;

  const now = new Date().toISOString();

  // Check for existing rating
  const existing = await databases.listDocuments(
    databaseId,
    appwriteConfig.goalRatingsCollectionId,
    [Query.equal("goalId", goalId), Query.equal("managerId", managerId), Query.limit(1)]
  );

  let goalRatingDoc;
  if (existing.documents.length > 0) {
    goalRatingDoc = await databases.updateDocument(
      databaseId,
      appwriteConfig.goalRatingsCollectionId,
      existing.documents[0].$id,
      { rating, ratingLabel, ratedAt: now, notes: notes || null, weightPercent }
    );
  } else {
    goalRatingDoc = await databases.createDocument(
      databaseId,
      appwriteConfig.goalRatingsCollectionId,
      ID.unique(),
      {
        goalId,
        employeeId,
        managerId,
        cycleId: cycleId || "",
        weightPercent,
        rating,
        ratingLabel,
        ratedAt: now,
        notes: notes || null,
      }
    );
  }

  // Recompute final rating across all managers for this goal
  const allRatings = await getGoalRatings(databases, goalId);
  const computed = computeFinalRating(
    allRatings.map((r) => ({ rating: r.rating, weightPercent: r.weightPercent }))
  );

  // Check if all assigned managers have rated
  const assignedManagerIds = assignments.length > 0
    ? assignments.map((a) => a.managerId)
    : [managerId];

  const ratedManagerIds = new Set(allRatings.map((r) => r.managerId));
  const ratingsComplete = assignedManagerIds.every((id) => ratedManagerIds.has(id));

  return {
    goalRatingDoc,
    finalRating: computed?.finalRating ?? null,
    finalRatingLabel: computed?.finalRatingLabel ?? null,
    ratingsComplete,
  };
}

/**
 * Build a display summary of an employee's reporting structure.
 * Returns [{managerId, managerName, weightPercent, isPrimary}] or null.
 */
export async function buildReportingStructure(databases, employeeId) {
  const assignments = await getEmployeeManagerAssignments(databases, employeeId);
  if (assignments.length === 0) return null;

  return assignments.map((a) => ({
    assignmentId: a.$id,
    managerId: a.managerId,
    weightPercent: a.weightPercent,
    isPrimary: a.isPrimary,
    assignedAt: a.assignedAt,
  }));
}

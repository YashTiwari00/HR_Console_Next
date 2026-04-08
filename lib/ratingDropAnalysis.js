import { appwriteConfig } from "@/lib/appwrite";
import { Query, ID, databaseId } from "@/lib/appwriteServer";
import { labelToRatingValue, scoreX100ToLabel } from "@/lib/ratings";
import { buildRatingDropComparisonDataset, RATING_DROP_RISK_LEVELS } from "@/lib/ratingDropComparison";

const PAGE_LIMIT = 100;
const EMPLOYEE_CHUNK_SIZE = 100;

export function isRatingDropAnalysisEnabled() {
  const raw = String(
    process.env.ENABLE_RATING_DROP_ANALYSIS ??
      process.env.NEXT_PUBLIC_ENABLE_RATING_DROP_ANALYSIS ??
      "true"
  )
    .trim()
    .toLowerCase();

  return !["0", "false", "off", "no", "disabled"].includes(raw);
}

function toIso(value) {
  const time = new Date(value || Date.now()).valueOf();
  if (Number.isNaN(time)) return new Date().toISOString();
  return new Date(time).toISOString();
}

function isMissingCollectionError(error, collectionId) {
  const message = String(error?.message || "").toLowerCase();
  const target = String(collectionId || "").trim().toLowerCase();
  return (
    message.includes("collection") &&
    (message.includes("not found") || message.includes("could not be found")) &&
    (!target || message.includes(target))
  );
}

function parseRatingFromScoreRow(row) {
  const label = String(row?.scoreLabel || "").trim().toUpperCase();
  const fromLabel = labelToRatingValue(label);
  if (Number.isInteger(fromLabel)) return fromLabel;

  const scoreX100 = Number(row?.scoreX100);
  if (Number.isFinite(scoreX100)) {
    const mappedLabel = scoreX100ToLabel(scoreX100);
    const mappedValue = labelToRatingValue(mappedLabel);
    if (Number.isInteger(mappedValue)) return mappedValue;
  }

  return null;
}

function toCycleTimelineTs(cycle) {
  const closedAt = new Date(cycle?.closedAt || "").valueOf();
  if (!Number.isNaN(closedAt)) return closedAt;

  const endDate = new Date(cycle?.endDate || "").valueOf();
  if (!Number.isNaN(endDate)) return endDate;

  const createdAt = new Date(cycle?.$createdAt || "").valueOf();
  if (!Number.isNaN(createdAt)) return createdAt;

  return 0;
}

function pickLatestRowByEmployee(rows) {
  const latestByEmployee = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const employeeId = String(row?.employeeId || "").trim();
    if (!employeeId) continue;

    const existing = latestByEmployee.get(employeeId);
    if (!existing) {
      latestByEmployee.set(employeeId, row);
      continue;
    }

    const existingTime = new Date(existing?.computedAt || 0).valueOf();
    const nextTime = new Date(row?.computedAt || 0).valueOf();
    if (!Number.isNaN(nextTime) && (Number.isNaN(existingTime) || nextTime > existingTime)) {
      latestByEmployee.set(employeeId, row);
    }
  }

  return latestByEmployee;
}

function chunk(values, size) {
  const source = Array.isArray(values) ? values : [];
  const rows = [];
  for (let index = 0; index < source.length; index += size) {
    rows.push(source.slice(index, index + size));
  }
  return rows;
}

async function listAllDocumentsSafe(databases, collectionId, baseQueries = []) {
  const all = [];
  let cursor = null;

  while (true) {
    const queries = [...baseQueries, Query.limit(PAGE_LIMIT)];
    if (cursor) {
      queries.push(Query.cursorAfter(cursor));
    }

    const response = await databases.listDocuments(databaseId, collectionId, queries);
    const docs = response.documents || [];
    all.push(...docs);

    if (docs.length < PAGE_LIMIT) {
      break;
    }

    cursor = docs[docs.length - 1].$id;
  }

  return all;
}

async function listCycleRowsSafe(databases, cycleId) {
  try {
    return await listAllDocumentsSafe(
      databases,
      appwriteConfig.employeeCycleScoresCollectionId,
      [Query.equal("cycleId", cycleId), Query.orderDesc("computedAt")]
    );
  } catch (error) {
    if (isMissingCollectionError(error, appwriteConfig.employeeCycleScoresCollectionId)) {
      return [];
    }
    throw error;
  }
}

async function listPreviousCycleRowsByEmployeesSafe(databases, previousCycleId, employeeIds) {
  const chunks = chunk(employeeIds, EMPLOYEE_CHUNK_SIZE);
  const merged = [];

  for (const employeeChunk of chunks) {
    try {
      const docs = await listAllDocumentsSafe(databases, appwriteConfig.employeeCycleScoresCollectionId, [
        Query.equal("cycleId", previousCycleId),
        Query.equal("employeeId", employeeChunk),
        Query.orderDesc("computedAt"),
      ]);
      merged.push(...docs);
    } catch (error) {
      if (isMissingCollectionError(error, appwriteConfig.employeeCycleScoresCollectionId)) {
        return [];
      }
      throw error;
    }
  }

  return merged;
}

async function listClosedCyclesSafe(databases) {
  try {
    return await listAllDocumentsSafe(
      databases,
      appwriteConfig.goalCyclesCollectionId,
      [Query.equal("state", "closed"), Query.orderDesc("$createdAt")]
    );
  } catch (error) {
    if (isMissingCollectionError(error, appwriteConfig.goalCyclesCollectionId)) {
      return [];
    }
    throw error;
  }
}

function resolvePreviousCycleId(targetCycleId, closedCycles) {
  const normalizedTarget = String(targetCycleId || "").trim().toUpperCase();
  if (!normalizedTarget || !Array.isArray(closedCycles) || closedCycles.length === 0) {
    return null;
  }

  const sorted = closedCycles
    .map((cycle) => ({
      cycleId: String(cycle?.name || "").trim().toUpperCase(),
      ts: toCycleTimelineTs(cycle),
      createdAt: new Date(cycle?.$createdAt || 0).valueOf(),
    }))
    .filter((item) => Boolean(item.cycleId))
    .sort((a, b) => {
      if (a.ts !== b.ts) return a.ts - b.ts;
      return a.createdAt - b.createdAt;
    });

  const targetIndex = sorted.findIndex((item) => item.cycleId === normalizedTarget);
  if (targetIndex <= 0) {
    return null;
  }

  return sorted[targetIndex - 1].cycleId;
}

export async function fetchCycleRatingComparisonDataset(cycleId, options = {}) {
  const normalizedCycleId = String(cycleId || "").trim().toUpperCase();
  const databases = options?.databases;

  if (!normalizedCycleId || !databases) {
    return {
      cycleId: normalizedCycleId,
      previousCycleId: null,
      rows: [],
      skippedNoPreviousCycle: 0,
      skippedMissingRatings: 0,
    };
  }

  const [currentCycleRows, closedCycles] = await Promise.all([
    listCycleRowsSafe(databases, normalizedCycleId),
    listClosedCyclesSafe(databases),
  ]);

  const previousCycleId = resolvePreviousCycleId(normalizedCycleId, closedCycles);
  if (!previousCycleId) {
    return {
      cycleId: normalizedCycleId,
      previousCycleId: null,
      rows: [],
      skippedNoPreviousCycle: pickLatestRowByEmployee(currentCycleRows).size,
      skippedMissingRatings: 0,
    };
  }

  const currentByEmployee = pickLatestRowByEmployee(currentCycleRows);
  const employeeIds = Array.from(currentByEmployee.keys());
  if (employeeIds.length === 0) {
    return {
      cycleId: normalizedCycleId,
      previousCycleId,
      rows: [],
      skippedNoPreviousCycle: 0,
      skippedMissingRatings: 0,
    };
  }

  const previousRows = await listPreviousCycleRowsByEmployeesSafe(databases, previousCycleId, employeeIds);
  const previousByEmployee = pickLatestRowByEmployee(previousRows);

  const rows = [];
  let skippedMissingRatings = 0;

  for (const employeeId of employeeIds) {
    const currentRow = currentByEmployee.get(employeeId);
    const previousRow = previousByEmployee.get(employeeId);

    const currentRating = parseRatingFromScoreRow(currentRow);
    const previousRating = parseRatingFromScoreRow(previousRow);

    if (!Number.isInteger(currentRating) || !Number.isInteger(previousRating)) {
      skippedMissingRatings += 1;
      continue;
    }

    rows.push({
      employeeId,
      managerId: String(currentRow?.managerId || "").trim() || null,
      currentRating,
      previousRating,
      cycleId: normalizedCycleId,
      previousCycleId,
    });
  }

  return {
    cycleId: normalizedCycleId,
    previousCycleId,
    rows,
    skippedNoPreviousCycle: 0,
    skippedMissingRatings,
  };
}

async function isCycleClosedSafe(databases, cycleId) {
  try {
    const response = await databases.listDocuments(
      databaseId,
      appwriteConfig.goalCyclesCollectionId,
      [Query.equal("name", cycleId), Query.limit(1)]
    );

    const cycle = response.documents?.[0];
    if (!cycle) return true;
    return String(cycle.state || "").trim().toLowerCase() === "closed";
  } catch (error) {
    if (isMissingCollectionError(error, appwriteConfig.goalCyclesCollectionId)) {
      return true;
    }
    throw error;
  }
}

async function upsertAnalysisRecordSafe(databases, record) {
  try {
    const existing = await databases.listDocuments(
      databaseId,
      appwriteConfig.ratingDropInsightsCollectionId,
      [
        Query.equal("cycleId", String(record.cycleId || "").trim()),
        Query.equal("employeeId", String(record.employeeId || "").trim()),
        Query.limit(1),
      ]
    );

    const current = existing.documents?.[0];
    if (current) {
      await databases.updateDocument(
        databaseId,
        appwriteConfig.ratingDropInsightsCollectionId,
        current.$id,
        record
      );
      return true;
    }

    await databases.createDocument(
      databaseId,
      appwriteConfig.ratingDropInsightsCollectionId,
      ID.unique(),
      record
    );
    return true;
  } catch (error) {
    if (isMissingCollectionError(error, appwriteConfig.ratingDropInsightsCollectionId)) {
      return false;
    }

    const message = String(error?.message || "").toLowerCase();
    if (message.includes("unknown attribute") || message.includes("attribute not found in schema")) {
      return false;
    }

    throw error;
  }
}

export async function analyzeRatingDrop(cycleId, options = {}) {
  const normalizedCycleId = String(cycleId || "").trim().toUpperCase();
  const startedAt = new Date().toISOString();
  const logger = options?.logger || console;

  if (!normalizedCycleId) {
    return {
      cycleId: normalizedCycleId,
      processedEmployees: 0,
      recordsWritten: 0,
      significantDrops: 0,
      skippedMissingPrevious: 0,
      failedEmployees: 0,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  }

  if (!isRatingDropAnalysisEnabled()) {
    return {
      cycleId: normalizedCycleId,
      processedEmployees: 0,
      recordsWritten: 0,
      significantDrops: 0,
      skippedMissingPrevious: 0,
      failedEmployees: 0,
      startedAt,
      finishedAt: new Date().toISOString(),
      skippedReason: "feature_disabled",
    };
  }

  const databases = options?.databases;
  if (!databases) {
    throw new Error("analyzeRatingDrop requires databases in options when called from API context.");
  }

  const isClosed = await isCycleClosedSafe(databases, normalizedCycleId);
  if (!isClosed) {
    return {
      cycleId: normalizedCycleId,
      processedEmployees: 0,
      recordsWritten: 0,
      significantDrops: 0,
      skippedMissingPrevious: 0,
      failedEmployees: 0,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  }

  const comparison = await fetchCycleRatingComparisonDataset(normalizedCycleId, { databases });

  let recordsWritten = 0;
  let significantDrops = 0;
  let skippedMissingPrevious = comparison.skippedNoPreviousCycle;
  let failedEmployees = 0;

  const riskComparisons = buildRatingDropComparisonDataset(comparison.rows);
  const managerByEmployee = new Map(
    comparison.rows.map((row) => [String(row?.employeeId || "").trim(), String(row?.managerId || "").trim()])
  );

  for (const row of riskComparisons) {
    try {
      const employeeId = String(row.employeeId || "").trim();
      const currentRating = row.currentRating;
      const previousRating = row.previousRating;
      const dropAmount = row.drop;
      const isSignificantDrop = row.riskLevel === RATING_DROP_RISK_LEVELS.HIGH_RISK;

      const record = {
        employeeId,
        managerId: managerByEmployee.get(employeeId) || null,
        cycleId: normalizedCycleId,
        previousRating,
        currentRating,
        drop: dropAmount,
        riskLevel: row.riskLevel,
        createdAt: toIso(),
      };

      const wrote = await upsertAnalysisRecordSafe(databases, record);
      if (wrote) {
        recordsWritten += 1;
      }
      if (isSignificantDrop) {
        significantDrops += 1;
      }
    } catch (error) {
      failedEmployees += 1;
      logger?.warn?.("[rating-drop-analysis] failed for employee", {
        cycleId: normalizedCycleId,
        employeeId: String(row?.employeeId || "").trim() || null,
        message: String(error?.message || "unknown error"),
      });
    }
  }

  skippedMissingPrevious += comparison.skippedMissingRatings;

  const summary = {
    cycleId: normalizedCycleId,
    processedEmployees: riskComparisons.length,
    recordsWritten,
    significantDrops,
    skippedMissingPrevious,
    failedEmployees,
    startedAt,
    finishedAt: new Date().toISOString(),
  };

  if (failedEmployees > 0) {
    logger?.warn?.("[rating-drop-analysis] completed with partial failures", summary);
  }

  return summary;
}
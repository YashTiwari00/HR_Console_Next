import { appwriteConfig } from "@/lib/appwrite";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { ID, Query, databaseId } from "@/lib/appwriteServer";
import { scoreX100ToLabel } from "@/lib/ratings";
import { computeReadiness } from "@/lib/succession/readinessEngine";
import {
  listHrRecipientIds,
  notifySuccessionTagTransition,
} from "@/app/api/hr/succession/_lib/notifications";

const PAGE_LIMIT = 100;
const WRITE_BATCH_SIZE = 20;
const STABLE_DELTA_PERCENT = 3;

function toFiniteNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toIsoNow() {
  return new Date().toISOString();
}

function normalizeCycleId(value) {
  const text = String(value || "").trim().toUpperCase();
  return text || null;
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
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

function parseBodyCycleId(body) {
  if (!body || typeof body !== "object") return null;
  return normalizeCycleId(body.cycleId);
}

function latestByTimestamp(rows, keyCandidates) {
  const source = Array.isArray(rows) ? rows : [];
  if (source.length === 0) return null;

  const keys = Array.isArray(keyCandidates) ? keyCandidates : [];

  return source.reduce((latest, row) => {
    const rowTs = keys.reduce((maxTs, key) => {
      const ts = new Date(row?.[key] || 0).valueOf();
      return Number.isNaN(ts) ? maxTs : Math.max(maxTs, ts);
    }, 0);

    const latestTs = keys.reduce((maxTs, key) => {
      const ts = new Date(latest?.[key] || 0).valueOf();
      return Number.isNaN(ts) ? maxTs : Math.max(maxTs, ts);
    }, 0);

    return rowTs > latestTs ? row : latest;
  }, source[0]);
}

function groupByEmployee(rows) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const employeeId = String(row?.employeeId || "").trim();
    if (!employeeId) continue;

    const bucket = map.get(employeeId) || [];
    bucket.push(row);
    map.set(employeeId, bucket);
  }
  return map;
}

function scoreRowsByRecency(rows) {
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const aTs = new Date(a?.computedAt || a?.$createdAt || 0).valueOf();
    const bTs = new Date(b?.computedAt || b?.$createdAt || 0).valueOf();
    return bTs - aTs;
  });
}

function inferTrend(scoreRows) {
  const values = scoreRows
    .slice(0, 3)
    .map((row) => toFiniteNumber(row?.scoreX100, null))
    .filter((value) => Number.isFinite(value));

  if (values.length <= 1) {
    return { trendLabel: "new", trendDeltaPercent: 0 };
  }

  const latest = values[0];
  const oldest = values[values.length - 1];
  const baseline = Math.max(Math.abs(oldest), 1);
  const deltaPercent = Number((((latest - oldest) / baseline) * 100).toFixed(2));

  if (Math.abs(deltaPercent) <= STABLE_DELTA_PERCENT) {
    return { trendLabel: "stable", trendDeltaPercent: deltaPercent };
  }

  return {
    trendLabel: deltaPercent > 0 ? "improving" : "declining",
    trendDeltaPercent: deltaPercent,
  };
}

function toPerformanceBand(scoreX100) {
  const score = toFiniteNumber(scoreX100, 0);
  if (score >= 380) return "high";
  if (score >= 280) return "medium";
  return "low";
}

function toPotentialBand(scoreX100, trendLabel, trendDeltaPercent) {
  const score = toFiniteNumber(scoreX100, 0);
  if (score >= 400 || trendDeltaPercent >= 20 || trendLabel === "improving") return "high";
  if (score >= 300 || trendDeltaPercent >= 5) return "medium";
  return "low";
}

function toReadinessBand(performanceBand, potentialBand) {
  if (performanceBand === "high" && potentialBand === "high") return "ready_now";

  if (
    (performanceBand === "high" && potentialBand === "medium") ||
    (performanceBand === "medium" && potentialBand === "high") ||
    (performanceBand === "medium" && potentialBand === "medium")
  ) {
    return "ready_1_2_years";
  }

  return "emerging";
}

function toGoalCompletionConsistency(goals) {
  const rows = Array.isArray(goals) ? goals : [];
  if (rows.length === 0) return null;

  const normalized = rows
    .map((goal) => {
      const status = normalizeStatus(goal?.status);
      if (status === "closed") return 100;

      const progress = toFiniteNumber(goal?.progressPercent ?? goal?.processPercent, null);
      if (!Number.isFinite(progress)) return null;
      return Math.max(0, Math.min(100, progress));
    })
    .filter((value) => Number.isFinite(value));

  if (normalized.length === 0) return null;
  const avg = normalized.reduce((sum, value) => sum + value, 0) / normalized.length;
  return Number(avg.toFixed(2));
}

function buildReadinessReason(result) {
  const explainability = result?.explainability || {};
  const factors = Array.isArray(explainability?.factors)
    ? explainability.factors.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  const summary = String(explainability?.summary || result?.reason || "").trim();

  return JSON.stringify({
    factors,
    summary,
  });
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

    if (docs.length < PAGE_LIMIT) break;
    cursor = docs[docs.length - 1].$id;
  }

  return all;
}

async function listCollectionByEmployeesSafe(databases, collectionId, employeeIds, options = {}) {
  if (!Array.isArray(employeeIds) || employeeIds.length === 0) return [];

  const query = [Query.equal("employeeId", employeeIds)];
  if (options.cycleId) {
    query.push(Query.equal("cycleId", options.cycleId));
  }

  if (options.orderBy) {
    query.push(Query.orderDesc(options.orderBy));
  }

  try {
    return await listAllDocumentsSafe(databases, collectionId, query);
  } catch (error) {
    if (isMissingCollectionError(error, collectionId)) {
      return [];
    }
    throw error;
  }
}

async function listEmployeesPage(databases, cursor = null) {
  const queries = [
    Query.equal("role", "employee"),
    Query.orderAsc("$id"),
    Query.limit(PAGE_LIMIT),
  ];

  if (cursor) {
    queries.push(Query.cursorAfter(cursor));
  }

  const response = await databases.listDocuments(
    databaseId,
    appwriteConfig.usersCollectionId,
    queries
  );

  return response.documents || [];
}

async function writeInBatches(items, handler) {
  const rows = Array.isArray(items) ? items : [];

  for (let index = 0; index < rows.length; index += WRITE_BATCH_SIZE) {
    const chunk = rows.slice(index, index + WRITE_BATCH_SIZE);
    await Promise.all(chunk.map((row) => handler(row)));
  }
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const cycleId = parseBodyCycleId(body);
    const evaluatedAt = toIsoNow();
    const evaluatedBy = String(profile?.$id || profile?.userId || "system").trim() || "system";
    const hrRecipientIds = await listHrRecipientIds(databases);

    let cursor = null;
    let totalProcessed = 0;
    const tagDistribution = {
      ready: 0,
      needs_development: 0,
      watch: 0,
    };

    while (true) {
      const employees = await listEmployeesPage(databases, cursor);
      if (employees.length === 0) break;

      const employeeIds = employees.map((employee) => String(employee.$id || "").trim()).filter(Boolean);

      const [scoreRows, snapshotRows, ratingDropRows, goalRows] = await Promise.all([
        listCollectionByEmployeesSafe(
          databases,
          appwriteConfig.employeeCycleScoresCollectionId,
          employeeIds,
          { cycleId, orderBy: "computedAt" }
        ),
        listCollectionByEmployeesSafe(
          databases,
          appwriteConfig.talentSnapshotsCollectionId,
          employeeIds,
          { cycleId, orderBy: "computedAt" }
        ),
        listCollectionByEmployeesSafe(
          databases,
          appwriteConfig.ratingDropInsightsCollectionId,
          employeeIds,
          { cycleId, orderBy: "createdAt" }
        ),
        listCollectionByEmployeesSafe(
          databases,
          appwriteConfig.goalsCollectionId,
          employeeIds,
          { cycleId, orderBy: "$updatedAt" }
        ),
      ]);

      const scoresByEmployee = groupByEmployee(scoreRows);
      const snapshotsByEmployee = groupByEmployee(snapshotRows);
      const ratingByEmployee = groupByEmployee(ratingDropRows);
      const goalsByEmployee = groupByEmployee(goalRows);

      const mutations = [];

      for (const employee of employees) {
        const employeeId = String(employee?.$id || "").trim();
        if (!employeeId) continue;

        const historyScores = scoreRowsByRecency(scoresByEmployee.get(employeeId) || []).slice(0, 3);
        const latestSnapshot = latestByTimestamp(snapshotsByEmployee.get(employeeId) || [], [
          "lastEvaluatedAt",
          "computedAt",
          "$updatedAt",
          "$createdAt",
        ]);

        const latestScore = historyScores[0] || null;
        const snapshotCycleId =
          cycleId ||
          normalizeCycleId(latestSnapshot?.cycleId) ||
          normalizeCycleId(latestScore?.cycleId);

        // Required talent_snapshot fields need at least a cycle context and score baseline.
        if (!latestSnapshot && (!snapshotCycleId || !latestScore)) {
          continue;
        }

        const inferredTrend = inferTrend(historyScores);
        const trendLabel =
          String(latestSnapshot?.trendLabel || "").trim() || inferredTrend.trendLabel;
        const trendDeltaPercent = toFiniteNumber(
          latestSnapshot?.trendDeltaPercent,
          inferredTrend.trendDeltaPercent
        );

        const completionConsistency = toGoalCompletionConsistency(goalsByEmployee.get(employeeId) || []);
        const latestRatingDrop = latestByTimestamp(ratingByEmployee.get(employeeId) || [], [
          "createdAt",
          "$createdAt",
        ]);

        const readiness = computeReadiness({
          employeeCycleScores: historyScores,
          trajectoryTrend: {
            trendLabel,
            trendDeltaPercent,
          },
          ratingDropAnalysis: latestRatingDrop || null,
          goalCompletionConsistency: completionConsistency,
        });

        const nextTag = readiness.suggestedTag;
        const readinessReason = buildReadinessReason(readiness);
        const previousSuccessionTag = String(latestSnapshot?.successionTag || "").trim().toLowerCase() || null;

        const baseScoreX100 = toFiniteNumber(
          latestSnapshot?.scoreX100,
          toFiniteNumber(latestScore?.scoreX100, 0)
        );

        const basePerformanceBand =
          String(latestSnapshot?.performanceBand || "").trim() || toPerformanceBand(baseScoreX100);
        const basePotentialBand =
          String(latestSnapshot?.potentialBand || "").trim() ||
          toPotentialBand(baseScoreX100, trendLabel, trendDeltaPercent);

        const payload = {
          employeeId,
          managerId: String(latestSnapshot?.managerId || employee?.managerId || "").trim() || null,
          cycleId: snapshotCycleId,
          scoreX100: Math.max(0, Math.min(500, Math.round(baseScoreX100))),
          scoreLabel:
            String(latestSnapshot?.scoreLabel || "").trim() || scoreX100ToLabel(baseScoreX100) || "NI",
          trendLabel,
          trendDeltaPercent: Math.round(trendDeltaPercent),
          performanceBand: basePerformanceBand,
          potentialBand: basePotentialBand,
          readinessBand:
            String(latestSnapshot?.readinessBand || "").trim() ||
            toReadinessBand(basePerformanceBand, basePotentialBand),
          computedAt: String(latestSnapshot?.computedAt || latestScore?.computedAt || evaluatedAt),
          source: String(latestSnapshot?.source || "succession.evaluate").trim() || "succession.evaluate",
          successionTag: nextTag,
          readinessScore: readiness.readinessScore,
          readinessReason,
          lastEvaluatedAt: evaluatedAt,
          evaluatedBy,
        };

        mutations.push({
          existingSnapshotId: latestSnapshot?.$id || null,
          payload,
          tag: nextTag,
          previousSuccessionTag,
          employeeName: String(employee?.name || employee?.email || employeeId).trim() || employeeId,
        });
      }

      await writeInBatches(mutations, async (item) => {
        if (item.existingSnapshotId) {
          await databases.updateDocument(
            databaseId,
            appwriteConfig.talentSnapshotsCollectionId,
            item.existingSnapshotId,
            item.payload
          );
        } else {
          await databases.createDocument(
            databaseId,
            appwriteConfig.talentSnapshotsCollectionId,
            ID.unique(),
            item.payload
          );
        }

        totalProcessed += 1;
        if (Object.prototype.hasOwnProperty.call(tagDistribution, item.tag)) {
          tagDistribution[item.tag] += 1;
        }

        try {
          await notifySuccessionTagTransition(databases, {
            employeeId: item.payload.employeeId,
            employeeName: item.employeeName,
            managerId: item.payload.managerId,
            previousTag: item.previousSuccessionTag,
            nextTag: item.payload.successionTag,
            cycleId: item.payload.cycleId,
            updatedAt: evaluatedAt,
            actorId: evaluatedBy,
            hrRecipientIds,
          });
        } catch {
          // Notification failures must never block succession evaluation writes.
        }
      });

      if (employees.length < PAGE_LIMIT) {
        break;
      }

      cursor = employees[employees.length - 1].$id;
    }

    return Response.json({
      data: {
        cycleId,
        totalProcessed,
        tagDistribution,
        evaluatedAt,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

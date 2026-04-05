import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";

function isMissingCollectionError(error, collectionId) {
  const message = String(error?.message || "").toLowerCase();
  const target = String(collectionId || "").trim().toLowerCase();
  return (
    message.includes("collection") &&
    (message.includes("not found") || message.includes("could not be found")) &&
    (!target || message.includes(target))
  );
}

async function listAllDocuments(databases, collectionId, queries = []) {
  const all = [];
  let cursor = null;

  while (true) {
    const nextQueries = [...queries, Query.limit(100)];
    if (cursor) {
      nextQueries.push(Query.cursorAfter(cursor));
    }

    const result = await databases.listDocuments(databaseId, collectionId, nextQueries);
    const rows = result.documents || [];
    all.push(...rows);

    if (rows.length < 100) break;
    cursor = rows[rows.length - 1].$id;
  }

  return all;
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toTrend(rows) {
  if (!Array.isArray(rows) || rows.length <= 1) {
    return { trendLabel: "new", trendDeltaPercent: 0 };
  }

  const sorted = [...rows].sort((a, b) => {
    const aTs = new Date(a.computedAt || a.$createdAt || 0).valueOf();
    const bTs = new Date(b.computedAt || b.$createdAt || 0).valueOf();
    return aTs - bTs;
  });

  const first = toNumber(sorted[0]?.scoreX100, 0);
  const last = toNumber(sorted[sorted.length - 1]?.scoreX100, 0);
  const baseline = Math.max(Math.abs(first), 1);
  const deltaPercent = Number((((last - first) / baseline) * 100).toFixed(2));

  if (Math.abs(deltaPercent) <= 3) {
    return { trendLabel: "stable", trendDeltaPercent: deltaPercent };
  }

  return {
    trendLabel: deltaPercent > 0 ? "improving" : "declining",
    trendDeltaPercent: deltaPercent,
  };
}

function toPerformanceBand(scoreX100) {
  const score = toNumber(scoreX100, 0);
  if (score >= 380) return "high";
  if (score >= 280) return "medium";
  return "low";
}

function toPotentialBand(scoreX100, trendLabel, trendDeltaPercent) {
  const score = toNumber(scoreX100, 0);
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

export async function buildTalentSnapshots(databases, options = {}) {
  const cycleFilter = String(options.cycleId || "").trim();

  const [users, scores] = await Promise.all([
    listAllDocuments(databases, appwriteConfig.usersCollectionId, [
      Query.equal("role", "employee"),
      Query.orderDesc("$createdAt"),
    ]),
    (async () => {
      try {
        const queries = [Query.orderDesc("computedAt")];
        if (cycleFilter) queries.push(Query.equal("cycleId", cycleFilter));
        return await listAllDocuments(databases, appwriteConfig.employeeCycleScoresCollectionId, queries);
      } catch (error) {
        if (isMissingCollectionError(error, appwriteConfig.employeeCycleScoresCollectionId)) {
          return [];
        }
        throw error;
      }
    })(),
  ]);

  const scoresByEmployee = new Map();
  for (const row of scores) {
    const employeeId = String(row.employeeId || "").trim();
    if (!employeeId) continue;

    const list = scoresByEmployee.get(employeeId) || [];
    list.push(row);
    scoresByEmployee.set(employeeId, list);
  }

  const snapshots = [];

  for (const employee of users) {
    const employeeId = String(employee.$id || "").trim();
    if (!employeeId) continue;

    const history = (scoresByEmployee.get(employeeId) || []).slice(0, 3);
    if (history.length === 0) continue;

    const latest = history[0];
    const trend = toTrend(history);
    const performanceBand = toPerformanceBand(latest.scoreX100);
    const potentialBand = toPotentialBand(latest.scoreX100, trend.trendLabel, trend.trendDeltaPercent);
    const readinessBand = toReadinessBand(performanceBand, potentialBand);

    snapshots.push({
      employeeId,
      employeeName: String(employee.name || employee.email || employeeId).trim(),
      department: String(employee.department || "Unassigned").trim() || "Unassigned",
      managerId: String(employee.managerId || "").trim() || null,
      cycleId: String(latest.cycleId || "").trim() || null,
      scoreX100: toNumber(latest.scoreX100, 0),
      scoreLabel: String(latest.scoreLabel || "").trim() || null,
      trendLabel: trend.trendLabel,
      trendDeltaPercent: trend.trendDeltaPercent,
      performanceBand,
      potentialBand,
      readinessBand,
      computedAt: latest.computedAt || latest.$createdAt || null,
    });
  }

  return snapshots;
}

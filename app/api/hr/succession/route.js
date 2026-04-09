import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";

const PAGE_LIMIT = 100;
const CHUNK_SIZE = 100;

const ALLOWED_TAGS = new Set(["ready", "needs_development", "watch"]);
const ALLOWED_BANDS = new Set(["high", "medium", "low"]);

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeTag(value) {
  return normalizeText(value).toLowerCase();
}

function isNotFoundCollection(error, collectionId) {
  const message = String(error?.message || "").toLowerCase();
  const target = String(collectionId || "").trim().toLowerCase();

  return (
    message.includes("collection") &&
    (message.includes("could not be found") || message.includes("not found")) &&
    (!target || message.includes(target))
  );
}

function chunk(values, size) {
  const source = Array.isArray(values) ? values : [];
  const rows = [];

  for (let i = 0; i < source.length; i += size) {
    rows.push(source.slice(i, i + size));
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

function pickLatestSnapshotPerEmployee(rows) {
  const map = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const employeeId = normalizeText(row?.employeeId);
    if (!employeeId) continue;

    const existing = map.get(employeeId);
    if (!existing) {
      map.set(employeeId, row);
      continue;
    }

    const currentTs = new Date(
      row?.lastEvaluatedAt || row?.updatedAt || row?.computedAt || row?.$updatedAt || row?.$createdAt || 0
    ).valueOf();

    const existingTs = new Date(
      existing?.lastEvaluatedAt ||
        existing?.updatedAt ||
        existing?.computedAt ||
        existing?.$updatedAt ||
        existing?.$createdAt ||
        0
    ).valueOf();

    if (currentTs > existingTs) {
      map.set(employeeId, row);
    }
  }

  return map;
}

async function fetchUsersByIds(databases, userIds) {
  const ids = Array.from(new Set((Array.isArray(userIds) ? userIds : []).map(normalizeText).filter(Boolean)));
  if (ids.length === 0) return new Map();

  const userMap = new Map();
  const chunks = chunk(ids, CHUNK_SIZE);

  for (const idChunk of chunks) {
    const docs = await listAllDocumentsSafe(databases, appwriteConfig.usersCollectionId, [
      Query.equal("$id", idChunk),
    ]);

    for (const doc of docs) {
      userMap.set(normalizeText(doc?.$id), doc);
    }
  }

  return userMap;
}

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr", "leadership"]);

    const { searchParams } = new URL(request.url);

    const successionTagFilter = normalizeTag(searchParams.get("successionTag"));
    const departmentFilter = normalizeText(searchParams.get("department")).toLowerCase();
    const performanceBandFilter = normalizeText(searchParams.get("performanceBand")).toLowerCase();
    const cycleId = normalizeText(searchParams.get("cycleId")).toUpperCase();

    if (successionTagFilter && !ALLOWED_TAGS.has(successionTagFilter)) {
      return Response.json(
        { error: "successionTag must be one of: ready, needs_development, watch." },
        { status: 400 }
      );
    }

    if (performanceBandFilter && !ALLOWED_BANDS.has(performanceBandFilter)) {
      return Response.json(
        { error: "performanceBand must be one of: high, medium, low." },
        { status: 400 }
      );
    }

    const snapshotQueries = [Query.orderDesc("$updatedAt")];
    if (cycleId) snapshotQueries.push(Query.equal("cycleId", cycleId));
    if (successionTagFilter) snapshotQueries.push(Query.equal("successionTag", successionTagFilter));
    if (performanceBandFilter) snapshotQueries.push(Query.equal("performanceBand", performanceBandFilter));

    let snapshotRows = [];
    try {
      snapshotRows = await listAllDocumentsSafe(
        databases,
        appwriteConfig.talentSnapshotsCollectionId,
        snapshotQueries
      );
    } catch (error) {
      if (isNotFoundCollection(error, appwriteConfig.talentSnapshotsCollectionId)) {
        return Response.json({ data: { filters: { successionTag: successionTagFilter || null, department: departmentFilter || null, performanceBand: performanceBandFilter || null, cycleId: cycleId || null }, total: 0, rows: [] } });
      }
      throw error;
    }

    const latestByEmployee = pickLatestSnapshotPerEmployee(snapshotRows);
    const employeeIds = Array.from(latestByEmployee.keys());
    const usersById = await fetchUsersByIds(databases, employeeIds);

    const rows = [];

    for (const employeeId of employeeIds) {
      const snapshot = latestByEmployee.get(employeeId);
      if (!snapshot) continue;

      const user = usersById.get(employeeId) || null;
      const department = normalizeText(user?.department || "Unassigned") || "Unassigned";

      if (departmentFilter && department.toLowerCase() !== departmentFilter) {
        continue;
      }

      rows.push({
        employeeId,
        name: normalizeText(user?.name || user?.email || employeeId),
        role: normalizeText(user?.role || "employee") || "employee",
        performanceBand: normalizeText(snapshot?.performanceBand || null) || null,
        potentialBand: normalizeText(snapshot?.potentialBand || null) || null,
        readinessScore: Number.isFinite(Number(snapshot?.readinessScore))
          ? Number(snapshot.readinessScore)
          : null,
        successionTag: normalizeText(snapshot?.successionTag || null) || null,
        readinessReason: normalizeText(snapshot?.readinessReason || null) || null,
        trendLabel: normalizeText(snapshot?.trendLabel || null) || null,
      });
    }

    return Response.json({
      data: {
        filters: {
          successionTag: successionTagFilter || null,
          department: departmentFilter || null,
          performanceBand: performanceBandFilter || null,
          cycleId: cycleId || null,
        },
        total: rows.length,
        rows,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

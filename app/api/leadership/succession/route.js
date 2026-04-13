import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { buildTalentSnapshots } from "@/app/api/_lib/talentSnapshot";

const PERFORMANCE_BANDS = ["high", "medium", "low"];
const POTENTIAL_BANDS = ["high", "medium", "low"];
const PAGE_LIMIT = 100;
const CRITICAL_ROLES = new Set(["manager", "leadership"]);

function toPct(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }

  return Number(((numerator / denominator) * 100).toFixed(2));
}

function toFiniteNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeBusinessUnit(user, departmentFallback = "Unassigned") {
  const explicit = normalizeText(user?.businessUnit);
  if (explicit) return explicit;

  const region = normalizeText(user?.region);
  if (region) return region;

  return normalizeText(departmentFallback, "Unassigned");
}

function isReadySuccessor(row) {
  const tag = normalizeText(row?.successionTag).toLowerCase();
  const readinessBand = normalizeText(row?.readinessBand).toLowerCase();
  return tag === "ready" || readinessBand === "ready_now";
}

function isReadySoon(row) {
  const readinessBand = normalizeText(row?.readinessBand).toLowerCase();
  return readinessBand === "ready_1_2_years";
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

function buildGroupedSummary(rows, keyName) {
  const map = new Map();

  for (const row of rows) {
    const key = normalizeText(row?.[keyName], "Unassigned");
    const bucket = map.get(key) || {
      [keyName]: key,
      totalEmployees: 0,
      readySuccessors: 0,
      readySoon: 0,
      highPotential: 0,
      readinessScoreSum: 0,
      readinessScoreCount: 0,
    };

    bucket.totalEmployees += 1;
    if (isReadySuccessor(row)) bucket.readySuccessors += 1;
    if (isReadySoon(row)) bucket.readySoon += 1;
    if (normalizeText(row?.potentialBand).toLowerCase() === "high") bucket.highPotential += 1;

    const readinessScore = toFiniteNumber(row?.readinessScore, null);
    if (Number.isFinite(readinessScore)) {
      bucket.readinessScoreSum += readinessScore;
      bucket.readinessScoreCount += 1;
    }

    map.set(key, bucket);
  }

  return Array.from(map.values())
    .map((item) => ({
      [keyName]: item[keyName],
      totalEmployees: item.totalEmployees,
      readySuccessors: item.readySuccessors,
      readySoon: item.readySoon,
      readySuccessorPct: toPct(item.readySuccessors, item.totalEmployees),
      highPotential: item.highPotential,
      avgReadinessScore:
        item.readinessScoreCount > 0
          ? Number((item.readinessScoreSum / item.readinessScoreCount).toFixed(2))
          : 0,
    }))
    .sort((a, b) => b.readySuccessorPct - a.readySuccessorPct || b.totalEmployees - a.totalEmployees);
}

function buildMatrixRows(snapshots) {
  const rows = [];

  for (const potentialBand of POTENTIAL_BANDS) {
    for (const performanceBand of PERFORMANCE_BANDS) {
      const matches = snapshots.filter(
        (item) => item.potentialBand === potentialBand && item.performanceBand === performanceBand
      );

      rows.push({
        boxKey: `${potentialBand}_${performanceBand}`,
        potentialBand,
        performanceBand,
        count: matches.length,
      });
    }
  }

  return rows;
}

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["leadership"]);

    const { searchParams } = new URL(request.url);
    const cycleId = String(searchParams.get("cycleId") || "").trim();

    const [snapshots, users] = await Promise.all([
      buildTalentSnapshots(databases, { cycleId: cycleId || undefined }),
      listAllDocuments(databases, appwriteConfig.usersCollectionId, [
        Query.equal("role", ["employee", "manager", "leadership", "region-admin"]),
      ]),
    ]);

    const usersById = new Map(
      users.map((item) => [normalizeText(item?.$id), item]).filter((entry) => Boolean(entry[0]))
    );

    const enrichedSnapshots = snapshots.map((row) => {
      const employeeId = normalizeText(row?.employeeId);
      const user = usersById.get(employeeId) || null;
      const department = normalizeText(row?.department || user?.department, "Unassigned");
      const businessUnit = normalizeBusinessUnit(user, department);

      return {
        ...row,
        employeeId,
        department,
        businessUnit,
      };
    });

    const readinessCounts = {
      ready_now: enrichedSnapshots.filter((item) => item.readinessBand === "ready_now").length,
      ready_1_2_years: enrichedSnapshots.filter((item) => item.readinessBand === "ready_1_2_years").length,
      emerging: enrichedSnapshots.filter((item) => item.readinessBand === "emerging").length,
    };

    const readySuccessorCount = enrichedSnapshots.filter(isReadySuccessor).length;
    const readySoonCount = enrichedSnapshots.filter(isReadySoon).length;

    const byDepartment = new Map();
    for (const row of enrichedSnapshots) {
      const department = String(row.department || "Unassigned").trim() || "Unassigned";
      const bucket = byDepartment.get(department) || {
        department,
        totalEmployees: 0,
        readyNow: 0,
        readySoon: 0,
      };

      bucket.totalEmployees += 1;
      if (row.readinessBand === "ready_now") bucket.readyNow += 1;
      if (row.readinessBand === "ready_1_2_years") bucket.readySoon += 1;
      byDepartment.set(department, bucket);
    }

    const departmentBenchStrength = Array.from(byDepartment.values())
      .map((item) => ({
        ...item,
        readyPct:
          item.totalEmployees > 0
            ? Number((((item.readyNow + item.readySoon) / item.totalEmployees) * 100).toFixed(2))
            : 0,
      }))
      .sort((a, b) => a.readyPct - b.readyPct || b.totalEmployees - a.totalEmployees);

    const riskDepartments = departmentBenchStrength.filter((item) => item.readyPct < 20).slice(0, 5);

    const groupedByDepartment = buildGroupedSummary(enrichedSnapshots, "department");
    const groupedByBusinessUnit = buildGroupedSummary(enrichedSnapshots, "businessUnit");

    const highPotentialBySegment = new Map();
    for (const row of enrichedSnapshots) {
      if (normalizeText(row?.potentialBand).toLowerCase() !== "high") continue;

      const department = normalizeText(row?.department, "Unassigned");
      const businessUnit = normalizeText(row?.businessUnit, "Unassigned");
      const key = `${department}::${businessUnit}`;

      const bucket = highPotentialBySegment.get(key) || {
        department,
        businessUnit,
        employeeCount: 0,
        readinessScoreSum: 0,
        readinessScoreCount: 0,
        readySuccessors: 0,
      };

      bucket.employeeCount += 1;
      if (isReadySuccessor(row)) bucket.readySuccessors += 1;

      const score = toFiniteNumber(row?.readinessScore, null);
      if (Number.isFinite(score)) {
        bucket.readinessScoreSum += score;
        bucket.readinessScoreCount += 1;
      }

      highPotentialBySegment.set(key, bucket);
    }

    const topHighPotentialEmployees = Array.from(highPotentialBySegment.values())
      .map((item) => ({
        department: item.department,
        businessUnit: item.businessUnit,
        employeeCount: item.employeeCount,
        avgReadinessScore:
          item.readinessScoreCount > 0
            ? Number((item.readinessScoreSum / item.readinessScoreCount).toFixed(2))
            : 0,
        readySuccessors: item.readySuccessors,
      }))
      .sort((a, b) => b.avgReadinessScore - a.avgReadinessScore || b.employeeCount - a.employeeCount)
      .slice(0, 10);

    const criticalRoleUsers = users.filter((item) => {
      const role = normalizeText(item?.role).toLowerCase();
      return CRITICAL_ROLES.has(role);
    });

    const criticalRoleRecords = criticalRoleUsers.map((item) => {
      const userId = normalizeText(item?.$id);
      const role = normalizeText(item?.role).toLowerCase();
      const department = normalizeText(item?.department, "Unassigned");
      const businessUnit = normalizeBusinessUnit(item, department);

      let successorPool = [];

      if (role === "manager") {
        successorPool = enrichedSnapshots.filter(
          (row) => normalizeText(row?.managerId) === userId && isReadySuccessor(row)
        );
      } else {
        successorPool = enrichedSnapshots.filter(
          (row) =>
            normalizeText(row?.department, "Unassigned") === department &&
            normalizeText(row?.businessUnit, "Unassigned") === businessUnit &&
            isReadySuccessor(row)
        );
      }

      return {
        role,
        department,
        businessUnit,
        hasSuccessor: successorPool.length > 0,
      };
    });

    const totalCriticalRoles = criticalRoleRecords.length;
    const withoutSuccessors = criticalRoleRecords.filter((item) => !item.hasSuccessor).length;

    const criticalByRoleMap = new Map();
    const criticalByDepartmentMap = new Map();
    const criticalByBusinessUnitMap = new Map();

    for (const row of criticalRoleRecords) {
      const roleBucket = criticalByRoleMap.get(row.role) || {
        role: row.role,
        totalCriticalRoles: 0,
        withoutSuccessors: 0,
      };
      roleBucket.totalCriticalRoles += 1;
      if (!row.hasSuccessor) roleBucket.withoutSuccessors += 1;
      criticalByRoleMap.set(row.role, roleBucket);

      const deptBucket = criticalByDepartmentMap.get(row.department) || {
        department: row.department,
        totalCriticalRoles: 0,
        withoutSuccessors: 0,
      };
      deptBucket.totalCriticalRoles += 1;
      if (!row.hasSuccessor) deptBucket.withoutSuccessors += 1;
      criticalByDepartmentMap.set(row.department, deptBucket);

      const buBucket = criticalByBusinessUnitMap.get(row.businessUnit) || {
        businessUnit: row.businessUnit,
        totalCriticalRoles: 0,
        withoutSuccessors: 0,
      };
      buBucket.totalCriticalRoles += 1;
      if (!row.hasSuccessor) buBucket.withoutSuccessors += 1;
      criticalByBusinessUnitMap.set(row.businessUnit, buBucket);
    }

    const toCriticalRows = (rows) =>
      Array.from(rows.values())
        .map((item) => ({
          ...item,
          withoutSuccessorPct: toPct(item.withoutSuccessors, item.totalCriticalRoles),
        }))
        .sort((a, b) => b.withoutSuccessorPct - a.withoutSuccessorPct || b.totalCriticalRoles - a.totalCriticalRoles);

    return Response.json({
      data: {
        cycleId: cycleId || null,
        totalEmployees: enrichedSnapshots.length,
        readinessCounts,
        matrixRows: buildMatrixRows(enrichedSnapshots),
        departmentBenchStrength,
        riskDepartments,
        readySuccessorPct: toPct(readySuccessorCount, enrichedSnapshots.length),
        readySoonPct: toPct(readySoonCount, enrichedSnapshots.length),
        criticalRolesWithoutSuccessors: {
          totalCriticalRoles,
          withoutSuccessors,
          withoutSuccessorPct: toPct(withoutSuccessors, totalCriticalRoles),
          byRole: toCriticalRows(criticalByRoleMap),
          byDepartment: toCriticalRows(criticalByDepartmentMap),
          byBusinessUnit: toCriticalRows(criticalByBusinessUnitMap),
        },
        topHighPotentialEmployees,
        groupedByDepartment,
        groupedByBusinessUnit,
        privacy: {
          aggregatedOnly: true,
          containsRawEmployeeData: false,
        },
        asOf: new Date().toISOString(),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

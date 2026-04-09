import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { buildTalentSnapshots } from "@/app/api/_lib/talentSnapshot";
import { resolveAiMode } from "@/lib/ai/modes.js";

const PERFORMANCE_BANDS = ["high", "medium", "low"];
const POTENTIAL_BANDS = ["high", "medium", "low"];

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

function buildDecisionSupport(filtered, matrixRows) {
  const safeRows = Array.isArray(filtered) ? filtered : [];
  const departmentMap = new Map();

  for (const row of safeRows) {
    const department = String(row.department || "Unassigned").trim() || "Unassigned";
    const bucket = departmentMap.get(department) || {
      department,
      total: 0,
      readyNow: 0,
      readySoon: 0,
      lowPerformance: 0,
      highPotential: 0,
    };

    bucket.total += 1;
    if (row.readinessBand === "ready_now") bucket.readyNow += 1;
    if (row.readinessBand === "ready_1_2_years") bucket.readySoon += 1;
    if (row.performanceBand === "low") bucket.lowPerformance += 1;
    if (row.potentialBand === "high") bucket.highPotential += 1;

    departmentMap.set(department, bucket);
  }

  const departmentSignals = Array.from(departmentMap.values())
    .map((item) => {
      const benchStrengthPct = item.total > 0
        ? Number((((item.readyNow + item.readySoon) / item.total) * 100).toFixed(2))
        : 0;

      const lowPerformancePct = item.total > 0
        ? Number(((item.lowPerformance / item.total) * 100).toFixed(2))
        : 0;

      return {
        department: item.department,
        totalEmployees: item.total,
        benchStrengthPct,
        lowPerformancePct,
      };
    })
    .sort((a, b) => a.benchStrengthPct - b.benchStrengthPct || b.lowPerformancePct - a.lowPerformancePct);

  const riskDepartments = departmentSignals
    .filter((item) => item.totalEmployees >= 3 && (item.benchStrengthPct < 25 || item.lowPerformancePct >= 40))
    .slice(0, 5);

  const highestDensityCells = [...(matrixRows || [])]
    .sort((a, b) => Number(b.count || 0) - Number(a.count || 0))
    .slice(0, 3)
    .map((item) => ({
      boxKey: item.boxKey,
      potentialBand: item.potentialBand,
      performanceBand: item.performanceBand,
      count: Number(item.count || 0),
    }));

  return {
    riskDepartments,
    highestDensityCells,
    recommendations: [
      "Prioritize succession plans for departments with low bench strength.",
      "Target coaching interventions for high-potential, low-performance cohorts.",
      "Review readiness movement monthly for teams with concentrated low-performance cells.",
    ],
  };
}

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    const { searchParams } = new URL(request.url);
    const cycleId = String(searchParams.get("cycleId") || "").trim();
    const department = String(searchParams.get("department") || "").trim();
    const rawMode = String(searchParams.get("mode") || "suggestion").trim();
    const resolvedMode = resolveAiMode(rawMode, profile.role);

    const snapshots = await buildTalentSnapshots(databases, { cycleId: cycleId || undefined });

    const filtered = snapshots.filter((item) => {
      if (department && String(item.department || "").trim() !== department) return false;
      return true;
    });

    const readinessCounts = {
      ready_now: filtered.filter((item) => item.readinessBand === "ready_now").length,
      ready_1_2_years: filtered.filter((item) => item.readinessBand === "ready_1_2_years").length,
      emerging: filtered.filter((item) => item.readinessBand === "emerging").length,
    };

    const matrixRows = buildMatrixRows(filtered);
    const decisionSupport =
      resolvedMode === "decision_support"
        ? buildDecisionSupport(filtered, matrixRows)
        : null;

    return Response.json({
      data: {
        currentMode: resolvedMode,
        cycleId: cycleId || null,
        department: department || null,
        totalEmployees: filtered.length,
        readinessCounts,
        matrixRows,
        employees: filtered,
        decisionSupport,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { buildTalentSnapshots } from "@/app/api/_lib/talentSnapshot";

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

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["leadership"]);

    const { searchParams } = new URL(request.url);
    const cycleId = String(searchParams.get("cycleId") || "").trim();

    const snapshots = await buildTalentSnapshots(databases, { cycleId: cycleId || undefined });

    const readinessCounts = {
      ready_now: snapshots.filter((item) => item.readinessBand === "ready_now").length,
      ready_1_2_years: snapshots.filter((item) => item.readinessBand === "ready_1_2_years").length,
      emerging: snapshots.filter((item) => item.readinessBand === "emerging").length,
    };

    const byDepartment = new Map();
    for (const row of snapshots) {
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

    return Response.json({
      data: {
        cycleId: cycleId || null,
        totalEmployees: snapshots.length,
        readinessCounts,
        matrixRows: buildMatrixRows(snapshots),
        departmentBenchStrength,
        riskDepartments,
        asOf: new Date().toISOString(),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

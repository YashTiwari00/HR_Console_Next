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
    requireRole(profile, ["hr"]);

    const { searchParams } = new URL(request.url);
    const cycleId = String(searchParams.get("cycleId") || "").trim();
    const department = String(searchParams.get("department") || "").trim();

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

    return Response.json({
      data: {
        cycleId: cycleId || null,
        department: department || null,
        totalEmployees: filtered.length,
        readinessCounts,
        matrixRows,
        employees: filtered,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

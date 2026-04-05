import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertManagerCanAccessEmployee } from "@/lib/teamAccess";

const MAX_POINTS = 3;
const STABLE_DELTA_PERCENT = 3;

function toIsoOrNull(value) {
  const text = String(value || "").trim();
  if (!text) return null;

  const time = new Date(text).valueOf();
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function toNumberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toSafeScoreX100(value) {
  const numeric = toNumberOrNull(value);
  if (numeric === null) return null;
  return Math.max(0, Math.round(numeric));
}

function roundToTwo(value) {
  return Number(Number(value || 0).toFixed(2));
}

function classifyTrend(cycles) {
  const validScores = cycles
    .map((item) => item?.scoreX100)
    .filter((score) => Number.isFinite(score));

  if (validScores.length <= 1) {
    return {
      trendLabel: "new",
      trendDeltaPercent: 0,
    };
  }

  const first = validScores[0];
  const last = validScores[validScores.length - 1];

  const deltaX100 = last - first;
  const baseline = Math.max(Math.abs(first), 1);
  const trendDeltaPercent = roundToTwo((deltaX100 / baseline) * 100);

  if (Math.abs(trendDeltaPercent) <= STABLE_DELTA_PERCENT) {
    return {
      trendLabel: "stable",
      trendDeltaPercent,
    };
  }

  return {
    trendLabel: deltaX100 > 0 ? "improving" : "declining",
    trendDeltaPercent,
  };
}

function getCycleTimelineDate(cycle) {
  return toIsoOrNull(cycle?.closedAt) || toIsoOrNull(cycle?.endDate) || null;
}

function isMissingCollectionError(error, collectionId) {
  const message = String(error?.message || "").toLowerCase();
  const normalizedCollectionId = String(collectionId || "").trim().toLowerCase();

  return (
    message.includes("collection") &&
    message.includes("requested id") &&
    message.includes("could not be found") &&
    (!normalizedCollectionId || message.includes(normalizedCollectionId))
  );
}

async function listEmployeeScoresSafe(databases, employeeId) {
  try {
    const response = await databases.listDocuments(
      databaseId,
      appwriteConfig.employeeCycleScoresCollectionId,
      [
        Query.equal("employeeId", employeeId),
        Query.orderDesc("computedAt"),
        Query.limit(MAX_POINTS),
      ]
    );

    return response.documents;
  } catch (error) {
    if (isMissingCollectionError(error, appwriteConfig.employeeCycleScoresCollectionId)) {
      return [];
    }

    throw error;
  }
}

async function getCyclesByNameSafe(databases, cycleNames) {
  const uniqueNames = Array.from(
    new Set(cycleNames.map((value) => String(value || "").trim()).filter(Boolean))
  );

  if (uniqueNames.length === 0) {
    return new Map();
  }

  try {
    const response = await databases.listDocuments(
      databaseId,
      appwriteConfig.goalCyclesCollectionId,
      [Query.equal("name", uniqueNames), Query.limit(100)]
    );

    return new Map(response.documents.map((item) => [String(item.name || "").trim(), item]));
  } catch (error) {
    if (isMissingCollectionError(error, appwriteConfig.goalCyclesCollectionId)) {
      return new Map();
    }

    throw error;
  }
}

function mapTrajectoryCycles(scoreRows, cyclesByName) {
  const safeRows = Array.isArray(scoreRows) ? scoreRows.filter(Boolean) : [];

  const mapped = safeRows.map((row) => {
    const cycleId = String(row.cycleId || "").trim();
    const cycle = cycleId ? cyclesByName.get(cycleId) : null;

    return {
      cycleId,
      cycleName: String(cycle?.name || cycleId || "").trim(),
      closedAt: getCycleTimelineDate(cycle),
      computedAt: toIsoOrNull(row.computedAt),
      scoreX100: toSafeScoreX100(row.scoreX100),
      scoreLabel: String(row.scoreLabel || "").trim() || null,
    };
  });

  return mapped
    .filter((item) => Boolean(item.cycleId) || Boolean(item.computedAt) || item.scoreX100 !== null)
    .slice()
    .sort((a, b) => {
      const aTime = new Date(a.closedAt || a.computedAt || 0).valueOf();
      const bTime = new Date(b.closedAt || b.computedAt || 0).valueOf();
      return aTime - bTime;
    });
}

async function assertCanReadTrajectory(databases, profile, employeeId) {
  const role = String(profile?.role || "").trim().toLowerCase();
  const profileId = String(profile?.$id || "").trim();

  if (role === "hr") return;

  if (role === "manager") {
    await assertManagerCanAccessEmployee(databases, profileId, employeeId);
    return;
  }

  if (role === "employee" && employeeId === profileId) {
    return;
  }

  const error = new Error("Forbidden for requested employee.");
  error.statusCode = 403;
  throw error;
}

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "hr"]);

    const { searchParams } = new URL(request.url);
    const requestedEmployeeId = String(searchParams.get("employeeId") || "").trim();
    const employeeId = requestedEmployeeId || String(profile.$id || "").trim();

    if (!employeeId) {
      const error = new Error("employeeId is required.");
      error.statusCode = 400;
      throw error;
    }

    await assertCanReadTrajectory(databases, profile, employeeId);

    const scoreRows = await listEmployeeScoresSafe(databases, employeeId);
    if (scoreRows.length === 0) {
      return Response.json({
        data: {
          employeeId,
          cycles: [],
          trendLabel: "new",
          trendDeltaPercent: 0,
        },
      });
    }

    const cyclesByName = await getCyclesByNameSafe(
      databases,
      scoreRows.map((row) => row.cycleId)
    );
    const cycles = mapTrajectoryCycles(scoreRows, cyclesByName);
    if (cycles.length === 0) {
      return Response.json({
        data: {
          employeeId,
          cycles: [],
          trendLabel: "new",
          trendDeltaPercent: 0,
        },
      });
    }

    const trend = classifyTrend(cycles);

    return Response.json({
      data: {
        employeeId,
        cycles,
        trendLabel: trend.trendLabel,
        trendDeltaPercent: trend.trendDeltaPercent,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

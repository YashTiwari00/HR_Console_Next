import { appwriteConfig } from "@/lib/appwrite";
import { CHECKIN_STATUSES } from "@/lib/appwriteSchema";
import { Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";

function parseQuarter(cycleId) {
  const value = String(cycleId || "").trim();
  if (!value) return null;

  const qFirst = value.match(/q([1-4])\s*[-_/]?\s*(\d{4})/i);
  if (qFirst) {
    return {
      year: Number.parseInt(qFirst[2], 10),
      quarter: Number.parseInt(qFirst[1], 10),
    };
  }

  const yearFirst = value.match(/(\d{4})\s*[-_/]?\s*q([1-4])/i);
  if (yearFirst) {
    return {
      year: Number.parseInt(yearFirst[1], 10),
      quarter: Number.parseInt(yearFirst[2], 10),
    };
  }

  return null;
}

function quarterIndex(quarter) {
  return quarter.year * 4 + quarter.quarter;
}

function quarterLabel(quarter) {
  return `Q${quarter.quarter}-${quarter.year}`;
}

function calculateStreak(cycleIds) {
  const quarterMap = new Map();

  for (const cycleId of cycleIds) {
    const parsed = parseQuarter(cycleId);
    if (!parsed) continue;
    quarterMap.set(quarterIndex(parsed), parsed);
  }

  if (quarterMap.size === 0) {
    return {
      streak: 0,
      latestQuarter: null,
      quarters: [],
    };
  }

  const sortedIndexes = Array.from(quarterMap.keys()).sort((a, b) => b - a);
  const maxIndex = sortedIndexes[0];

  let streak = 0;
  for (let current = maxIndex; quarterMap.has(current); current -= 1) {
    streak += 1;
  }

  return {
    streak,
    latestQuarter: quarterLabel(quarterMap.get(maxIndex)),
    quarters: sortedIndexes.map((index) => quarterLabel(quarterMap.get(index))),
  };
}

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee"]);

    const employeeId = String(profile.$id || "").trim();

    const checkInRows = await databases.listDocuments(
      databaseId,
      appwriteConfig.checkInsCollectionId,
      [
        Query.equal("employeeId", employeeId),
        Query.equal("status", CHECKIN_STATUSES.COMPLETED),
        Query.limit(500),
      ]
    );

    const goalIds = Array.from(
      new Set(
        checkInRows.documents
          .map((item) => String(item.goalId || "").trim())
          .filter(Boolean)
      )
    );

    if (goalIds.length === 0) {
      return Response.json({
        data: {
          streak: 0,
          latestQuarter: null,
          quarters: [],
          completedCheckIns: 0,
        },
      });
    }

    const goalRows = await databases.listDocuments(databaseId, appwriteConfig.goalsCollectionId, [
      Query.equal("$id", goalIds),
      Query.limit(500),
    ]);

    const cycles = goalRows.documents
      .map((goal) => String(goal.cycleId || "").trim())
      .filter(Boolean);

    const streakInfo = calculateStreak(cycles);

    return Response.json({
      data: {
        streak: streakInfo.streak,
        latestQuarter: streakInfo.latestQuarter,
        quarters: streakInfo.quarters,
        completedCheckIns: checkInRows.documents.length,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

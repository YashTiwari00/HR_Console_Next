import { appwriteConfig } from "@/lib/appwrite";
import { databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import {
  isMissingCollectionError,
  listCalibrationDecisionsBySession,
} from "@/app/api/hr/calibration-sessions/_lib/service";
import { buildCalibrationDriftSummary, calculateDecisionDrift } from "@/lib/calibrationDrift";
import { listUsersByIds } from "@/lib/teamAccess";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeTextLower(value) {
  return normalizeText(value).toLowerCase();
}

function effectiveRating(decision) {
  if (Number.isInteger(decision.finalRating)) return decision.finalRating;
  if (Number.isInteger(decision.proposedRating)) return decision.proposedRating;
  if (Number.isInteger(decision.previousRating)) return decision.previousRating;
  return null;
}

function buildRatingBucketPredicate(bucketRaw) {
  const bucket = normalizeTextLower(bucketRaw);
  if (!bucket) {
    return () => true;
  }

  if (bucket === "low" || bucket === "1-2") {
    return (rating) => Number.isInteger(rating) && rating >= 1 && rating <= 2;
  }

  if (bucket === "mid" || bucket === "medium" || bucket === "3") {
    return (rating) => Number.isInteger(rating) && rating === 3;
  }

  if (bucket === "high" || bucket === "4-5") {
    return (rating) => Number.isInteger(rating) && rating >= 4 && rating <= 5;
  }

  const asInt = Number.parseInt(bucket, 10);
  if (Number.isInteger(asInt) && asInt >= 1 && asInt <= 5) {
    return (rating) => rating === asInt;
  }

  return null;
}

async function getCalibrationSessionOrResponse(databases, sessionId) {
  try {
    const session = await databases.getDocument(
      databaseId,
      appwriteConfig.calibrationSessionsCollectionId,
      sessionId
    );
    return { session };
  } catch (error) {
    if (isMissingCollectionError(error, appwriteConfig.calibrationSessionsCollectionId)) {
      return {
        response: Response.json(
          { error: "calibration_sessions collection is not available. Run schema apply first." },
          { status: 409 }
        ),
      };
    }

    const message = String(error?.message || "").toLowerCase();
    if (message.includes("not found") || message.includes("could not be found")) {
      return {
        response: Response.json({ error: "Calibration session not found." }, { status: 404 }),
      };
    }

    throw error;
  }
}

export async function GET(request, context) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    const params = await context.params;
    const sessionId = normalizeText(params?.sessionId);
    if (!sessionId) {
      return Response.json({ error: "sessionId is required." }, { status: 400 });
    }

    const sessionLookup = await getCalibrationSessionOrResponse(databases, sessionId);
    if (sessionLookup.response) {
      return sessionLookup.response;
    }

    const { searchParams } = new URL(request.url);
    const managerIdFilter = normalizeText(searchParams.get("managerId"));
    const departmentFilter = normalizeTextLower(searchParams.get("department"));
    const ratingBucketRaw = searchParams.get("rating bucket") || searchParams.get("ratingBucket");

    const ratingPredicate = buildRatingBucketPredicate(ratingBucketRaw);
    if (!ratingPredicate) {
      return Response.json(
        {
          error:
            "Invalid rating bucket. Use low, mid, high, 1-2, 3, 4-5, or a single rating 1..5.",
        },
        { status: 400 }
      );
    }

    let decisions;
    try {
      decisions = await listCalibrationDecisionsBySession(databases, sessionId, 500);
    } catch (error) {
      if (isMissingCollectionError(error, appwriteConfig.calibrationDecisionsCollectionId)) {
        return Response.json({
          data: [],
          meta: { total: 0 },
        });
      }
      throw error;
    }

    const filteredByManager = managerIdFilter
      ? decisions.filter((item) => normalizeText(item.managerId) === managerIdFilter)
      : decisions;

    const userIds = [];
    for (const item of filteredByManager) {
      const employeeId = normalizeText(item.employeeId);
      const managerId = normalizeText(item.managerId);
      if (employeeId) userIds.push(employeeId);
      if (managerId) userIds.push(managerId);
    }

    const users = await listUsersByIds(databases, userIds);
    const userById = new Map(users.map((user) => [normalizeText(user.$id), user]));

    const data = filteredByManager
      .map((item) => {
        const employeeId = normalizeText(item.employeeId);
        const managerId = normalizeText(item.managerId);
        const employee = userById.get(employeeId);
        const manager = userById.get(managerId);

        return {
          decisionId: item.$id,
          employeeId,
          employeeName: normalizeText(employee?.name) || employeeId,
          managerId: managerId || null,
          managerName: managerId ? normalizeText(manager?.name) || managerId : null,
          previousRating: item.previousRating ?? null,
          proposedRating: item.proposedRating ?? null,
          finalRating: item.finalRating ?? null,
          mode: item.mode || null,
          aiSuggestedRating: item.aiSuggestedRating ?? null,
          drift: calculateDecisionDrift(item),
          changed: Boolean(item.changed),
          rationale: normalizeText(item.rationale),
          decidedAt: item.decidedAt || item.$createdAt || null,
          department: normalizeText(employee?.department) || "",
        };
      })
      .filter((item) => {
        if (departmentFilter && normalizeTextLower(item.department) !== departmentFilter) {
          return false;
        }

        return ratingPredicate(effectiveRating(item));
      })
      .map((item) => ({
        decisionId: item.decisionId,
        employeeId: item.employeeId,
        employeeName: item.employeeName,
        managerId: item.managerId,
        managerName: item.managerName,
        previousRating: item.previousRating,
        proposedRating: item.proposedRating,
        finalRating: item.finalRating,
        mode: item.mode,
        aiSuggestedRating: item.aiSuggestedRating,
        drift: item.drift,
        changed: item.changed,
        rationale: item.rationale,
        decidedAt: item.decidedAt,
      }));

    const driftSummary = buildCalibrationDriftSummary(data);

    return Response.json({
      data,
      meta: {
        total: data.length,
        avgDrift: driftSummary.avgDrift,
        positiveDriftCount: driftSummary.positiveDriftCount,
        negativeDriftCount: driftSummary.negativeDriftCount,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

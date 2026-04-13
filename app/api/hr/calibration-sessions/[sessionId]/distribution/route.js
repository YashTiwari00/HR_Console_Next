import { appwriteConfig } from "@/lib/appwrite";
import { databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import {
  isMissingCollectionError,
  listCalibrationDecisionsBySession,
} from "@/app/api/hr/calibration-sessions/_lib/service";
import { buildCalibrationDistribution } from "@/lib/calibrationDistribution";

function normalizeText(value) {
  return String(value || "").trim();
}

function isNotFoundError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("not found") || message.includes("could not be found");
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

    if (isNotFoundError(error)) {
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

    let decisions;
    try {
      decisions = await listCalibrationDecisionsBySession(databases, sessionId, 500);
    } catch (error) {
      if (isMissingCollectionError(error, appwriteConfig.calibrationDecisionsCollectionId)) {
        return Response.json({
          distribution: {
            1: { count: 0, percent: 0 },
            2: { count: 0, percent: 0 },
            3: { count: 0, percent: 0 },
            4: { count: 0, percent: 0 },
            5: { count: 0, percent: 0 },
          },
        });
      }
      throw error;
    }

    const distribution = buildCalibrationDistribution(decisions);

    return Response.json({ distribution });
  } catch (error) {
    return errorResponse(error);
  }
}

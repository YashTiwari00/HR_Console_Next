import { appwriteConfig } from "@/lib/appwrite";
import { databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import {
  isMissingCollectionError,
  listCalibrationDecisionsBySession,
  shapeCalibrationTimeline,
} from "@/app/api/hr/calibration-sessions/_lib/service";

export async function GET(request, context) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    const params = await context.params;
    const sessionId = String(params.sessionId || "").trim();
    if (!sessionId) {
      return Response.json({ error: "sessionId is required." }, { status: 400 });
    }

    try {
      await databases.getDocument(databaseId, appwriteConfig.calibrationSessionsCollectionId, sessionId);
    } catch (error) {
      if (isMissingCollectionError(error, appwriteConfig.calibrationSessionsCollectionId)) {
        return Response.json(
          { error: "calibration_sessions collection is not available. Run schema apply first." },
          { status: 409 }
        );
      }
      throw error;
    }

    let decisions;
    try {
      decisions = await listCalibrationDecisionsBySession(databases, sessionId, 500);
    } catch (error) {
      if (isMissingCollectionError(error, appwriteConfig.calibrationDecisionsCollectionId)) {
        return Response.json({
          data: [],
          meta: {
            skipped: true,
            reason: "calibration_decisions collection is not available.",
          },
        });
      }
      throw error;
    }

    const timeline = shapeCalibrationTimeline(decisions);

    return Response.json({
      data: timeline,
      meta: {
        skipped: false,
        total: timeline.length,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
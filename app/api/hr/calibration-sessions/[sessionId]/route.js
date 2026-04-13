import { appwriteConfig } from "@/lib/appwrite";
import { databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import {
  canTransitionCalibrationStatus,
  isMissingCollectionError,
  normalizeCalibrationStatus,
  shapeCalibrationSession,
  updateCalibrationSessionCompat,
} from "@/app/api/hr/calibration-sessions/_lib/service";

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export async function PATCH(request, context) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    const params = await context.params;
    const sessionId = String(params?.sessionId || "").trim();
    if (!sessionId) {
      return Response.json({ error: "sessionId is required." }, { status: 400 });
    }

    let current;
    try {
      current = await databases.getDocument(
        databaseId,
        appwriteConfig.calibrationSessionsCollectionId,
        sessionId
      );
    } catch (error) {
      if (isMissingCollectionError(error, appwriteConfig.calibrationSessionsCollectionId)) {
        return Response.json(
          { error: "calibration_sessions collection is not available. Run schema apply first." },
          { status: 409 }
        );
      }

      const message = String(error?.message || "").toLowerCase();
      if (message.includes("not found") || message.includes("could not be found")) {
        return Response.json({ error: "Calibration session not found." }, { status: 404 });
      }

      throw error;
    }

    const currentStatus = normalizeCalibrationStatus(current?.status, "draft");
    if (currentStatus === "closed") {
      return Response.json(
        { error: "Closed calibration sessions cannot be modified." },
        { status: 409 }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const nameProvided = hasOwn(body || {}, "name");
    const notesProvided = hasOwn(body || {}, "notes");
    const statusProvided = hasOwn(body || {}, "status");

    if (!nameProvided && !notesProvided && !statusProvided) {
      return Response.json(
        { error: "At least one of name, notes, or status must be provided." },
        { status: 400 }
      );
    }

    const nextName = nameProvided ? String(body?.name || "").trim() : undefined;
    const nextNotes = notesProvided ? String(body?.notes || "").trim() : undefined;
    const nextStatus = statusProvided
      ? normalizeCalibrationStatus(body?.status, "")
      : undefined;

    if (nameProvided && !nextName) {
      return Response.json({ error: "name cannot be empty when provided." }, { status: 400 });
    }

    if (statusProvided && !nextStatus) {
      return Response.json(
        { error: "status must be one of: draft, active, locked, closed." },
        { status: 400 }
      );
    }

    if (statusProvided && !canTransitionCalibrationStatus(currentStatus, nextStatus)) {
      return Response.json(
        {
          error:
            "Invalid status transition. Allowed flow is draft -> active -> locked -> closed.",
        },
        { status: 400 }
      );
    }

    let updated;
    try {
      updated = await updateCalibrationSessionCompat(databases, sessionId, {
        ...(nameProvided ? { name: nextName } : {}),
        ...(notesProvided ? { notes: nextNotes } : {}),
        ...(statusProvided ? { status: nextStatus } : {}),
        updatedBy: String(profile.$id || "").trim(),
        updatedAt: new Date().toISOString(),
        version: Number(current?.version || 1) + 1,
      });
    } catch (error) {
      if (isMissingCollectionError(error, appwriteConfig.calibrationSessionsCollectionId)) {
        return Response.json(
          { error: "calibration_sessions collection is not available. Run schema apply first." },
          { status: 409 }
        );
      }
      throw error;
    }

    return Response.json({
      data: shapeCalibrationSession(updated),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

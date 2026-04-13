import { appwriteConfig } from "@/lib/appwrite";
import { databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import {
  isMissingCollectionError,
  normalizeCalibrationStatus,
  updateCalibrationDecisionCompat,
} from "@/app/api/hr/calibration-sessions/_lib/service";

function normalizeText(value) {
  return String(value || "").trim();
}

function toRating(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
    return null;
  }
  return parsed;
}

function parseOptionalRating(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return { value: null, provided: false };
  }
  return { value: toRating(value), provided: true };
}

function normalizeDecisionMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  if (!mode) return null;
  if (mode === "suggestion" || mode === "decision_support") return mode;
  return null;
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

export async function POST(request, context) {
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

    const sessionStatus = normalizeCalibrationStatus(sessionLookup.session?.status, "draft");
    if (sessionStatus === "locked" || sessionStatus === "closed") {
      return Response.json({ error: "Session is locked" }, { status: 400 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const decisions = Array.isArray(body?.decisions) ? body.decisions : null;
    if (!decisions) {
      return Response.json({ error: "decisions array is required." }, { status: 400 });
    }

    let updated = 0;
    let skipped = 0;

    for (const item of decisions) {
      const decisionId = normalizeText(item?.decisionId);
      const finalRating = toRating(item?.finalRating);
      const rationale = normalizeText(item?.rationale);
      const mode = normalizeDecisionMode(item?.mode);
      const aiSuggestedRatingParsed = parseOptionalRating(item?.aiSuggestedRating);

      if (!decisionId || finalRating === null || !rationale) {
        skipped += 1;
        continue;
      }

      if (item?.mode !== undefined && mode === null) {
        skipped += 1;
        continue;
      }

      if (aiSuggestedRatingParsed.provided && aiSuggestedRatingParsed.value === null) {
        skipped += 1;
        continue;
      }

      let existing;
      try {
        existing = await databases.getDocument(
          databaseId,
          appwriteConfig.calibrationDecisionsCollectionId,
          decisionId
        );
      } catch (error) {
        if (isMissingCollectionError(error, appwriteConfig.calibrationDecisionsCollectionId)) {
          return Response.json(
            { error: "calibration_decisions collection is not available. Run schema apply first." },
            { status: 409 }
          );
        }

        if (isNotFoundError(error)) {
          skipped += 1;
          continue;
        }

        throw error;
      }

      if (normalizeText(existing?.sessionId) !== sessionId) {
        skipped += 1;
        continue;
      }

      const previousRating = Number.isInteger(existing?.previousRating)
        ? Number(existing.previousRating)
        : null;
      const proposedRating = Number.isInteger(existing?.proposedRating)
        ? Number(existing.proposedRating)
        : null;

      const changed =
        previousRating !== null
          ? previousRating !== finalRating
          : proposedRating !== null
            ? proposedRating !== finalRating
            : false;

      const payload = {
        finalRating,
        rationale,
        changed,
        decidedBy: normalizeText(profile?.$id),
        decidedAt: new Date().toISOString(),
        version: Number(existing?.version || 1) + 1,
      };

      if (item?.mode !== undefined) {
        payload.mode = mode;
      }

      if (aiSuggestedRatingParsed.provided) {
        payload.aiSuggestedRating = aiSuggestedRatingParsed.value;
      }

      try {
        await updateCalibrationDecisionCompat(databases, decisionId, payload);
        updated += 1;
      } catch (error) {
        if (isMissingCollectionError(error, appwriteConfig.calibrationDecisionsCollectionId)) {
          return Response.json(
            { error: "calibration_decisions collection is not available. Run schema apply first." },
            { status: 409 }
          );
        }

        if (isNotFoundError(error)) {
          skipped += 1;
          continue;
        }

        throw error;
      }
    }

    return Response.json({
      updated,
      skipped,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

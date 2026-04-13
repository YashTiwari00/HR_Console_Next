import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import {
  createCalibrationDecisionCompat,
  isMissingCollectionError,
  listCalibrationDecisionsBySession,
  normalizeCalibrationStatus,
  toIsoOrNow,
} from "@/app/api/hr/calibration-sessions/_lib/service";

function toRating(value, required = false) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (Number.isNaN(parsed)) {
    return required ? null : null;
  }
  if (parsed < 1 || parsed > 5) {
    return null;
  }
  return parsed;
}

function normalizeDecisionMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  if (!mode) return null;
  if (mode === "suggestion" || mode === "decision_support") return mode;
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

    let rows;
    try {
      rows = await listCalibrationDecisionsBySession(databases, sessionId, 300);
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

    return Response.json({
      data: rows.map((item) => ({
        id: item.$id,
        sessionId: item.sessionId,
        employeeId: item.employeeId,
        managerId: item.managerId || null,
        previousRating: item.previousRating ?? null,
        proposedRating: item.proposedRating ?? null,
        finalRating: item.finalRating ?? null,
        rationale: item.rationale || "",
        changed: Boolean(item.changed),
        mode: item.mode || null,
        aiSuggestedRating: item.aiSuggestedRating ?? null,
        version: Number(item.version || 1),
        decidedBy: item.decidedBy || null,
        decidedAt: item.decidedAt || item.$createdAt,
      })),
      meta: {
        skipped: false,
        total: rows.length,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request, context) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    const params = await context.params;
    const sessionId = String(params.sessionId || "").trim();
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

    const body = await request.json();
    const employeeId = String(body?.employeeId || "").trim();
    const managerId = String(body?.managerId || "").trim();
    const previousRating = toRating(body?.previousRating, false);
    const proposedRating = toRating(body?.proposedRating, true);
    const finalRating = toRating(body?.finalRating, false);
    const aiSuggestedRating = toRating(body?.aiSuggestedRating, false);
    const rationale = String(body?.rationale || "").trim();
    const mode = normalizeDecisionMode(body?.mode);

    if (!employeeId || !proposedRating || !rationale) {
      return Response.json(
        { error: "employeeId, proposedRating and rationale are required." },
        { status: 400 }
      );
    }

    if (body?.mode !== undefined && mode === null) {
      return Response.json(
        { error: "mode must be one of: suggestion, decision_support." },
        { status: 400 }
      );
    }

    if (body?.aiSuggestedRating !== undefined && aiSuggestedRating === null) {
      return Response.json(
        { error: "aiSuggestedRating must be an integer between 1 and 5." },
        { status: 400 }
      );
    }

    let existingCount = 0;
    try {
      const existing = await databases.listDocuments(
        databaseId,
        appwriteConfig.calibrationDecisionsCollectionId,
        [
          Query.equal("sessionId", sessionId),
          Query.equal("employeeId", employeeId),
          Query.limit(200),
        ]
      );
      existingCount = existing.documents.length;
    } catch (error) {
      if (!isMissingCollectionError(error, appwriteConfig.calibrationDecisionsCollectionId)) {
        throw error;
      }
    }

    let created;
    try {
      created = await createCalibrationDecisionCompat(databases, {
        sessionId,
        employeeId,
        managerId: managerId || null,
        previousRating,
        proposedRating,
        finalRating,
        rationale,
        changed:
          previousRating !== null && finalRating !== null
            ? previousRating !== finalRating
            : previousRating !== null && previousRating !== proposedRating,
        mode: mode || undefined,
        aiSuggestedRating: aiSuggestedRating ?? undefined,
        version: existingCount + 1,
        decidedBy: String(profile.$id || "").trim(),
        decidedAt: toIsoOrNow(body?.decidedAt),
      });
    } catch (error) {
      if (isMissingCollectionError(error, appwriteConfig.calibrationDecisionsCollectionId)) {
        return Response.json(
          { error: "calibration_decisions collection is not available. Run schema apply first." },
          { status: 409 }
        );
      }
      throw error;
    }

    return Response.json(
      {
        data: {
          id: created.$id,
          sessionId: created.sessionId,
          employeeId: created.employeeId,
          managerId: created.managerId || null,
          previousRating: created.previousRating ?? null,
          proposedRating: created.proposedRating ?? null,
          finalRating: created.finalRating ?? null,
          rationale: created.rationale || "",
          changed: Boolean(created.changed),
          mode: created.mode || null,
          aiSuggestedRating: created.aiSuggestedRating ?? null,
          version: Number(created.version || 1),
          decidedBy: created.decidedBy || null,
          decidedAt: created.decidedAt || created.$createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
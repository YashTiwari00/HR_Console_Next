import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import {
  createCalibrationSessionCompat,
  isMissingCollectionError,
  normalizeCalibrationStatus,
  shapeCalibrationSession,
  toIsoOrNow,
} from "@/app/api/hr/calibration-sessions/_lib/service";

function toLimit(value, fallback = 50) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(1, Math.min(200, parsed));
}

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    const { searchParams } = new URL(request.url);
    const cycleId = String(searchParams.get("cycleId") || "").trim();
    const status = String(searchParams.get("status") || "").trim();
    const limit = toLimit(searchParams.get("limit"), 50);

    const queries = [Query.orderDesc("updatedAt"), Query.limit(limit)];
    if (cycleId) queries.push(Query.equal("cycleId", cycleId));
    if (status) {
      const normalizedStatus = normalizeCalibrationStatus(status, "");
      if (normalizedStatus) {
        queries.push(Query.equal("status", normalizedStatus));
      }
    }

    let rows;
    try {
      const result = await databases.listDocuments(
        databaseId,
        appwriteConfig.calibrationSessionsCollectionId,
        queries
      );
      rows = result.documents;
    } catch (error) {
      if (isMissingCollectionError(error, appwriteConfig.calibrationSessionsCollectionId)) {
        return Response.json({
          data: [],
          meta: {
            skipped: true,
            reason: "calibration_sessions collection is not available.",
          },
        });
      }
      throw error;
    }

    return Response.json({
      data: rows.map((item) => shapeCalibrationSession(item)),
      meta: {
        skipped: false,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    const body = await request.json();
    const name = String(body?.name || "").trim();
    const cycleId = String(body?.cycleId || "").trim();
    const status = "draft";
    const scope = String(body?.scope || "").trim();
    const notes = String(body?.notes || "").trim();

    if (!name || !cycleId) {
      return Response.json({ error: "name and cycleId are required." }, { status: 400 });
    }

    let created;
    try {
      created = await createCalibrationSessionCompat(databases, {
        name,
        cycleId,
        status,
        scope,
        notes,
        version: 1,
        createdBy: String(profile.$id || "").trim(),
        updatedBy: String(profile.$id || "").trim(),
        createdAt: toIsoOrNow(body?.createdAt),
        updatedAt: new Date().toISOString(),
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

    return Response.json(
      {
        data: shapeCalibrationSession(created),
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
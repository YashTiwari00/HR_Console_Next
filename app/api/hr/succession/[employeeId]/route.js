import { appwriteConfig } from "@/lib/appwrite";
import { ID, Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import {
  listHrRecipientIds,
  notifySuccessionTagTransition,
} from "@/app/api/hr/succession/_lib/notifications";

const ALLOWED_TAGS = new Set(["ready", "needs_development", "watch"]);

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeTag(value) {
  return normalizeText(value).toLowerCase();
}

function isValidTag(value) {
  return ALLOWED_TAGS.has(normalizeTag(value));
}

function toIsoNow() {
  return new Date().toISOString();
}

async function findLatestTalentSnapshot(databases, employeeId) {
  const response = await databases.listDocuments(
    databaseId,
    appwriteConfig.talentSnapshotsCollectionId,
    [
      Query.equal("employeeId", employeeId),
      Query.orderDesc("$updatedAt"),
      Query.limit(1),
    ]
  );

  const rows = response.documents || [];
  return rows[0] || null;
}

export async function PATCH(request, context) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    const params = await context.params;
    const employeeId = normalizeText(params?.employeeId);

    if (!employeeId) {
      return Response.json({ error: "employeeId is required." }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const successionTag = normalizeTag(body?.successionTag);
    const overrideReason = normalizeText(body?.overrideReason);

    if (!isValidTag(successionTag)) {
      return Response.json(
        { error: "successionTag must be one of: ready, needs_development, watch." },
        { status: 400 }
      );
    }

    if (!overrideReason) {
      return Response.json(
        { error: "overrideReason is required." },
        { status: 400 }
      );
    }

    const snapshot = await findLatestTalentSnapshot(databases, employeeId);
    if (!snapshot) {
      return Response.json(
        { error: "No talent snapshot found for this employee." },
        { status: 404 }
      );
    }

    const nowIso = toIsoNow();
    const updatedBy = normalizeText(profile?.$id || profile?.userId || "system") || "system";
    const previousSuccessionTag = normalizeTag(snapshot?.successionTag);

    const updated = await databases.updateDocument(
      databaseId,
      appwriteConfig.talentSnapshotsCollectionId,
      snapshot.$id,
      {
        successionTag,
        isOverridden: true,
        updatedBy,
        updatedAt: nowIso,
      }
    );

    await databases.createDocument(
      databaseId,
      appwriteConfig.successionOverridesCollectionId,
      ID.unique(),
      {
        employeeId,
        snapshotId: updated.$id,
        cycleId: String(updated.cycleId || "").trim() || null,
        successionTag,
        overrideReason,
        updatedBy,
        updatedAt: nowIso,
      }
    );

    try {
      const hrRecipientIds = await listHrRecipientIds(databases);
      await notifySuccessionTagTransition(databases, {
        employeeId,
        employeeName: employeeId,
        managerId: normalizeText(updated?.managerId || "") || null,
        previousTag: previousSuccessionTag,
        nextTag: successionTag,
        cycleId: normalizeText(updated?.cycleId || "") || null,
        updatedAt: nowIso,
        actorId: updatedBy,
        hrRecipientIds,
      });
    } catch {
      // Notification failures should not block manual override updates.
    }

    return Response.json({
      data: {
        employeeId,
        snapshotId: updated.$id,
        cycleId: updated.cycleId || null,
        successionTag: updated.successionTag || successionTag,
        isOverridden: Boolean(updated.isOverridden),
        overrideReason,
        readinessScore: updated.readinessScore ?? null,
        readinessReason: updated.readinessReason || null,
        updatedBy: updated.updatedBy || updatedBy,
        updatedAt: updated.updatedAt || updated.$updatedAt || nowIso,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

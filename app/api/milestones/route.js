import { Query, databaseId } from "@/lib/appwriteServer";
import {
  acknowledgeMilestone,
  getUnacknowledgedMilestones,
} from "@/lib/milestones";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";

function normalizeMilestoneIds(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function resolveMilestoneCollectionId() {
  return String(process.env.NEXT_PUBLIC_MILESTONE_EVENTS_COLLECTION_ID || "").trim();
}

function sanitizeMilestoneRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    $id: String(row?.$id || "").trim(),
    userId: String(row?.userId || "").trim(),
    milestoneType: String(row?.milestoneType || "").trim(),
    referenceId: String(row?.referenceId || "").trim(),
    cycleId: String(row?.cycleId || "").trim(),
    cycleStreak: Number.isFinite(Number(row?.cycleStreak)) ? Number(row.cycleStreak) : null,
    triggeredAt: row?.triggeredAt || row?.$createdAt || null,
    acknowledged: Boolean(row?.acknowledged),
  }));
}

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee"]);

    const milestoneEventsCollectionId = resolveMilestoneCollectionId();
    if (!milestoneEventsCollectionId) {
      console.warn("[milestones.route] NEXT_PUBLIC_MILESTONE_EVENTS_COLLECTION_ID is not set.");
      return Response.json({ milestones: [] });
    }

    const milestones = await getUnacknowledgedMilestones({
      db: databases,
      databaseId,
      milestoneEventsCollectionId,
      Query,
      userId: String(profile.$id || "").trim(),
    }).catch(() => []);

    return Response.json({ milestones: sanitizeMilestoneRows(milestones) });
  } catch (error) {
    if (error?.statusCode === 401 || error?.statusCode === 403) {
      return errorResponse(error);
    }
    console.warn("[milestones.route] GET failed:", error?.message || error);
    return Response.json({ milestones: [] });
  }
}

export async function PATCH(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee"]);

    const milestoneEventsCollectionId = resolveMilestoneCollectionId();
    if (!milestoneEventsCollectionId) {
      console.warn("[milestones.route] NEXT_PUBLIC_MILESTONE_EVENTS_COLLECTION_ID is not set.");
      return Response.json({ acknowledged: 0 });
    }

    const body = await request.json().catch(() => ({}));
    const milestoneIds = normalizeMilestoneIds(body?.milestoneIds);

    if (milestoneIds.length === 0 || milestoneIds.length > 20) {
      return Response.json(
        { error: "milestoneIds must be a non-empty array with at most 20 items." },
        { status: 400 }
      );
    }

    const userId = String(profile.$id || "").trim();

    const ownershipChecks = await Promise.allSettled(
      milestoneIds.map(async (milestoneId) => {
        try {
          const row = await databases.getDocument(
            databaseId,
            milestoneEventsCollectionId,
            milestoneId
          );

          return String(row?.userId || "").trim() === userId ? milestoneId : null;
        } catch {
          return null;
        }
      })
    );

    const allowedMilestoneIds = ownershipChecks
      .filter((item) => item.status === "fulfilled")
      .map((item) => item.value)
      .filter(Boolean);

    const acknowledgements = await Promise.allSettled(
      allowedMilestoneIds.map((milestoneId) =>
        acknowledgeMilestone({
          db: databases,
          databaseId,
          milestoneEventsCollectionId,
          milestoneId,
        })
      )
    );

    const acknowledged = acknowledgements.reduce((count, result) => {
      if (result.status !== "fulfilled") return count;
      return result.value?.success ? count + 1 : count;
    }, 0);

    return Response.json({ acknowledged });
  } catch (error) {
    if (error?.statusCode === 401 || error?.statusCode === 403) {
      return errorResponse(error);
    }
    console.warn("[milestones.route] PATCH failed:", error?.message || error);
    return Response.json({ acknowledged: 0 });
  }
}

import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { getManagerTeamEmployeeIds } from "@/lib/teamAccess";

const CHUNK_SIZE = 100;

function normalizeText(value) {
  return String(value || "").trim();
}

function chunk(arr, size) {
  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

function pickLatestSnapshot(snapshots) {
  if (!snapshots || snapshots.length === 0) return null;
  return snapshots.reduce((latest, s) => {
    const ts = new Date(s?.lastEvaluatedAt || s?.$updatedAt || 0).valueOf();
    const latestTs = new Date(latest?.lastEvaluatedAt || latest?.$updatedAt || 0).valueOf();
    return ts > latestTs ? s : latest;
  }, snapshots[0]);
}

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["manager", "hr", "leadership"]);

    const managerId = normalizeText(profile?.$id || profile?.userId);
    if (!managerId) {
      return Response.json({ error: "Manager ID could not be resolved." }, { status: 400 });
    }

    // Get all direct-report employee IDs for this manager
    const employeeIds = await getManagerTeamEmployeeIds(databases, managerId, { includeFallback: true });

    if (employeeIds.length === 0) {
      return Response.json({ data: { total: 0, rows: [] } });
    }

    // Fetch user profiles for names/departments
    const userMap = new Map();
    for (const idChunk of chunk(employeeIds, CHUNK_SIZE)) {
      const res = await databases.listDocuments(databaseId, appwriteConfig.usersCollectionId, [
        Query.equal("$id", idChunk),
        Query.limit(CHUNK_SIZE),
      ]);
      for (const doc of res.documents || []) {
        userMap.set(normalizeText(doc.$id), doc);
      }
    }

    // Fetch talent snapshots for team members
    const snapshotMap = new Map();
    for (const idChunk of chunk(employeeIds, CHUNK_SIZE)) {
      try {
        const res = await databases.listDocuments(
          databaseId,
          appwriteConfig.talentSnapshotsCollectionId,
          [Query.equal("employeeId", idChunk), Query.limit(CHUNK_SIZE)]
        );
        for (const doc of res.documents || []) {
          const eid = normalizeText(doc.employeeId);
          const existing = snapshotMap.get(eid) || [];
          existing.push(doc);
          snapshotMap.set(eid, existing);
        }
      } catch (err) {
        // Collection may not exist yet — return rows with null snapshot data
        if (
          err?.code === 404 ||
          String(err?.message || "").toLowerCase().includes("not found")
        ) {
          break;
        }
        throw err;
      }
    }

    const rows = employeeIds.map((employeeId) => {
      const user = userMap.get(employeeId) || null;
      const snapshots = snapshotMap.get(employeeId) || [];
      const snapshot = pickLatestSnapshot(snapshots);

      return {
        employeeId,
        name: normalizeText(user?.name || user?.email || employeeId),
        email: normalizeText(user?.email || ""),
        department: normalizeText(user?.department || ""),
        role: normalizeText(user?.role || "employee"),
        performanceBand: normalizeText(snapshot?.performanceBand || "") || null,
        potentialBand: normalizeText(snapshot?.potentialBand || "") || null,
        readinessBand: normalizeText(snapshot?.readinessBand || "") || null,
        readinessScore: Number.isFinite(Number(snapshot?.readinessScore))
          ? Number(snapshot.readinessScore)
          : null,
        successionTag: normalizeText(snapshot?.successionTag || "") || null,
        trendLabel: normalizeText(snapshot?.trendLabel || "") || null,
        isPromotionReady: Boolean(snapshot?.isPromotionReady),
        promotionReadyAt: normalizeText(snapshot?.promotionReadyAt || "") || null,
        promotionReadyBy: normalizeText(snapshot?.promotionReadyBy || "") || null,
        lastEvaluatedAt: normalizeText(
          snapshot?.lastEvaluatedAt || snapshot?.$updatedAt || ""
        ) || null,
        snapshotId: normalizeText(snapshot?.$id || "") || null,
      };
    });

    // Sort: promotion-ready first, then by readiness score desc, then name
    rows.sort((a, b) => {
      if (a.isPromotionReady !== b.isPromotionReady) {
        return a.isPromotionReady ? -1 : 1;
      }
      const scoreA = a.readinessScore ?? -1;
      const scoreB = b.readinessScore ?? -1;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return a.name.localeCompare(b.name);
    });

    return Response.json({ data: { total: rows.length, rows } });
  } catch (error) {
    return errorResponse(error);
  }
}

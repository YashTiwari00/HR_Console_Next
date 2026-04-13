import { Query } from "appwrite";
import { appwriteConfig } from "@/lib/appwrite";
import { databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";

function isMissingCollectionError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("collection") && message.includes("not found");
}

function shapeCycle(document) {
  return {
    id: String(document?.$id || "").trim(),
    name: String(document?.name || "").trim(),
    state: String(document?.state || "").trim() || null,
    periodType: String(document?.periodType || "").trim() || null,
    startDate: String(document?.startDate || "").trim() || null,
    endDate: String(document?.endDate || "").trim() || null,
  };
}

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "leadership", "hr"]);

    let rows;
    try {
      rows = await databases.listDocuments(databaseId, appwriteConfig.goalCyclesCollectionId, [
        Query.orderDesc("startDate"),
        Query.limit(200),
      ]);
    } catch (error) {
      if (isMissingCollectionError(error)) {
        return Response.json({ data: [], meta: { missingCollection: true } });
      }
      throw error;
    }

    const dedupedByName = new Map();
    for (const doc of rows.documents || []) {
      const shaped = shapeCycle(doc);
      if (!shaped.name) continue;
      if (!dedupedByName.has(shaped.name)) {
        dedupedByName.set(shaped.name, shaped);
      }
    }

    return Response.json({
      data: Array.from(dedupedByName.values()),
      meta: {
        total: dedupedByName.size,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

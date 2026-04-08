import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

export async function GET(request: Request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    const dbId = normalizeText(databaseId);
    const collectionId = normalizeText(
      appwriteConfig.goalKpiLibraryCollectionId || "goal_kpi_library"
    );

    if (!dbId) {
      return Response.json({ error: "Database configuration is missing." }, { status: 500 });
    }

    if (!collectionId) {
      return Response.json({ error: "Collection configuration is missing." }, { status: 500 });
    }

    const result = await databases.listDocuments(dbId, collectionId, [
      Query.equal("source_type", "manager"),
      Query.equal("approved", false),
      Query.orderDesc("created_at"),
      Query.limit(200),
    ]);

    return Response.json({ data: result.documents || [] });
  } catch (error) {
    return errorResponse(error);
  }
}

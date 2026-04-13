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

    const { searchParams } = new URL(request.url);
    const role = normalizeText(searchParams.get("role")).toLowerCase();
    const department = normalizeText(searchParams.get("department")).toLowerCase();

    const queries = [Query.equal("approved", true), Query.orderDesc("created_at"), Query.limit(500)];

    if (role) {
      queries.push(Query.equal("role", role));
    }

    if (department) {
      queries.push(Query.equal("department", department));
    }

    const result = await databases.listDocuments(dbId, collectionId, queries);

    return Response.json({ data: result.documents || [] });
  } catch (error) {
    return errorResponse(error);
  }
}

import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { getManagerTeamEmployeeIds, listUsersByIds, mapUserSummary } from "@/lib/teamAccess";

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["manager", "hr"]);

    const { searchParams } = new URL(request.url);
    const managerIdFromQuery = (searchParams.get("managerId") || "").trim();

    if (profile.role === "manager") {
      const teamIds = await getManagerTeamEmployeeIds(databases, profile.$id, {
        includeFallback: true,
      });

      const teamProfiles = await listUsersByIds(databases, teamIds);
      const employees = teamProfiles.filter((item) => item.role === "employee");

      return Response.json({ data: employees.map(mapUserSummary) });
    }

    if (managerIdFromQuery) {
      const teamIds = await getManagerTeamEmployeeIds(databases, managerIdFromQuery, {
        includeFallback: true,
      });

      const teamProfiles = await listUsersByIds(databases, teamIds);
      const employees = teamProfiles.filter((item) => item.role === "employee");

      return Response.json({ data: employees.map(mapUserSummary) });
    }

    const employees = await databases.listDocuments(
      databaseId,
      appwriteConfig.usersCollectionId,
      [Query.equal("role", "employee"), Query.limit(200)]
    );

    return Response.json({ data: employees.documents.map(mapUserSummary) });
  } catch (error) {
    return errorResponse(error);
  }
}

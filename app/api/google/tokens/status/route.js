import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { getGoogleTokenStatus } from "@/lib/googleCalendar";
import { assertManagerCanAccessEmployee } from "@/lib/teamAccess";

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const targetUserId = String(searchParams.get("targetUserId") || "").trim();

    if (!targetUserId) {
      const status = await getGoogleTokenStatus(databases, profile.$id);
      return Response.json({ data: status });
    }

    requireRole(profile, ["manager", "hr"]);

    if (profile.role === "manager" && targetUserId !== profile.$id) {
      await assertManagerCanAccessEmployee(databases, profile.$id, targetUserId);
    }

    const status = await getGoogleTokenStatus(databases, targetUserId);
    return Response.json({ data: { ...status, targetUserId } });
  } catch (error) {
    return errorResponse(error);
  }
}

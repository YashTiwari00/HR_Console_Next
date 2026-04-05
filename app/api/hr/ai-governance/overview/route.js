import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { getAiUsageOverview } from "@/app/api/ai/_lib/aiUsage";

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    const { searchParams } = new URL(request.url);
    const cycleId = String(searchParams.get("cycleId") || "").trim();

    const overview = await getAiUsageOverview({
      databases,
      cycleId: cycleId || undefined,
    });

    return Response.json({ data: overview });
  } catch (error) {
    return errorResponse(error);
  }
}

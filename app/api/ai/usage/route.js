import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { getAiUsageSnapshot } from "@/app/api/ai/_lib/aiUsage";

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "hr", "leadership"]);

    const { searchParams } = new URL(request.url);
    const cycleId = String(searchParams.get("cycleId") || "").trim();

    const usage = await getAiUsageSnapshot({
      databases,
      userId: profile.$id,
      cycleId: cycleId || undefined,
    });

    return Response.json({ data: usage });
  } catch (error) {
    return errorResponse(error);
  }
}

import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { getAiUsageSnapshot } from "@/app/api/ai/_lib/aiUsage";
import { resolveAiMode } from "@/lib/ai/modes.js";

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "hr", "leadership"]);

    const { searchParams } = new URL(request.url);
    const cycleId = String(searchParams.get("cycleId") || "").trim();
    const rawMode = String(searchParams.get("mode") || "suggestion").trim();
    const resolvedMode = resolveAiMode(rawMode, profile.role);

    const usage = await getAiUsageSnapshot({
      databases,
      userId: profile.$id,
      cycleId: cycleId || undefined,
    });

    return Response.json({ data: { ...usage, currentMode: resolvedMode } });
  } catch (error) {
    return errorResponse(error);
  }
}

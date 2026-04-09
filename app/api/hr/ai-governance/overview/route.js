import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { getAiUsageOverview } from "@/app/api/ai/_lib/aiUsage";
import { resolveAiMode } from "@/lib/ai/modes.js";

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    const { searchParams } = new URL(request.url);
    const cycleId = String(searchParams.get("cycleId") || "").trim();
    const role = String(searchParams.get("role") || "").trim().toLowerCase();
    const rawMode = String(searchParams.get("mode") || "suggestion").trim();
    const resolvedMode = resolveAiMode(rawMode, profile.role);

    const overview = await getAiUsageOverview({
      databases,
      cycleId: cycleId || undefined,
      role: role || undefined,
    });

    return Response.json({ data: { ...overview, currentMode: resolvedMode } });
  } catch (error) {
    return errorResponse(error);
  }
}

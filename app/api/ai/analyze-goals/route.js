import { assertAndTrackAiUsage, trackAiUsageCost } from "@/app/api/ai/_lib/aiUsage";
import { analyzeGoalsWithAi } from "@/lib/ai/analyzeGoals";
import { buildAiUsageDelta } from "@/lib/ai/costEstimation";
import { buildExplainability } from "@/lib/ai/explainability";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";

function defaultCycleId() {
  const now = new Date();
  const quarter = Math.floor(now.getUTCMonth() / 3) + 1;
  return `Q${quarter}-${now.getUTCFullYear()}`;
}

function normalizeRole(rawRole, profileRole) {
  const fromBody = String(rawRole || "").trim().toLowerCase();
  if (fromBody === "manager" || fromBody === "employee") return fromBody;

  const fromProfile = String(profileRole || "").trim().toLowerCase();
  return fromProfile === "manager" ? "manager" : "employee";
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager"]);

    const body = await request.json().catch(() => ({}));
    const role = normalizeRole(body?.role, profile?.role);
    const goals = Array.isArray(body?.goals) ? body.goals : [];
    const cycleId = String(body?.cycleId || defaultCycleId()).trim();

    if (goals.length === 0) {
      return Response.json({ error: "goals is required and cannot be empty." }, { status: 400 });
    }

    if (goals.length > 10) {
      return Response.json({ error: "Maximum 10 goals are allowed per request." }, { status: 400 });
    }

    const usage = await assertAndTrackAiUsage({
      databases,
      userId: profile.$id,
      cycleId,
      featureType: "goal_analysis",
      userRole: role,
    });

    const analysis = await analyzeGoalsWithAi({ goals, role });
    const usageDelta = buildAiUsageDelta({
      providerUsage: analysis.usageMeta?.providerUsage,
      messages: analysis.usageMeta?.messages,
      completionText: analysis.usageMeta?.completionText,
    });

    const trackedUsage = await trackAiUsageCost({
      databases,
      userId: profile.$id,
      cycleId,
      featureType: "goal_analysis",
      usage,
      tokensUsedDelta: usageDelta.tokensUsed,
      estimatedCostDelta: usageDelta.estimatedCost,
    });

    const explainability = buildExplainability({
      source: analysis.fallbackUsed ? "hybrid_fallback" : "openrouter_llm",
      confidence: analysis.fallbackUsed ? 0.55 : 0.82,
      reason: analysis.fallbackUsed
        ? "Goal analysis used deterministic fallback heuristics due to limited model output quality."
        : "Goal analysis inferred clarity, measurability, and execution signals from submitted goals.",
      based_on: ["goal data", "role context"],
      time_window: cycleId,
      whyFactors: [
        `Analyzed ${goals.length} goal entries`,
        role === "manager" ? "Included allocation guidance for manager workflow" : "Focused on individual goal quality",
      ],
    });

    return Response.json(
      {
        goals: analysis.goals,
        fallbackUsed: analysis.fallbackUsed,
        explainability,
        usage: trackedUsage,
      },
      { status: 200 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

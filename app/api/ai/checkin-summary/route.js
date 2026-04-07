import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertAndTrackAiUsage, trackAiUsageCost } from "@/app/api/ai/_lib/aiUsage";
import { callOpenRouterWithUsage } from "@/lib/openrouter";
import { buildExplainability } from "@/lib/ai/explainability";
import { buildAiUsageDelta } from "@/lib/ai/costEstimation";

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager"]);

    const body = await request.json();
    const cycleId = (body.cycleId || "").trim();
    const notes = (body.notes || "").trim();
    const goalTitle = (body.goalTitle || "").trim();

    if (!cycleId || !notes) {
      return Response.json(
        { error: "cycleId and notes are required." },
        { status: 400 }
      );
    }

    const usage = await assertAndTrackAiUsage({
      databases,
      userId: profile.$id,
      cycleId,
      featureType: "checkin_summary",
      userRole: profile.role,
    });

    const messages = [
      {
        role: "system",
        content: "You are a performance management assistant. Respond with valid JSON only.",
      },
      {
        role: "user",
        content: `Summarise this check-in for goal "${goalTitle || "this goal"}":
"${notes}"

Return ONLY this JSON shape:
{"summary":"one sentence summary","highlights":["...","..."],"blockers":["..."],"nextActions":["...","..."]}`,
      },
    ];

    const completion = await callOpenRouterWithUsage({
      messages,
      jsonMode: true,
    });

    const parsed = JSON.parse(completion.content);
    const usageDelta = buildAiUsageDelta({
      providerUsage: completion.usage,
      messages,
      completionText: completion.content,
    });
    const trackedUsage = await trackAiUsageCost({
      databases,
      userId: profile.$id,
      cycleId,
      featureType: "checkin_summary",
      usage,
      tokensUsedDelta: usageDelta.tokensUsed,
      estimatedCostDelta: usageDelta.estimatedCost,
    });

    let explainability = null;
    try {
      explainability = buildExplainability({
        source: "openrouter_llm",
        confidence: "high",
        whyFactors: [
          `Goal context: ${goalTitle || "general"}`,
          "Extracted progress highlights and blockers from check-in notes.",
          "Action items prioritized for next milestone.",
        ],
        timeWindow: cycleId,
      });
    } catch {
      explainability = null;
    }

    return Response.json({
      data: {
        summary: parsed.summary ?? "Check-in progress reviewed.",
        highlights: parsed.highlights?.length ? parsed.highlights : ["Progress milestones reviewed."],
        blockers: parsed.blockers?.length ? parsed.blockers : ["No major blockers identified."],
        nextActions: parsed.nextActions?.length
          ? parsed.nextActions
          : ["Confirm next milestone before the next check-in."],
        explainability,
        usage: trackedUsage,
      },
      explainability,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

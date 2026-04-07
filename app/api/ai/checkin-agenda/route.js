import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertAndTrackAiUsage, trackAiUsageCost } from "@/app/api/ai/_lib/aiUsage";
import { callOpenRouterWithUsage } from "@/lib/openrouter";
import { buildExplainability } from "@/lib/ai/explainability";
import { buildAiUsageDelta } from "@/lib/ai/costEstimation";

function safeParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["manager", "employee"]);

    const body = await request.json();
    const cycleId = String(body?.cycleId || "").trim();
    const goalTitle = String(body?.goalTitle || "").trim();
    const employeeNotes = String(body?.employeeNotes || "").trim();
    const scheduledAt = String(body?.scheduledAt || "").trim();

    if (!cycleId || !goalTitle) {
      return Response.json({ error: "cycleId and goalTitle are required." }, { status: 400 });
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
        content: "You are a performance coaching assistant. Return valid JSON only.",
      },
      {
        role: "user",
        content: `Generate a short pre-check-in agenda.\nGoal: ${goalTitle}\nScheduledAt: ${scheduledAt || "n/a"}\nEmployee notes: ${employeeNotes || "n/a"}\n\nReturn JSON:\n{"agenda":["..."],"focusQuestions":["..."],"riskSignals":["..."]}`,
      },
    ];

    const completion = await callOpenRouterWithUsage({
      messages,
      jsonMode: true,
      maxTokens: 400,
    });

    const parsed = safeParse(completion.content, {});
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

    const agenda = Array.isArray(parsed?.agenda) ? parsed.agenda.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 6) : [];
    const focusQuestions = Array.isArray(parsed?.focusQuestions) ? parsed.focusQuestions.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 5) : [];
    const riskSignals = Array.isArray(parsed?.riskSignals) ? parsed.riskSignals.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 4) : [];

    return Response.json({
      data: {
        agenda: agenda.length > 0 ? agenda : ["Review progress against current milestone.", "Confirm blockers and owners."],
        focusQuestions: focusQuestions.length > 0 ? focusQuestions : ["What changed since the last check-in?", "What is the most likely delivery risk this cycle?"],
        riskSignals,
        explainability: buildExplainability({
          source: "openrouter_llm",
          confidence: "medium",
          whyFactors: [
            `Goal context: ${goalTitle}`,
            employeeNotes ? "Employee notes were used to prioritize agenda." : "No employee notes provided; used default agenda baseline.",
            "Agenda optimized for blocker and milestone coverage.",
          ],
          timeWindow: cycleId,
        }),
        usage: trackedUsage,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

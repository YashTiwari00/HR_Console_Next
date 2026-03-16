import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertAndTrackAiUsage } from "@/app/api/ai/_lib/aiUsage";
import { callOpenRouter } from "@/lib/openrouter";

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
    });

    const raw = await callOpenRouter({
      messages: [
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
      ],
      jsonMode: true,
    });

    const parsed = JSON.parse(raw);

    return Response.json({
      data: {
        summary: parsed.summary ?? "Check-in progress reviewed.",
        highlights: parsed.highlights?.length ? parsed.highlights : ["Progress milestones reviewed."],
        blockers: parsed.blockers?.length ? parsed.blockers : ["No major blockers identified."],
        nextActions: parsed.nextActions?.length
          ? parsed.nextActions
          : ["Confirm next milestone before the next check-in."],
        explainability: { source: "openrouter_llm", confidence: "high" },
        usage,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

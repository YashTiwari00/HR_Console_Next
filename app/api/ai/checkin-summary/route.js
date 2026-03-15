import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertAndTrackAiUsage } from "@/app/api/ai/_lib/aiUsage";

function sentenceListFromText(value) {
  return value
    .split(/\n|\.|\!/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 6);
}

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

    const extracted = sentenceListFromText(notes);
    const highlights = extracted.slice(0, 2);
    const blockers = extracted
      .filter((line) => /block|risk|delay|depend|issue/i.test(line))
      .slice(0, 2);
    const nextActions = extracted
      .filter((line) => /next|will|plan|action|follow/i.test(line))
      .slice(0, 3);

    const summary =
      `Check-in summary for ${goalTitle || "selected goal"}: ` +
      (highlights[0] || "Progress discussed with focus on current outcomes.");

    return Response.json({
      data: {
        summary,
        highlights: highlights.length ? highlights : ["Progress milestones reviewed."],
        blockers: blockers.length ? blockers : ["No major blockers explicitly identified."],
        nextActions: nextActions.length
          ? nextActions
          : ["Confirm next milestone and owner before the next check-in."],
        explainability: {
          source: "extractive_summary",
          confidence: "medium",
        },
        usage,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

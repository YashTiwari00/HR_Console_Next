import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertAndTrackAiUsage } from "@/app/api/ai/_lib/aiUsage";
import { callOpenRouterWithUsage } from "@/lib/openrouter";

const MIN_FEEDBACK_LENGTH = 12;
const VALID_TONES = new Set(["harsh", "neutral", "constructive"]);

function safeParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function clampScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(10, Math.round(score)));
}

function normalizeTone(value) {
  const tone = String(value || "").trim().toLowerCase();
  if (VALID_TONES.has(tone)) return tone;
  return "neutral";
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["manager"]);

    const body = await request.json();
    const feedback = String(body?.feedback || "").trim();
    const cycleId = String(body?.cycleId || "").trim();

    if (!feedback) {
      return Response.json({ error: "feedback is required." }, { status: 400 });
    }

    if (!cycleId) {
      return Response.json({ error: "cycleId is required." }, { status: 400 });
    }

    if (feedback.length < MIN_FEEDBACK_LENGTH) {
      return Response.json(
        { error: `feedback is too short. Provide at least ${MIN_FEEDBACK_LENGTH} characters.` },
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
        content: [
          "You evaluate manager feedback quality.",
          "Return valid JSON only.",
          "Use a coaching communication style.",
          "Tone rules for rewritten text: supportive, clear, non-toxic, no HR jargon.",
          "Do not include markdown or extra keys.",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          "Evaluate this manager feedback using these dimensions:",
          "- specificity",
          "- constructiveness",
          "- actionability",
          "- tone",
          "",
          "Scoring rubric:",
          "- Give one overall score from 0 to 10.",
          "- Low score when feedback is vague, accusatory, or lacks next steps.",
          "- High score when feedback is specific, constructive, and actionable.",
          "",
          "Tone classification:",
          "- harsh if blaming, demeaning, threatening, or overly aggressive language appears",
          "- constructive if respectful and coaching-oriented with clear guidance",
          "- otherwise neutral",
          "",
          "Return strict JSON with this exact shape:",
          '{"score":number,"reason":string,"tone":"harsh"|"neutral"|"constructive","suggestion":string}',
          "",
          "Field rules:",
          "- score: integer 0..10",
          "- reason: one short sentence explaining the score",
          "- tone: one of harsh, neutral, constructive",
          "- suggestion: rewrite the original feedback into a professional coaching version following tone rules: supportive, clear, non-toxic, no HR jargon",
          "",
          "Feedback text:",
          feedback,
        ].join("\n"),
      },
    ];

    const completion = await callOpenRouterWithUsage({
      messages,
      jsonMode: true,
      maxTokens: 220,
    });

    const parsed = safeParseJson(completion.content);

    const result = {
      score: clampScore(parsed?.score),
      reason: String(parsed?.reason || "Feedback analyzed for clarity, tone, and actionability.").trim(),
      tone: normalizeTone(parsed?.tone),
      suggestion: String(parsed?.suggestion || "Add one concrete next step and timeline to make feedback more actionable.").trim(),
    };

    return Response.json({ data: result, usage });
  } catch (error) {
    if (error?.statusCode === 429) {
      return Response.json(
        { error: "AI usage limit reached for this cycle. Please try again next cycle or continue manually." },
        { status: 429 }
      );
    }
    return errorResponse(error);
  }
}

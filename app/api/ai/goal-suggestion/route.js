import { FRAMEWORK_TYPES } from "@/lib/appwriteSchema";
import { buildExplainability } from "@/lib/ai/explainability";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertAndTrackAiUsage } from "@/app/api/ai/_lib/aiUsage";
import { callOpenRouter } from "@/lib/openrouter";

const VALID_FRAMEWORKS = Object.values(FRAMEWORK_TYPES);

async function buildSuggestions({ cycleId, frameworkType, profile, prompt }) {
  const context = prompt?.trim() || "Improve execution quality and delivery confidence";
  const designation = profile.designation || profile.role || "professional";

  const raw = await callOpenRouter({
    messages: [
      {
        role: "system",
        content: "You are a performance management expert. Respond with valid JSON only.",
      },
      {
        role: "user",
        content: `Generate 3 goal suggestions for an employee with designation "${designation}" using the ${frameworkType} framework. Their intent: "${context}".
Return ONLY this JSON shape (weightages must sum to 100):
{"suggestions":[{"title":"...","description":"...","weightage":30,"rationale":"..."}]}`,
      },
    ],
    jsonMode: true,
  });

  const parsed = JSON.parse(raw);
  return (parsed.suggestions ?? []).map((s) => ({
    ...s,
    explainability: buildExplainability({
      source: "openrouter_llm",
      confidence: "high",
      whyFactors: [
        s?.rationale,
        `Mapped to framework ${frameworkType}`,
        "Aligned with role-specific goal phrasing and measurable outcome style.",
      ],
      timeWindow: cycleId,
    }),
  }));
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager"]);

    const body = await request.json();
    const cycleId = (body.cycleId || "").trim();
    const frameworkType = (body.frameworkType || "").trim();
    const prompt = body.prompt || "";

    if (!cycleId || !frameworkType) {
      return Response.json(
        { error: "cycleId and frameworkType are required." },
        { status: 400 }
      );
    }

    if (!VALID_FRAMEWORKS.includes(frameworkType)) {
      return Response.json({ error: "Invalid frameworkType." }, { status: 400 });
    }

    const usage = await assertAndTrackAiUsage({
      databases,
      userId: profile.$id,
      cycleId,
      featureType: "goal_suggestion",
    });

    const suggestions = await buildSuggestions({ cycleId, frameworkType, profile, prompt });

    return Response.json({
      data: {
        suggestions,
        explainability: buildExplainability({
          source: "openrouter_llm",
          confidence: "high",
          whyFactors: [
            "Framework fit check",
            "Role and designation context",
            "Prompt intent alignment",
          ],
          timeWindow: cycleId,
        }),
        usage,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

import { FRAMEWORK_TYPES } from "@/lib/appwriteSchema";
import { buildExplainability } from "@/lib/ai/explainability";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertAndTrackAiUsage, trackAiUsageCost } from "@/app/api/ai/_lib/aiUsage";
import { callOpenRouterWithUsage } from "@/lib/openrouter";
import { buildAiUsageDelta } from "@/lib/ai/costEstimation";
import { getAOP } from "@/lib/aop/getAOP";

const VALID_FRAMEWORKS = Object.values(FRAMEWORK_TYPES);
const MAX_AOP_PROMPT_CHARS = 4000;

function buildAopPromptContext(aopContent) {
  const raw = String(aopContent || "").trim();
  if (!raw) return "";

  const trimmed = raw.length > MAX_AOP_PROMPT_CHARS
    ? `${raw.slice(0, MAX_AOP_PROMPT_CHARS)}\n\n[Truncated for prompt safety]`
    : raw;

  return `\n\nCompany Annual Operating Plan (AOP):\n${trimmed}\n\nInstructions:\n- Align all suggested goals with this AOP\n- Ensure goals contribute to business objectives\n- Mention alignment briefly in each goal`;
}

function deriveAopAlignment(suggestion, aopContent) {
  const fallback = { aopAligned: false, aopReference: "" };

  try {
    const aop = String(aopContent || "").toLowerCase();
    if (!aop) return fallback;

    const rationale = String(suggestion?.rationale || "");
    const title = String(suggestion?.title || "");
    const description = String(suggestion?.description || "");
    const combined = `${title} ${description} ${rationale}`.toLowerCase();
    const businessSignal = /align|alignment|business objective|strategic|operating plan/.test(combined);

    const keywords = combined
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 5)
      .slice(0, 20);

    const overlap = keywords.filter((token) => aop.includes(token));
    const isAligned = businessSignal || overlap.length >= 2;

    if (!isAligned) return fallback;

    const reference = overlap.length > 0
      ? `AOP overlap detected via: ${overlap.slice(0, 3).join(", ")}.`
      : "Suggestion indicates alignment to business objectives from AOP.";

    return {
      aopAligned: true,
      aopReference: reference,
    };
  } catch {
    return fallback;
  }
}

async function buildSuggestions({ databases, cycleId, frameworkType, profile, prompt }) {
  const context = prompt?.trim() || "Improve execution quality and delivery confidence";
  const designation = profile.designation || profile.role || "professional";
  const aopContent = await getAOP(databases);
  const aopPromptContext = buildAopPromptContext(aopContent);
  const basePrompt = `Generate 3 goal suggestions for an employee with designation "${designation}" using the ${frameworkType} framework. Their intent: "${context}".
Return ONLY this JSON shape (weightages must sum to 100):
{"suggestions":[{"title":"...","description":"...","weightage":30,"rationale":"..."}]}`;

  const messages = [
    {
      role: "system",
      content: "You are a performance management expert. Respond with valid JSON only.",
    },
    {
      role: "user",
      content: `${basePrompt}${aopPromptContext}`,
    },
  ];

  const completion = await callOpenRouterWithUsage({
    messages,
    jsonMode: true,
  });

  const parsed = JSON.parse(completion.content);
  const suggestions = (parsed.suggestions ?? []).map((s) => {
    const alignment = deriveAopAlignment(s, aopContent);

    return {
      ...s,
      explainability: buildExplainability({
        source: "openrouter_llm",
        confidence: "high",
        whyFactors: [
          s?.rationale,
          `Mapped to framework ${frameworkType}`,
          "Aligned with role-specific goal phrasing and measurable outcome style.",
          alignment.aopAligned ? alignment.aopReference : "",
        ],
        timeWindow: cycleId,
      }),
    };
  });

  return {
    suggestions,
    usageDelta: buildAiUsageDelta({
      providerUsage: completion.usage,
      messages,
      completionText: completion.content,
    }),
  };
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
      userRole: profile.role,
    });

    const { suggestions, usageDelta } = await buildSuggestions({
      databases,
      cycleId,
      frameworkType,
      profile,
      prompt,
    });

    const trackedUsage = await trackAiUsageCost({
      databases,
      userId: profile.$id,
      cycleId,
      featureType: "goal_suggestion",
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
          "Framework fit check",
          "Role and designation context",
          "Prompt intent alignment",
        ],
        timeWindow: cycleId,
      });
    } catch {
      // Explainability must never block the main response payload.
      explainability = null;
    }

    return Response.json({
      data: {
        suggestions,
        explainability,
        usage: trackedUsage,
      },
      explainability,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

import { FRAMEWORK_TYPES } from "@/lib/appwriteSchema";
import { buildExplainability } from "@/lib/ai/explainability";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertAndTrackAiUsage, trackAiUsageCost } from "@/app/api/ai/_lib/aiUsage";
import { callOpenRouterWithUsage } from "@/lib/openrouter";
import { buildAiUsageDelta } from "@/lib/ai/costEstimation";
import { getAOP } from "@/lib/aop/getAOP";
import { getGoalLibraryTemplates } from "@/lib/services/goalLibraryService";
import { buildModeSystemSuffix, resolveAiMode } from "@/lib/ai/modes.js";

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

function normalizeText(value) {
  return String(value || "").trim();
}

function isSchemaDriftError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("unknown attribute") || message.includes("could not be found") || message.includes("attribute not found in schema");
}

async function buildWeightageContext(databases, employeeId, cycleId) {
  try {
    const result = await databases.listDocuments(databaseId, appwriteConfig.goalsCollectionId, [
      Query.equal("employeeId", employeeId),
      Query.equal("cycleId", cycleId),
      Query.orderDesc("$createdAt"),
      Query.limit(50),
    ]);

    const rows = (result.documents || []).map((goal) => ({
      title: String(goal?.title || "").trim(),
      frameworkType: String(goal?.frameworkType || "").trim(),
      weightage: Number(goal?.weightage || 0),
      status: String(goal?.status || "").trim(),
    }));

    const numericWeights = rows
      .map((row) => Number(row.weightage || 0))
      .filter((value) => Number.isFinite(value) && value > 0);

    const totalAssignedWeightage = numericWeights.reduce((sum, value) => sum + value, 0);
    const averageWeightage = numericWeights.length > 0
      ? totalAssignedWeightage / numericWeights.length
      : 0;

    return {
      totalAssignedWeightage: Number(totalAssignedWeightage.toFixed(2)),
      averageWeightage: Number(averageWeightage.toFixed(2)),
      existingGoals: rows.slice(0, 8),
    };
  } catch {
    return {
      totalAssignedWeightage: 0,
      averageWeightage: 0,
      existingGoals: [],
    };
  }
}

async function buildDepartmentAopHint(databases, department) {
  const normalizedDepartment = String(department || "").trim();
  if (!normalizedDepartment) return null;

  try {
    const result = await databases.listDocuments(databaseId, appwriteConfig.aopDocumentsCollectionId, [
      Query.equal("department", normalizedDepartment),
      Query.orderDesc("$createdAt"),
      Query.limit(1),
    ]);

    const doc = result.documents?.[0];
    if (!doc) return null;

    const title = String(doc?.title || doc?.name || "Department AOP").trim() || "Department AOP";
    const content = String(doc?.content || "").trim();
    if (!content) return null;

    const snippet = content.length > 500 ? `${content.slice(0, 500)}...` : content;
    return `${title}: ${snippet}`;
  } catch (error) {
    if (isSchemaDriftError(error)) {
      return null;
    }
    return null;
  }
}

async function buildSuggestions({ databases, cycleId, frameworkType, profile, prompt, mode }) {
  const context = prompt?.trim() || "Improve execution quality and delivery confidence";
  const designation = profile.designation || profile.role || "professional";
  const department = normalizeText(profile?.department);
  const aopContent = await getAOP(databases);
  const departmentAopHint = await buildDepartmentAopHint(databases, department);
  const weightageContext = await buildWeightageContext(databases, String(profile?.$id || "").trim(), cycleId);
  const aopPromptContext = buildAopPromptContext(aopContent);
  const countInstruction = mode === "decision_support"
    ? "Generate 3-4 goal suggestions"
    : "Generate 1-2 concise goal suggestions";
  const basePrompt = mode === "decision_support"
    ? `${countInstruction} for an employee with designation "${designation}".
Their intent: "${context}".
Preferred framework from UI: ${frameworkType}, but you may select OKR/MBO/HYBRID per goal when justified.

Use this cycle weightage context to justify each suggestion's weightage:
${JSON.stringify(weightageContext, null, 2)}

Department AOP alignment hint (if available):
${departmentAopHint ? departmentAopHint : "No department-specific AOP document found."}

Return ONLY this JSON shape:
{"suggestions":[{"title":"...","description":"...","framework":"OKR|MBO|HYBRID","frameworkRationale":"...","weightage":30,"weightageJustification":"...","rationale":"...","aopAlignmentHint":"optional"}]}`
    : `${countInstruction} for an employee with designation "${designation}" using the ${frameworkType} framework. Their intent: "${context}".
Return ONLY this JSON shape:
{"suggestions":[{"title":"...","description":"...","weightage":30,"rationale":"..."}]}`;

  const modeSuffix = buildModeSystemSuffix(mode, profile.role);

  const messages = [
    {
      role: "system",
      content: `You are a performance management expert. Respond with valid JSON only.\n${modeSuffix}`,
    },
    {
      role: "user",
      content: `${basePrompt}${aopPromptContext}`,
    },
  ];

  const completion = await callOpenRouterWithUsage({
    messages,
    jsonMode: true,
    maxTokens: mode === "decision_support" ? 2000 : 800,
  });

  const parsed = JSON.parse(completion.content);
  const maxSuggestions = mode === "decision_support" ? 4 : 2;
  const suggestions = (parsed.suggestions ?? []).slice(0, maxSuggestions).map((s) => {
    const alignment = deriveAopAlignment(s, aopContent);

    const framework = normalizeText(s?.framework || frameworkType).toUpperCase();
    const frameworkValue = VALID_FRAMEWORKS.includes(framework) ? framework : frameworkType;
    const weightage = Number.parseInt(String(s?.weightage || "0"), 10) || 0;

    return {
      title: normalizeText(s?.title),
      description: normalizeText(s?.description),
      weightage,
      rationale: normalizeText(s?.rationale),
      framework: mode === "decision_support" ? frameworkValue : undefined,
      frameworkRationale: mode === "decision_support" ? normalizeText(s?.frameworkRationale) || undefined : undefined,
      weightageJustification:
        mode === "decision_support"
          ? normalizeText(s?.weightageJustification) || undefined
          : undefined,
      aopAlignmentHint:
        mode === "decision_support"
          ? normalizeText(s?.aopAlignmentHint || alignment.aopReference) || undefined
          : undefined,
      explainability: buildExplainability({
        source: "openrouter_llm",
        confidence: "high",
        whyFactors: [
          normalizeText(s?.rationale),
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
    const cycleId = normalizeText(body.cycleId);
    const frameworkType = normalizeText(body.frameworkType);
    const prompt = normalizeText(body.prompt);
    const rawMode = body?.mode ?? "suggestion";
    const contextRole = normalizeText(profile?.role);
    const contextDepartment = normalizeText(body?.department || profile?.department);
    const contextDomain = normalizeText(body?.domain || profile?.domain);
    const contextInputText = prompt;
    const mode = resolveAiMode(rawMode, profile.role);

    if (!cycleId || !frameworkType) {
      return Response.json(
        { error: "cycleId and frameworkType are required." },
        { status: 400 }
      );
    }

    if (!VALID_FRAMEWORKS.includes(frameworkType)) {
      return Response.json({ error: "Invalid frameworkType." }, { status: 400 });
    }

    const libraryResult = await getGoalLibraryTemplates({
      role: contextRole,
      department: contextDepartment,
      domain: contextDomain || undefined,
      query: contextInputText || undefined,
    });

    if ((libraryResult.templates || []).length > 0) {
      return Response.json({
        data: {
          suggestions: libraryResult.templates,
          source: "library",
        },
        source: "library",
      });
    }

    const usage = await assertAndTrackAiUsage({
      databases,
      userId: profile.$id,
      cycleId,
      featureType: "goal_suggestion",
      userRole: profile.role,
      resolvedMode: mode,
    });

    const { suggestions, usageDelta } = await buildSuggestions({
      databases,
      cycleId,
      frameworkType,
      profile,
      prompt,
      mode,
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
        source: "ai",
      },
      explainability,
      source: "ai",
    });
  } catch (error) {
    return errorResponse(error);
  }
}

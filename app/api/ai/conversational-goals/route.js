import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { assertFrameworkAllowed, getFrameworkPolicy } from "@/lib/frameworkPolicies";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertAndTrackAiUsage, trackAiUsageCost } from "@/app/api/ai/_lib/aiUsage";
import { callOpenRouterWithUsage } from "@/lib/openrouter";
import { assertManagerCanAccessEmployee } from "@/lib/teamAccess";
import { buildAiUsageDelta } from "@/lib/ai/costEstimation";
import { buildExplainability } from "@/lib/ai/explainability";
import { getAOP } from "@/lib/aop/getAOP";

const MAX_AOP_PROMPT_CHARS = 4000;

function safeJsonParse(input, fallback) {
  try {
    return JSON.parse(input);
  } catch {
    return fallback;
  }
}

async function listGoalContext(databases, employeeId, cycleId) {
  const [goalsRes, progressRes, checkInsRes] = await Promise.all([
    databases.listDocuments(databaseId, appwriteConfig.goalsCollectionId, [
      Query.equal("employeeId", employeeId),
      Query.equal("cycleId", cycleId),
      Query.orderDesc("$createdAt"),
      Query.limit(25),
    ]),
    databases.listDocuments(databaseId, appwriteConfig.progressUpdatesCollectionId, [
      Query.equal("employeeId", employeeId),
      Query.orderDesc("$createdAt"),
      Query.limit(12),
    ]),
    databases.listDocuments(databaseId, appwriteConfig.checkInsCollectionId, [
      Query.equal("employeeId", employeeId),
      Query.orderDesc("scheduledAt"),
      Query.limit(10),
    ]),
  ]);

  return {
    goals: goalsRes.documents.map((goal) => ({
      id: goal.$id,
      title: goal.title,
      status: goal.status,
      frameworkType: goal.frameworkType,
      weightage: goal.weightage,
      progressPercent: goal.progressPercent ?? goal.processPercent ?? 0,
      lineageRef: goal.lineageRef || "",
      parentGoalId: goal.parentGoalId || "",
    })),
    recentProgress: progressRes.documents.map((row) => ({
      goalId: row.goalId,
      percentComplete: row.percentComplete,
      ragStatus: row.ragStatus,
      updateText: String(row.updateText || "").slice(0, 180),
      createdAt: row.createdAt || row.$createdAt,
    })),
    checkIns: checkInsRes.documents.map((row) => ({
      goalId: row.goalId,
      status: row.status,
      scheduledAt: row.scheduledAt,
      isFinalCheckIn: Boolean(row.isFinalCheckIn),
    })),
  };
}

function buildConversationPrompt({
  profile,
  frameworkType,
  message,
  context,
  parentGoal,
  conversationId,
}) {
  const roleLabel = profile.designation || profile.role || "professional";

  return `You are a performance-management goal coach.
Return valid JSON only.

Conversation metadata:
- conversationId: ${conversationId || "n/a"}
- userRole: ${profile.role}
- designation: ${roleLabel}
- frameworkType: ${frameworkType}

User message:
${message}

Existing cycle context:
${JSON.stringify(context, null, 2)}

Parent goal context (if cascading):
${JSON.stringify(parentGoal || null, null, 2)}

Required JSON shape:
{
  "assistantReply": "short coaching response",
  "questions": ["clarifying question"],
  "suggestedGoals": [
    {
      "title": "goal title",
      "description": "measurable description",
      "weightage": 25,
      "cascadeHint": "optional hint"
    }
  ],
  "goalPatch": {
    "title": "optional",
    "description": "optional",
    "weightage": 0,
    "frameworkType": "optional"
  },
  "nextActions": ["action item"]
}

Rules:
- Keep suggestions realistic for the provided context.
- If user asks for cascading, align child goals under the parent.
- Weightage values must be integers between 1 and 100 when present.
- Never include sensitive data outside the provided context.`;
}

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

    const title = String(suggestion?.title || "");
    const description = String(suggestion?.description || "");
    const cascadeHint = String(suggestion?.cascadeHint || "");
    const combined = `${title} ${description} ${cascadeHint}`.toLowerCase();
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

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager"]);

    const body = await request.json();
    const cycleId = String(body.cycleId || "").trim();
    const frameworkTypeInput = String(body.frameworkType || "HYBRID").trim();
    const message = String(body.message || "").trim();
    const conversationId = String(body.conversationId || "").trim();
    const targetEmployeeId = String(body.targetEmployeeId || profile.$id || "").trim();
    const parentGoalId = String(body.parentGoalId || "").trim();

    if (!cycleId || !message) {
      return Response.json(
        { error: "cycleId and message are required." },
        { status: 400 }
      );
    }

    const frameworkPolicy = await getFrameworkPolicy(databases);
    const frameworkType = assertFrameworkAllowed(frameworkTypeInput, frameworkPolicy);

    if (profile.role === "employee" && targetEmployeeId !== String(profile.$id || "").trim()) {
      return Response.json({ error: "Forbidden for requested employee." }, { status: 403 });
    }

    if (profile.role === "manager") {
      await assertManagerCanAccessEmployee(databases, profile.$id, targetEmployeeId);
    }

    let parentGoal = null;

    if (parentGoalId) {
      const goalDoc = await databases.getDocument(
        databaseId,
        appwriteConfig.goalsCollectionId,
        parentGoalId
      );

      if (String(goalDoc.employeeId || "").trim() !== targetEmployeeId) {
        return Response.json(
          { error: "parentGoalId does not belong to targetEmployeeId." },
          { status: 400 }
        );
      }

      parentGoal = {
        id: goalDoc.$id,
        title: goalDoc.title,
        description: goalDoc.description,
        frameworkType: goalDoc.frameworkType,
        weightage: goalDoc.weightage,
        status: goalDoc.status,
        lineageRef: goalDoc.lineageRef || "",
      };
    }

    const usage = await assertAndTrackAiUsage({
      databases,
      userId: profile.$id,
      cycleId,
      featureType: "goal_suggestion",
      userRole: profile.role,
    });

    const context = await listGoalContext(databases, targetEmployeeId, cycleId);
    const aopContent = await getAOP(databases);
    const basePrompt = buildConversationPrompt({
      profile,
      frameworkType,
      message,
      context,
      parentGoal,
      conversationId,
    });
    const promptWithAop = `${basePrompt}${buildAopPromptContext(aopContent)}`;

    const messages = [
      {
        role: "system",
        content: "You are a precise performance-management assistant. JSON only.",
      },
      {
        role: "user",
        content: promptWithAop,
      },
    ];

    const completion = await callOpenRouterWithUsage({
      messages,
      jsonMode: true,
      maxTokens: 500,
    });

    const raw = completion.content;
    const usageDelta = buildAiUsageDelta({
      providerUsage: completion.usage,
      messages,
      completionText: completion.content,
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

    const parsed = safeJsonParse(raw, {
      assistantReply: "I can help you shape better goals. Share the outcome and timeline you want.",
      questions: [],
      suggestedGoals: [],
      goalPatch: {},
      nextActions: [],
    });

    const normalizedSuggestions = Array.isArray(parsed?.suggestedGoals)
      ? parsed.suggestedGoals
          .map((item) => {
            const normalized = {
              title: String(item?.title || "").trim(),
              description: String(item?.description || "").trim(),
              weightage: Number.parseInt(String(item?.weightage || ""), 10),
              cascadeHint: String(item?.cascadeHint || "").trim(),
            };
            const alignment = deriveAopAlignment(normalized, aopContent);

            return {
              ...normalized,
              explainability: buildExplainability({
                source: "openrouter_llm",
                confidence: 0.7,
                reason: "Suggestion generated from conversation intent, existing goals, and current progress context.",
                based_on: ["goal data", "progress", "check-ins"],
                whyFactors: [alignment.aopAligned ? alignment.aopReference : ""],
                time_window: cycleId,
              }),
            };
          })
          .filter(
            (item) =>
              item.title &&
              item.description &&
              Number.isInteger(item.weightage) &&
              item.weightage >= 1 &&
              item.weightage <= 100
          )
      : [];

    return Response.json({
      data: {
        assistantReply: String(parsed?.assistantReply || "").trim(),
        questions: Array.isArray(parsed?.questions) ? parsed.questions.map((q) => String(q)) : [],
        suggestedGoals: normalizedSuggestions,
        goalPatch: parsed?.goalPatch && typeof parsed.goalPatch === "object" ? parsed.goalPatch : {},
        nextActions: Array.isArray(parsed?.nextActions) ? parsed.nextActions.map((q) => String(q)) : [],
        contextWindow: {
          goals: context.goals.length,
          recentProgress: context.recentProgress.length,
          checkIns: context.checkIns.length,
        },
        usage: trackedUsage,
        conversation: {
          conversationId: conversationId || null,
          parentGoalId: parentGoalId || null,
          targetEmployeeId,
        },
        explainability: buildExplainability({
          source: "openrouter_llm",
          confidence: 0.72,
          reason: "Conversational guidance was generated using message intent and cycle context.",
          based_on: ["goal data", "progress", "check-ins", "conversation context"],
          time_window: cycleId,
        }),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

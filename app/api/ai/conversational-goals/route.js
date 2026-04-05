import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { assertFrameworkAllowed, getFrameworkPolicy } from "@/lib/frameworkPolicies";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertAndTrackAiUsage } from "@/app/api/ai/_lib/aiUsage";
import { callOpenRouter } from "@/lib/openrouter";
import { assertManagerCanAccessEmployee } from "@/lib/teamAccess";

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
    });

    const context = await listGoalContext(databases, targetEmployeeId, cycleId);

    const raw = await callOpenRouter({
      messages: [
        {
          role: "system",
          content: "You are a precise performance-management assistant. JSON only.",
        },
        {
          role: "user",
          content: buildConversationPrompt({
            profile,
            frameworkType,
            message,
            context,
            parentGoal,
            conversationId,
          }),
        },
      ],
      jsonMode: true,
      maxTokens: 500,
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
          .map((item) => ({
            title: String(item?.title || "").trim(),
            description: String(item?.description || "").trim(),
            weightage: Number.parseInt(String(item?.weightage || ""), 10),
            cascadeHint: String(item?.cascadeHint || "").trim(),
            explainability: { source: "openrouter_llm", confidence: "medium" },
          }))
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
        usage,
        conversation: {
          conversationId: conversationId || null,
          parentGoalId: parentGoalId || null,
          targetEmployeeId,
        },
        explainability: { source: "openrouter_llm", confidence: "medium" },
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

import { FRAMEWORK_TYPES } from "@/lib/appwriteSchema";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertAndTrackAiUsage } from "@/app/api/ai/_lib/aiUsage";

const VALID_FRAMEWORKS = Object.values(FRAMEWORK_TYPES);

function buildSuggestions({ frameworkType, profile, prompt }) {
  const context = prompt?.trim() || "Improve execution quality and delivery confidence";

  return [
    {
      title: `Improve ${frameworkType} execution quality`,
      description:
        `Deliver measurable outcomes for ${profile.designation || "your role"} by defining milestones, ` +
        "tracking weekly progress, and reducing blockers through proactive escalation.",
      weightage: 30,
      rationale: `Aligned to role context and user intent: ${context}`,
      explainability: {
        source: "rule_based_generator",
        confidence: "medium",
      },
    },
    {
      title: "Increase cross-team delivery predictability",
      description:
        "Establish clear dependencies with partner teams, publish monthly status updates, " +
        "and improve on-time completion for committed deliverables.",
      weightage: 25,
      rationale: "Improves collaboration and reduces timeline slippage.",
      explainability: {
        source: "rule_based_generator",
        confidence: "medium",
      },
    },
    {
      title: "Raise impact visibility with outcome reporting",
      description:
        "Create a recurring outcome summary with KPI deltas, completed initiatives, and next-step risks " +
        "to support manager reviews and check-ins.",
      weightage: 20,
      rationale: "Makes review conversations evidence-based and easier to approve.",
      explainability: {
        source: "rule_based_generator",
        confidence: "high",
      },
    },
  ];
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee"]);

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

    const suggestions = buildSuggestions({ frameworkType, profile, prompt });

    return Response.json({
      data: {
        suggestions,
        explainability: {
          source: "rule_based_generator",
          confidence: "medium",
        },
        usage,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

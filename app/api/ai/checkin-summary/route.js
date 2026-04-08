import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertAndTrackAiUsage, trackAiUsageCost } from "@/app/api/ai/_lib/aiUsage";
import { callOpenRouterWithUsage } from "@/lib/openrouter";
import { buildExplainability } from "@/lib/ai/explainability";
import { buildAiUsageDelta } from "@/lib/ai/costEstimation";
import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";

function normalize(value) {
  return String(value || "").trim();
}

function labelToRatingValue(label) {
  const normalized = normalize(label).toUpperCase();
  const map = {
    EE: 5,
    DE: 4,
    ME: 3,
    SME: 2,
    NI: 1,
  };
  return map[normalized] || null;
}

function buildMismatchInsights(selfReview, progressPercent) {
  const insights = [];
  if (!selfReview) return insights;

  const rating =
    Number.isFinite(Number(selfReview?.selfRatingValue))
      ? Number(selfReview.selfRatingValue)
      : labelToRatingValue(selfReview?.selfRatingLabel);

  if (Number.isFinite(rating) && rating >= 4 && progressPercent < 50) {
    insights.push("High self-rating appears inconsistent with low progress trajectory.");
  }
  if (Number.isFinite(rating) && rating <= 2 && progressPercent >= 70) {
    insights.push("Low self-rating appears conservative versus strong progress trajectory.");
  }

  return insights;
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager"]);

    const body = await request.json();
    const cycleId = (body.cycleId || "").trim();
    const notes = (body.notes || "").trim();
    const goalTitle = (body.goalTitle || "").trim();
    const goalId = normalize(body.goalId);
    const employeeId = normalize(body.employeeId) || normalize(profile.$id);

    if (!cycleId || !notes) {
      return Response.json(
        { error: "cycleId and notes are required." },
        { status: 400 }
      );
    }

    const goalDocument = goalId
      ? await databases
          .getDocument(databaseId, appwriteConfig.goalsCollectionId, goalId)
          .catch(() => null)
      : null;

    const progressRowsResult = goalId
      ? await databases
          .listDocuments(databaseId, appwriteConfig.progressUpdatesCollectionId, [
            Query.equal("goalId", goalId),
            Query.orderDesc("$createdAt"),
            Query.limit(5),
          ])
          .catch(() => ({ documents: [] }))
      : { documents: [] };

    const checkInsResult = goalId
      ? await databases
          .listDocuments(databaseId, appwriteConfig.checkInsCollectionId, [
            Query.equal("goalId", goalId),
            Query.orderDesc("scheduledAt"),
            Query.limit(5),
          ])
          .catch(() => ({ documents: [] }))
      : { documents: [] };

    const selfReviewResult = goalId
      ? await databases
          .listDocuments(databaseId, appwriteConfig.goalSelfReviewsCollectionId, [
            Query.equal("employeeId", employeeId),
            Query.equal("goalId", goalId),
            Query.equal("cycleId", cycleId),
            Query.limit(1),
          ])
          .catch(() => ({ documents: [] }))
      : { documents: [] };

    const selfReview = selfReviewResult.documents?.[0] || null;
    const latestProgress = progressRowsResult.documents?.[0] || null;
    const progressPercent = Number(
      latestProgress?.percentComplete ?? goalDocument?.progressPercent ?? goalDocument?.processPercent ?? 0
    );
    const mismatchInsights = buildMismatchInsights(selfReview, progressPercent);

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
        content: "You are a performance management assistant. Respond with valid JSON only.",
      },
      {
        role: "user",
        content: `Summarise this check-in for goal "${goalTitle || "this goal"}" using both employee and system views:
Manager notes: "${notes}"
Employee self review: ${JSON.stringify(
          selfReview
            ? {
                achievements: selfReview.achievements || "",
                challenges: selfReview.challenges || "",
                ratingValue: selfReview.selfRatingValue ?? null,
                ratingLabel: selfReview.selfRatingLabel || null,
                comments: selfReview.selfComment || "",
              }
            : null
        )}
Recent check-ins: ${JSON.stringify(
          (checkInsResult.documents || []).map((row) => ({
            scheduledAt: row.scheduledAt,
            summary:
              row.transcriptText || row.managerNotes || row.employeeNotes || "No check-in text",
          }))
        )}
Goal progress: ${JSON.stringify({
          progressPercent,
          latestUpdateText: latestProgress?.updateText || "",
          ragStatus: latestProgress?.ragStatus || null,
        })}
Mismatch hints: ${JSON.stringify(mismatchInsights)}

Return ONLY this JSON shape:
{"summary":"one sentence summary","balancedSummary":"employee plus system perspective","insights":["..."],"highlights":["...","..."],"blockers":["..."],"nextActions":["...","..."]}`,
      },
    ];

    const completion = await callOpenRouterWithUsage({
      messages,
      jsonMode: true,
    });

    const parsed = JSON.parse(completion.content);
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

    let explainability = null;
    try {
      explainability = buildExplainability({
        source: "openrouter_llm",
        confidence: "high",
        reason:
          "Balanced summary generated by reconciling employee self-review with check-in and progress evidence.",
        based_on: ["self_review", "check_ins", "progress"],
        whyFactors: [
          `Goal context: ${goalTitle || "general"}`,
          selfReview
            ? "Used employee self-review achievements, challenges, rating, and comments."
            : "No self-review found; relied on check-ins and progress only.",
          "Compared employee perception with measured progress and check-in trajectory.",
        ],
        timeWindow: cycleId,
      });
    } catch {
      explainability = null;
    }

    return Response.json({
      data: {
        summary: parsed.summary ?? "Check-in progress reviewed.",
        balancedSummary:
          parsed.balancedSummary ||
          `Employee view and system signals were balanced using self review, check-ins, and progress (${Number.isFinite(progressPercent) ? progressPercent : 0}%).`,
        insights:
          Array.isArray(parsed.insights) && parsed.insights.length > 0
            ? parsed.insights
            : mismatchInsights,
        highlights: parsed.highlights?.length ? parsed.highlights : ["Progress milestones reviewed."],
        blockers: parsed.blockers?.length ? parsed.blockers : ["No major blockers identified."],
        nextActions: parsed.nextActions?.length
          ? parsed.nextActions
          : ["Confirm next milestone before the next check-in."],
        explainability,
        usage: trackedUsage,
      },
      explainability,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

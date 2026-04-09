import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertAndTrackAiUsage, trackAiUsageCost } from "@/app/api/ai/_lib/aiUsage";
import { callOpenRouterWithUsage } from "@/lib/openrouter";
import { buildExplainability } from "@/lib/ai/explainability";
import { buildAiUsageDelta } from "@/lib/ai/costEstimation";
import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { buildModeSystemSuffix, resolveAiMode } from "@/lib/ai/modes.js";

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

function toSafeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildHistoricalCheckInNotes(rows) {
  return (Array.isArray(rows) ? rows : []).slice(0, 2).map((row) => ({
    scheduledAt: row?.scheduledAt || row?.$createdAt || null,
    note:
      normalize(row?.managerNotes) ||
      normalize(row?.employeeNotes) ||
      normalize(row?.transcriptText) ||
      null,
  }));
}

function buildProgressTrend(rows) {
  return (Array.isArray(rows) ? rows : []).slice(0, 6).map((row) => ({
    at: row?.createdAt || row?.$createdAt || null,
    percentComplete: toSafeNumber(row?.percentComplete),
    ragStatus: normalize(row?.ragStatus) || null,
    updateText: normalize(row?.updateText).slice(0, 180) || null,
  }));
}

async function fetchEmployeeTrajectory(databases, employeeId) {
  if (!employeeId) return [];

  try {
    const result = await databases.listDocuments(databaseId, appwriteConfig.employeeCycleScoresCollectionId, [
      Query.equal("employeeId", employeeId),
      Query.orderDesc("computedAt"),
      Query.limit(6),
    ]);

    return (result.documents || []).map((row) => ({
      cycleId: normalize(row?.cycleId) || null,
      scoreX100: toSafeNumber(row?.scoreX100),
      scoreLabel: normalize(row?.scoreLabel) || null,
      computedAt: row?.computedAt || row?.$createdAt || null,
    }));
  } catch {
    // Schema drift tolerance for environments missing employee_cycle_scores.
    return [];
  }
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
    const rawMode = body?.mode ?? "suggestion";
    const mode = resolveAiMode(rawMode, profile.role);

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
    const historicalCheckInNotes = buildHistoricalCheckInNotes(checkInsResult.documents || []);
    const progressTrend = buildProgressTrend(progressRowsResult.documents || []);
    const employeeTrajectory =
      mode === "decision_support"
        ? await fetchEmployeeTrajectory(databases, employeeId)
        : [];

    const usage = await assertAndTrackAiUsage({
      databases,
      userId: profile.$id,
      cycleId,
      featureType: "checkin_summary",
      userRole: profile.role,
      resolvedMode: mode,
    });

    const modeSuffix = buildModeSystemSuffix(mode, profile.role);
    const summaryInstruction = mode === "decision_support"
      ? "Provide a full structured summary with sections: Key Themes, Progress Assessment, Risk Signals, Recommended Next Actions. End with an Explainability block."
      : "Provide a short 2-3 sentence summary.";

    const messages = [
      {
        role: "system",
        content: `You are a performance management assistant. Respond with valid JSON only.\n${modeSuffix}`,
      },
      {
        role: "user",
        content: `Summarise this check-in for goal "${goalTitle || "this goal"}" using both employee and system views.
Mode: ${mode}
Instruction: ${summaryInstruction}

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
Historical check-in notes for this goal (last 2): ${JSON.stringify(historicalCheckInNotes)}
Progress updates trend: ${JSON.stringify(progressTrend)}
Employee trajectory data from employee_cycle_scores: ${JSON.stringify(employeeTrajectory)}
Mismatch hints: ${JSON.stringify(mismatchInsights)}

Return ONLY this JSON shape:
{"summary":"..."}`,
      },
    ];

    const completion = await callOpenRouterWithUsage({
      messages,
      jsonMode: true,
      maxTokens: mode === "decision_support" ? 2000 : 800,
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
        summary: normalize(parsed?.summary) || "Check-in progress reviewed.",
        balancedSummary:
          parsed?.balancedSummary ||
          `Employee view and system signals were balanced using self review, check-ins, and progress (${Number.isFinite(progressPercent) ? progressPercent : 0}%).`,
        insights:
          Array.isArray(parsed?.insights) && parsed.insights.length > 0
            ? parsed.insights
            : mismatchInsights,
        highlights: parsed?.highlights?.length ? parsed.highlights : ["Progress milestones reviewed."],
        blockers: parsed?.blockers?.length ? parsed.blockers : ["No major blockers identified."],
        nextActions: parsed?.nextActions?.length
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

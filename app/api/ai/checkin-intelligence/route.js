import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertAndTrackAiUsage, trackAiUsageCost } from "@/app/api/ai/_lib/aiUsage";
import { callOpenRouterWithUsage } from "@/lib/openrouter";
import { buildExplainability } from "@/lib/ai/explainability";
import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import {
  computeMatrixBlend,
  isMissingCollectionError,
  listAssignments,
  listFeedback,
} from "@/lib/matrixReviews";
import { assertManagerCanAccessEmployee } from "@/lib/teamAccess";
import { buildAiUsageDelta } from "@/lib/ai/costEstimation";
import { buildModeSystemSuffix, resolveAiMode } from "@/lib/ai/modes.js";

function safeParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

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

function summarizeCheckIns(rows) {
  return rows
    .slice(0, 5)
    .map((row) => {
      const when = normalize(row?.scheduledAt || row?.$createdAt || "n/a");
      const summary =
        normalize(row?.transcriptText) ||
        normalize(row?.managerNotes) ||
        normalize(row?.employeeNotes) ||
        "No textual summary";
      return `${when}: ${summary.slice(0, 220)}`;
    });
}

function buildMismatchInsights({ selfReview, progressPercent }) {
  const insights = [];

  if (!selfReview) {
    insights.push("Self review missing; confidence is reduced for perception alignment.");
    return insights;
  }

  const derivedRating =
    Number.isFinite(Number(selfReview?.selfRatingValue))
      ? Number(selfReview.selfRatingValue)
      : labelToRatingValue(selfReview?.selfRatingLabel);

  if (Number.isFinite(derivedRating)) {
    if (derivedRating >= 4 && progressPercent < 50) {
      insights.push(
        "Perception mismatch: self-rating is high while measured progress is below 50%."
      );
    }

    if (derivedRating <= 2 && progressPercent >= 70) {
      insights.push(
        "Perception mismatch: self-rating is low despite strong measured progress."
      );
    }
  }

  return insights;
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["manager", "employee"]);

    const body = await request.json();
    const cycleId = String(body?.cycleId || "").trim();
    const goalTitle = String(body?.goalTitle || "").trim();
    const notes = String(body?.notes || "").trim();
    const goalId = String(body?.goalId || "").trim();
    const employeeIdInput = String(body?.employeeId || "").trim();
    const rawMode = body?.mode ?? "suggestion";
    const mode = resolveAiMode(rawMode, profile.role);

    if (!cycleId || !notes) {
      return Response.json({ error: "cycleId and notes are required." }, { status: 400 });
    }

    const goalDocument = goalId
      ? await databases
          .getDocument(databaseId, appwriteConfig.goalsCollectionId, goalId)
          .catch(() => null)
      : null;

    const effectiveEmployeeId = employeeIdInput || normalize(goalDocument?.employeeId);
    const effectiveGoalId = goalId || normalize(goalDocument?.$id);

    let selfReview = null;
    if (effectiveEmployeeId && effectiveGoalId) {
      const selfReviewResult = await databases
        .listDocuments(databaseId, appwriteConfig.goalSelfReviewsCollectionId, [
          Query.equal("employeeId", effectiveEmployeeId),
          Query.equal("goalId", effectiveGoalId),
          Query.equal("cycleId", cycleId),
          Query.limit(1),
        ])
        .catch((error) => {
          const message = String(error?.message || "").toLowerCase();
          if (message.includes("collection") && message.includes("could not be found")) {
            return { documents: [] };
          }
          throw error;
        });

      selfReview = selfReviewResult?.documents?.[0] || null;
    }

    const checkInsResult = effectiveGoalId
      ? await databases
          .listDocuments(databaseId, appwriteConfig.checkInsCollectionId, [
            Query.equal("goalId", effectiveGoalId),
            Query.orderDesc("scheduledAt"),
            Query.limit(5),
          ])
          .catch(() => ({ documents: [] }))
      : { documents: [] };

    const progressRowsResult = effectiveGoalId
      ? await databases
          .listDocuments(databaseId, appwriteConfig.progressUpdatesCollectionId, [
            Query.equal("goalId", effectiveGoalId),
            Query.orderDesc("$createdAt"),
            Query.limit(10),
          ])
          .catch(() => ({ documents: [] }))
      : { documents: [] };

    const latestProgress = progressRowsResult.documents?.[0] || null;
    const progressPercent = Number(
      latestProgress?.percentComplete ??
        goalDocument?.progressPercent ??
        goalDocument?.processPercent ??
        0
    );

    const checkInSummaries = summarizeCheckIns(checkInsResult.documents || []);
    const mismatchInsights = buildMismatchInsights({ selfReview, progressPercent });

    const selfReviewContext = selfReview
      ? {
          status: normalize(selfReview.status) || "draft",
          achievements: normalize(selfReview.achievements),
          challenges: normalize(selfReview.challenges),
          ratingValue:
            Number.isFinite(Number(selfReview.selfRatingValue))
              ? Number(selfReview.selfRatingValue)
              : null,
          ratingLabel: normalize(selfReview.selfRatingLabel),
          comments: normalize(selfReview.selfComment),
        }
      : null;

    const isManager = String(profile.role || "").trim() === "manager";
    let matrixBlend = {
      reviewerCount: 0,
      responseCount: 0,
      influenceWeightTotal: 0,
      weightedRating: null,
      keySignals: [],
    };

    if (isManager && employeeIdInput) {
      await assertManagerCanAccessEmployee(databases, profile.$id, employeeIdInput);

      try {
        const assignments = await listAssignments(databases, {
          employeeId: employeeIdInput,
          primaryManagerId: profile.$id,
          cycleId,
          goalId,
          status: "active",
        });

        const feedbackRows = await listFeedback(databases, {
          employeeId: employeeIdInput,
          cycleId,
          goalId,
        });

        matrixBlend = computeMatrixBlend(feedbackRows, assignments);
      } catch (error) {
        if (
          isMissingCollectionError(error, "matrix_reviewer_assignments") ||
          isMissingCollectionError(error, "matrix_reviewer_feedback")
        ) {
          matrixBlend = {
            reviewerCount: 0,
            responseCount: 0,
            influenceWeightTotal: 0,
            weightedRating: null,
            keySignals: [],
          };
        } else {
          throw error;
        }
      }
    }

    const usage = await assertAndTrackAiUsage({
      databases,
      userId: profile.$id,
      cycleId,
      featureType: "checkin_summary",
      userRole: profile.role,
      resolvedMode: mode,
    });

    const messages = [
      {
        role: "system",
        content: `You are a check-in intelligence assistant. Return valid JSON only. ${buildModeSystemSuffix(mode, profile.role)}`,
      },
      {
        role: "user",
        content: `Analyze manager check-in intelligence using both employee and system perspectives.\nGoal: ${goalTitle || "n/a"}\nManager check-in notes:\n${notes}\n\nEmployee self review context:\n${JSON.stringify(selfReviewContext)}\n\nRecent check-in summaries:\n${JSON.stringify(checkInSummaries)}\n\nProgress context:\n${JSON.stringify({ progressPercent, latestProgress: latestProgress ? { percentComplete: latestProgress.percentComplete, ragStatus: latestProgress.ragStatus, updateText: latestProgress.updateText } : null })}\n\nKnown mismatch hints:\n${JSON.stringify(mismatchInsights)}\n\nMatrix reviewer context:\n${JSON.stringify(matrixBlend)}\n\nReturn JSON:\n{"summary":"...","balancedSummary":"...","insights":["..."] ,"commitments":[{"owner":"...","action":"...","dueDate":"optional"}],"coachingScore":{"score":1-10,"reasoning":["..."]},"toneGuidance":["..."],"revisedManagerFeedback":"...","ratingSuggestion":{"value":1-5,"label":"EE|DE|ME|SME|NI","rationale":"..."}}`,
      },
    ];

    const completion = await callOpenRouterWithUsage({
      messages,
      jsonMode: true,
      maxTokens: mode === "decision_support" ? 2000 : 800,
    });

    const parsed = safeParse(completion.content, {});
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
    const commitments = Array.isArray(parsed?.commitments)
      ? parsed.commitments
          .map((item) => ({
            owner: String(item?.owner || "").trim() || "manager",
            action: String(item?.action || "").trim(),
            dueDate: String(item?.dueDate || "").trim() || null,
          }))
          .filter((item) => item.action)
          .slice(0, 6)
      : [];

    const rawScore = Number(parsed?.coachingScore?.score || 0);
    const score = Number.isFinite(rawScore) ? clamp(Math.round(rawScore), 1, 10) : 6;

    const reasoning = Array.isArray(parsed?.coachingScore?.reasoning)
      ? parsed.coachingScore.reasoning.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 4)
      : [];

    const toneGuidance = Array.isArray(parsed?.toneGuidance)
      ? parsed.toneGuidance.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 5)
      : [];

    const insights = Array.isArray(parsed?.insights)
      ? parsed.insights.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 6)
      : [];

    const ratingRaw = Number(parsed?.ratingSuggestion?.value || 0);
    const ratingSuggestionValue = Number.isFinite(ratingRaw) ? clamp(Math.round(ratingRaw), 1, 5) : null;
    const ratingSuggestionLabel = normalize(parsed?.ratingSuggestion?.label).toUpperCase();

    return Response.json({
      data: {
        summary: String(parsed?.summary || "").trim() || "Check-in analyzed.",
        balancedSummary:
          String(parsed?.balancedSummary || "").trim() ||
          `Employee view: ${selfReviewContext?.comments || "not provided"}. System view: progress is ${Number.isFinite(progressPercent) ? progressPercent : 0}%.`,
        insights:
          insights.length > 0
            ? insights
            : [
                ...mismatchInsights,
                selfReviewContext
                  ? "Self-review input was used as justification context for coaching and rating guidance."
                  : "Self-review input was not available; recommendations rely on check-ins and progress only.",
              ].slice(0, 6),
        commitments,
        coachingScore: {
          score,
          reasoning: reasoning.length > 0 ? reasoning : ["Feedback has baseline clarity but can include more specific next steps."],
        },
        toneGuidance: toneGuidance.length > 0 ? toneGuidance : ["Use specific, actionable statements with neutral and constructive phrasing."],
        revisedManagerFeedback:
          String(parsed?.revisedManagerFeedback || "").trim() ||
          "Good progress so far. Please close the open blocker with a concrete owner and date before next check-in.",
        ratingSuggestion:
          ratingSuggestionValue === null
            ? null
            : {
                value: ratingSuggestionValue,
                label: ["NI", "SME", "ME", "DE", "EE"][ratingSuggestionValue - 1],
                rationale:
                  String(parsed?.ratingSuggestion?.rationale || "").trim() ||
                  "Suggested from employee reflection, check-in summaries, and measured progress.",
              },
        contextUsed: {
          selfReview: selfReviewContext,
          checkInSummaries,
          progress: {
            percent: Number.isFinite(progressPercent) ? progressPercent : 0,
            latestUpdateText: normalize(latestProgress?.updateText),
          },
        },
        matrixBlend,
        explainability: buildExplainability({
          source: "openrouter_llm",
          confidence: score >= 8 ? "high" : score >= 5 ? "medium" : "low",
          reason:
            "Generated by balancing employee self perception against check-in trajectory and measured progress signals.",
          based_on: ["self_review", "check_ins", "progress"],
          whyFactors: [
            `Goal context: ${goalTitle || "general"}`,
            selfReviewContext
              ? "Used employee self review (achievements, challenges, rating, comments) as justification context."
              : "Employee self review missing; relied on check-ins and progress context.",
            "Compared employee perception against system progress and check-in summaries to detect mismatches.",
          ],
          timeWindow: cycleId,
        }),
        usage: trackedUsage,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

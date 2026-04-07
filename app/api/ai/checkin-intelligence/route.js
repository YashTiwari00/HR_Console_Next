import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertAndTrackAiUsage, trackAiUsageCost } from "@/app/api/ai/_lib/aiUsage";
import { callOpenRouterWithUsage } from "@/lib/openrouter";
import { buildExplainability } from "@/lib/ai/explainability";
import {
  computeMatrixBlend,
  isMissingCollectionError,
  listAssignments,
  listFeedback,
} from "@/lib/matrixReviews";
import { assertManagerCanAccessEmployee } from "@/lib/teamAccess";
import { buildAiUsageDelta } from "@/lib/ai/costEstimation";

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

    if (!cycleId || !notes) {
      return Response.json({ error: "cycleId and notes are required." }, { status: 400 });
    }

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
    });

    const messages = [
      {
        role: "system",
        content: "You are a check-in intelligence assistant. Return valid JSON only.",
      },
      {
        role: "user",
        content: `Analyze this check-in text for commitments, coaching quality, and tone guidance.\nGoal: ${goalTitle || "n/a"}\nNotes:\n${notes}\n\nMatrix reviewer context:\n${JSON.stringify(matrixBlend)}\n\nReturn JSON:\n{"summary":"...","commitments":[{"owner":"...","action":"...","dueDate":"optional"}],"coachingScore":{"score":1-10,"reasoning":["..."]},"toneGuidance":["..."],"revisedManagerFeedback":"..."}`,
      },
    ];

    const completion = await callOpenRouterWithUsage({
      messages,
      jsonMode: true,
      maxTokens: 700,
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

    return Response.json({
      data: {
        summary: String(parsed?.summary || "").trim() || "Check-in analyzed.",
        commitments,
        coachingScore: {
          score,
          reasoning: reasoning.length > 0 ? reasoning : ["Feedback has baseline clarity but can include more specific next steps."],
        },
        toneGuidance: toneGuidance.length > 0 ? toneGuidance : ["Use specific, actionable statements with neutral and constructive phrasing."],
        revisedManagerFeedback:
          String(parsed?.revisedManagerFeedback || "").trim() ||
          "Good progress so far. Please close the open blocker with a concrete owner and date before next check-in.",
        matrixBlend,
        explainability: buildExplainability({
          source: "openrouter_llm",
          confidence: score >= 8 ? "high" : score >= 5 ? "medium" : "low",
          whyFactors: [
            `Goal context: ${goalTitle || "general"}`,
            "Detected commitment-like statements and action ownership cues.",
            "Scored coaching quality using specificity, constructiveness, and actionability heuristics.",
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

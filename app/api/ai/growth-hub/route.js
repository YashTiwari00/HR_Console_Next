import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertAndTrackAiUsage, trackAiUsageCost } from "@/app/api/ai/_lib/aiUsage";
import { callOpenRouterWithUsage } from "@/lib/openrouter";
import { buildAiUsageDelta } from "@/lib/ai/costEstimation";
import { buildModeSystemSuffix, resolveAiMode } from "@/lib/ai/modes.js";

const MAX_GOALS = 12;
const MAX_CHECK_INS = 15;
const MAX_SELF_REVIEWS = 10;
const MAX_SCORE_HISTORY = 5;
const MAX_SKILLS = 5;

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeBandLabel(value) {
  const normalized = normalizeText(value).toUpperCase();
  if (normalized === "EE") return "EE";
  if (normalized === "DE") return "DE";
  if (normalized === "ME") return "ME";
  if (normalized === "SME") return "SME";
  if (normalized === "NI") return "NI";
  return null;
}

function toReadinessBand(value) {
  const normalized = normalizeText(value).toLowerCase().replace(/\s+/g, "_");

  if (!normalized) return null;
  if (normalized.includes("exceed")) return "Exceeding";
  if (normalized === "ready_now" || normalized === "ready") return "Ready";
  if (normalized === "ready_1_2_years" || normalized === "ready_in_1_2_years") return "Developing";
  if (normalized === "developing" || normalized === "medium") return "Developing";
  if (normalized === "emerging" || normalized === "early_stage" || normalized === "low") return "Early Stage";

  return null;
}

function normalizePriority(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "high") return "High";
  if (normalized === "low") return "Low";
  return "Medium";
}

function isMissingCollectionError(error, collectionId) {
  const message = String(error?.message || "").toLowerCase();
  const normalizedCollectionId = String(collectionId || "").trim().toLowerCase();

  return (
    message.includes("collection") &&
    message.includes("requested id") &&
    message.includes("could not be found") &&
    (!normalizedCollectionId || message.includes(normalizedCollectionId))
  );
}

async function listDocumentsSafe(databases, collectionId, queries) {
  try {
    const result = await databases.listDocuments(databaseId, collectionId, queries);
    return result.documents || [];
  } catch (error) {
    if (isMissingCollectionError(error, collectionId)) {
      return [];
    }
    throw error;
  }
}

function extractCheckInSignal(row) {
  const pieces = [
    normalizeText(row?.managerNotes),
    normalizeText(row?.employeeNotes),
    normalizeText(row?.transcriptText),
  ].filter(Boolean);

  if (pieces.length === 0) return null;
  const compact = pieces.join(" | ");
  return compact.length > 360 ? `${compact.slice(0, 360)}...` : compact;
}

function isVisibleScore(row) {
  const visibility = normalizeText(row?.visibility).toLowerCase();
  if (!visibility) return true;
  return visibility !== "hidden";
}

function buildFallbackResponse({ profile, readinessBand, lowRatedGoals }) {
  const role = normalizeText(profile?.role) || "employee";
  const department = normalizeText(profile?.department) || "your function";

  const primaryGaps = lowRatedGoals.length > 0
    ? lowRatedGoals.slice(0, 3)
    : ["Execution consistency", "Stakeholder communication", "Outcome planning"];

  return {
    careerPathway: {
      summary: `Based on your current ${role} role in ${department}, focus on demonstrating repeatable delivery and broader ownership for the next-level scope.`,
      nextRole: "Expanded-role contributor",
      actionPlan: [
        "Lead one cross-functional outcome with clear success metrics.",
        "Document measurable wins from check-ins and progress updates.",
        "Partner with your manager on a quarter-long growth plan.",
      ],
      timelineHint: "Target sustained progress across the next 1-2 cycles.",
    },
    skillsToDevelop: primaryGaps.map((item) => ({
      skill: item,
      why: "This area appears repeatedly in your recent performance signals.",
      recommendedLearning: [
        "A focused internal workshop",
        "A role-relevant online course",
      ],
      practicePlan: "Apply the learning to one active goal within 30 days.",
      priority: "Medium",
    })),
    readinessScore: {
      band: readinessBand || "Developing",
      rationale: "Readiness is based on recent goal and check-in signals.",
      focusAreas: [
        "Goal execution consistency",
        "Cross-team collaboration",
        "Evidence-based impact storytelling",
      ],
      source: readinessBand ? "talent_snapshot" : "fallback",
    },
  };
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee"]);

    const body = await request.json().catch(() => ({}));
    const requestedCycleId = normalizeText(body?.cycleId);
    const employeeId = normalizeText(profile?.$id);
    const mode = resolveAiMode(body?.mode ?? "suggestion", profile.role);

    const goalQueries = [
      Query.equal("employeeId", employeeId),
      Query.orderDesc("$createdAt"),
      Query.limit(MAX_GOALS),
    ];
    if (requestedCycleId) {
      goalQueries.splice(1, 0, Query.equal("cycleId", requestedCycleId));
    }

    const goals = await listDocumentsSafe(databases, appwriteConfig.goalsCollectionId, goalQueries);
    const cycleIdFromData = normalizeText(requestedCycleId || goals[0]?.cycleId);
    const cycleId = cycleIdFromData || "current";

    const checkIns = await listDocumentsSafe(
      databases,
      appwriteConfig.checkInsCollectionId,
      [
        Query.equal("employeeId", employeeId),
        Query.orderDesc("$createdAt"),
        Query.limit(MAX_CHECK_INS),
      ]
    );

    const selfReviewQueries = [
      Query.equal("employeeId", employeeId),
      Query.orderDesc("$createdAt"),
      Query.limit(MAX_SELF_REVIEWS),
    ];
    if (cycleIdFromData) {
      selfReviewQueries.splice(1, 0, Query.equal("cycleId", cycleIdFromData));
    }

    const selfReviews = await listDocumentsSafe(
      databases,
      appwriteConfig.goalSelfReviewsCollectionId,
      selfReviewQueries
    );

    const scoreQueries = [
      Query.equal("employeeId", employeeId),
      Query.orderDesc("computedAt"),
      Query.limit(MAX_SCORE_HISTORY),
    ];
    const scoreRows = await listDocumentsSafe(
      databases,
      appwriteConfig.employeeCycleScoresCollectionId,
      scoreQueries
    );

    const snapshotQueries = [
      Query.equal("employeeId", employeeId),
      Query.orderDesc("computedAt"),
      Query.limit(1),
    ];
    if (cycleIdFromData) {
      snapshotQueries.splice(1, 0, Query.equal("cycleId", cycleIdFromData));
    }

    const talentSnapshot = (
      await listDocumentsSafe(databases, appwriteConfig.talentSnapshotsCollectionId, snapshotQueries)
    )[0] || null;

    const visibleRatings = scoreRows
      .filter((row) => isVisibleScore(row))
      .map((row) => normalizeBandLabel(row?.scoreLabel))
      .filter(Boolean);

    const lowRatedGoals = goals
      .filter((goal) => goal?.ratingVisibleToEmployee === true)
      .map((goal) => ({
        title: normalizeText(goal?.title),
        ratingLabel: normalizeBandLabel(goal?.managerFinalRatingLabel),
        status: normalizeText(goal?.status),
      }))
      .filter((goal) => (goal.ratingLabel === "SME" || goal.ratingLabel === "NI") && goal.title);

    const checkInSignals = checkIns
      .map((row) => ({
        goalId: normalizeText(row?.goalId),
        status: normalizeText(row?.status),
        isFinalCheckIn: Boolean(row?.isFinalCheckIn),
        signal: extractCheckInSignal(row),
      }))
      .filter((row) => row.signal);

    const selfReviewSignals = selfReviews
      .map((row) => ({
        goalId: normalizeText(row?.goalId),
        selfRatingLabel: normalizeBandLabel(row?.selfRatingLabel),
        achievements: normalizeText(row?.achievements).slice(0, 220),
        challenges: normalizeText(row?.challenges).slice(0, 220),
        selfComment: normalizeText(row?.selfComment).slice(0, 220),
      }))
      .filter(
        (row) => row.achievements || row.challenges || row.selfComment || row.selfRatingLabel
      );

    const snapshotReadinessBand = toReadinessBand(talentSnapshot?.readinessBand);

    const usage = await assertAndTrackAiUsage({
      databases,
      userId: employeeId,
      cycleId,
      featureType: "growth_hub",
      userRole: profile.role,
      resolvedMode: mode,
    });

    const modeSuffix = buildModeSystemSuffix(mode, profile.role);
    const messages = [
      {
        role: "system",
        content: `You are an HR growth coach.
Return valid JSON only.
Never return numeric ratings, scores, percentages, stack ranks, or hidden final ratings.
Use only qualitative language and rating labels where needed.
${modeSuffix}`,
      },
      {
        role: "user",
        content: `Build an employee Growth Hub response using this context.

Employee profile:
${JSON.stringify({
          role: normalizeText(profile?.role),
          department: normalizeText(profile?.department),
        })}

Cycle context:
${JSON.stringify({
          cycleId: cycleIdFromData || null,
          ratingHistoryLabels: visibleRatings,
          lowRatedGoals,
          checkInSignals,
          selfReviewSignals,
          readinessBandFromTalentSnapshot: snapshotReadinessBand,
        })}

Return ONLY this JSON shape:
{
  "careerPathway": {
    "summary": "string",
    "nextRole": "string",
    "actionPlan": ["string"],
    "timelineHint": "string"
  },
  "skillsToDevelop": [
    {
      "skill": "string",
      "why": "string",
      "recommendedLearning": ["string"],
      "practicePlan": "string",
      "priority": "High|Medium|Low"
    }
  ],
  "readiness": {
    "band": "Early Stage|Developing|Ready|Exceeding",
    "rationale": "string",
    "focusAreas": ["string"]
  }
}`,
      },
    ];

    const completion = await callOpenRouterWithUsage({
      messages,
      jsonMode: true,
      maxTokens: mode === "decision_support" ? 2000 : 1000,
    });

    const parsed = JSON.parse(completion.content || "{}");
    const usageDelta = buildAiUsageDelta({
      providerUsage: completion.usage,
      messages,
      completionText: completion.content,
    });

    const trackedUsage = await trackAiUsageCost({
      databases,
      userId: employeeId,
      cycleId,
      featureType: "growth_hub",
      usage,
      tokensUsedDelta: usageDelta.tokensUsed,
      estimatedCostDelta: usageDelta.estimatedCost,
    });

    const aiCareer = parsed?.careerPathway || {};
    const aiSkills = Array.isArray(parsed?.skillsToDevelop) ? parsed.skillsToDevelop : [];
    const aiReadiness = parsed?.readiness || {};

    const fallback = buildFallbackResponse({
      profile,
      readinessBand: snapshotReadinessBand,
      lowRatedGoals: lowRatedGoals.map((item) => item.title),
    });

    const readinessBand = snapshotReadinessBand || toReadinessBand(aiReadiness?.band) || fallback.readinessScore.band;

    return Response.json({
      data: {
        cycleId: cycleIdFromData || null,
        careerPathway: {
          summary: normalizeText(aiCareer?.summary) || fallback.careerPathway.summary,
          nextRole: normalizeText(aiCareer?.nextRole) || fallback.careerPathway.nextRole,
          actionPlan: (Array.isArray(aiCareer?.actionPlan) ? aiCareer.actionPlan : fallback.careerPathway.actionPlan)
            .map((item) => normalizeText(item))
            .filter(Boolean)
            .slice(0, 5),
          timelineHint: normalizeText(aiCareer?.timelineHint) || fallback.careerPathway.timelineHint,
        },
        skillsToDevelop: (aiSkills.length > 0 ? aiSkills : fallback.skillsToDevelop)
          .map((item) => ({
            skill: normalizeText(item?.skill),
            why: normalizeText(item?.why),
            recommendedLearning: (Array.isArray(item?.recommendedLearning) ? item.recommendedLearning : [])
              .map((entry) => normalizeText(entry))
              .filter(Boolean)
              .slice(0, 4),
            practicePlan: normalizeText(item?.practicePlan),
            priority: normalizePriority(item?.priority),
          }))
          .filter((item) => item.skill && item.why)
          .slice(0, MAX_SKILLS),
        readinessScore: {
          band: readinessBand,
          rationale:
            normalizeText(snapshotReadinessBand ? "Readiness sourced from talent snapshot for this cycle." : aiReadiness?.rationale) ||
            fallback.readinessScore.rationale,
          focusAreas: (
            Array.isArray(aiReadiness?.focusAreas)
              ? aiReadiness.focusAreas
              : fallback.readinessScore.focusAreas
          )
            .map((item) => normalizeText(item))
            .filter(Boolean)
            .slice(0, 4),
          source: snapshotReadinessBand ? "talent_snapshot" : "ai",
        },
        usage: trackedUsage,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

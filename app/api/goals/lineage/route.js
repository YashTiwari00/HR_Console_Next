import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertManagerCanAccessEmployee, getManagerTeamEmployeeIds } from "@/lib/teamAccess";
import { getGoalLineage } from "@/lib/goals/getGoalLineage";

const MAX_QUERY_IDS = 100;

function forbiddenError(message = "Forbidden for this goal.") {
  const error = new Error(message);
  error.statusCode = 403;
  return error;
}

function toNumberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function clampPercent(value) {
  const numeric = toNumberOrNull(value);
  if (numeric === null) return null;
  return Math.max(0, Math.min(100, Number(numeric.toFixed(2))));
}

function resolveContributionBadge(value) {
  const contribution = clampPercent(value);
  if (contribution === null) return "Medium";
  if (contribution <= 33) return "Low";
  if (contribution <= 66) return "Medium";
  return "High";
}

function toPercentText(value) {
  const numeric = clampPercent(value);
  if (numeric === null) return "n/a";
  return `${numeric}%`;
}

function toChainNode(goal, fallbackAopReference = null) {
  const contributionPercent = clampPercent(goal?.contributionPercent);
  const progressPercent = clampPercent(goal?.progressPercent ?? goal?.processPercent);

  return {
    goalId: String(goal?.$id || "").trim(),
    title: String(goal?.title || "").trim(),
    owner: String(goal?.employeeId || goal?.managerId || "").trim() || null,
    contributionPercent,
    contributionBadge: resolveContributionBadge(contributionPercent),
    aopReference:
      String(goal?.aopReference || "").trim() || fallbackAopReference || null,
    goalLevel: String(goal?.goalLevel || "").trim() || null,
    status: String(goal?.status || "").trim() || null,
    progressPercent,
  };
}

async function assertGoalReadAccess(profile, databases, goal) {
  if (profile.role === "hr") return;

  const profileId = String(profile?.$id || "").trim();
  const employeeId = String(goal?.employeeId || "").trim();

  if (profile.role === "employee") {
    if (employeeId !== profileId) {
      throw forbiddenError();
    }
    return;
  }

  if (profile.role === "manager") {
    await assertManagerCanAccessEmployee(databases, profileId, employeeId);
    return;
  }

  throw forbiddenError();
}

function chunkIds(ids) {
  const chunks = [];
  for (let index = 0; index < ids.length; index += MAX_QUERY_IDS) {
    chunks.push(ids.slice(index, index + MAX_QUERY_IDS));
  }
  return chunks;
}

async function listGoalsForEmployeeIds(databases, cycleId, employeeIds) {
  const uniqueEmployeeIds = Array.from(new Set(employeeIds.filter(Boolean)));
  if (uniqueEmployeeIds.length === 0) {
    return [];
  }

  const chunks = chunkIds(uniqueEmployeeIds);
  const results = await Promise.all(
    chunks.map((chunk) =>
      databases.listDocuments(databaseId, appwriteConfig.goalsCollectionId, [
        Query.equal("cycleId", cycleId),
        Query.equal("employeeId", chunk),
        Query.limit(500),
      ])
    )
  );

  const merged = [];
  const seen = new Set();

  for (const result of results) {
    for (const doc of result.documents || []) {
      if (!seen.has(doc.$id)) {
        seen.add(doc.$id);
        merged.push(doc);
      }
    }
  }

  return merged;
}

function calculateEffectiveContributionPercent(chain) {
  if (!Array.isArray(chain) || chain.length === 0) return null;

  const contributingLevels = chain.length > 1 ? chain.slice(0, -1) : chain;

  const ratio = contributingLevels.reduce((accumulator, goal) => {
    const contribution = clampPercent(goal?.contributionPercent);
    if (contribution === null) return accumulator;
    return accumulator * (contribution / 100);
  }, 1);

  return Number((ratio * 100).toFixed(2));
}

function buildContributionExplanation(lineage, effectiveContributionPercent, businessMovementPercent) {
  const currentGoalTitle = String(lineage?.currentGoal?.title || "this goal").trim() || "this goal";
  const managerGoalTitle = String(lineage?.parentGoal?.title || "the team objective").trim() || "the team objective";
  const businessObjectiveTitle =
    String(lineage?.aopReference || lineage?.rootGoal?.title || "the business objective").trim() ||
    "the business objective";

  const contributionText = toPercentText(effectiveContributionPercent);
  const movementText = toPercentText(businessMovementPercent);

  return `${currentGoalTitle} supports ${managerGoalTitle}, which ladders into ${businessObjectiveTitle}. Current expected influence on the business objective is ${contributionText}, with about ${movementText} in active movement based on current progress.`;
}

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "hr"]);

    const { searchParams } = new URL(request.url);
    const goalId = String(searchParams.get("goalId") || "").trim();

    if (!goalId) {
      return Response.json({ error: "goalId is required." }, { status: 400 });
    }

    const currentGoalDoc = await databases.getDocument(
      databaseId,
      appwriteConfig.goalsCollectionId,
      goalId
    );

    await assertGoalReadAccess(profile, databases, currentGoalDoc);

    const cycleId = String(currentGoalDoc.cycleId || "").trim();
    let scopedGoals = [];

    if (profile.role === "employee") {
      scopedGoals = await listGoalsForEmployeeIds(databases, cycleId, [String(profile.$id || "").trim()]);
    } else if (profile.role === "manager") {
      const teamEmployeeIds = await getManagerTeamEmployeeIds(databases, String(profile.$id || "").trim(), {
        includeFallback: true,
      });
      const managerScopedIds = Array.from(
        new Set([String(profile.$id || "").trim(), ...teamEmployeeIds].filter(Boolean))
      );

      scopedGoals = await listGoalsForEmployeeIds(databases, cycleId, managerScopedIds);
    } else {
      const result = await databases.listDocuments(databaseId, appwriteConfig.goalsCollectionId, [
        Query.equal("cycleId", cycleId),
        Query.limit(500),
      ]);
      scopedGoals = result.documents || [];
    }

    const goalsById = new Map();
    for (const goal of scopedGoals) {
      const id = String(goal?.$id || "").trim();
      if (!id) continue;
      goalsById.set(id, goal);
    }

    if (!goalsById.has(goalId)) {
      goalsById.set(goalId, currentGoalDoc);
    }

    const lineage = await getGoalLineage(goalId, {
      goalsById,
      getGoalById: async (requestedGoalId) => {
        const normalizedId = String(requestedGoalId || "").trim();
        if (!normalizedId) return null;

        if (goalsById.has(normalizedId)) {
          return goalsById.get(normalizedId);
        }

        try {
          const fallbackGoal = await databases.getDocument(
            databaseId,
            appwriteConfig.goalsCollectionId,
            normalizedId
          );

          await assertGoalReadAccess(profile, databases, fallbackGoal);

          return fallbackGoal;
        } catch {
          return null;
        }
      },
    });

    if (!lineage.currentGoal) {
      return Response.json({ error: "Goal not found." }, { status: 404 });
    }

    const effectiveContributionPercent = calculateEffectiveContributionPercent(lineage.chain);
    const currentProgressPercent = clampPercent(
      lineage.currentGoal?.progressPercent ?? lineage.currentGoal?.processPercent
    );
    const businessMovementPercent =
      currentProgressPercent === null || effectiveContributionPercent === null
        ? null
        : Number(((currentProgressPercent * effectiveContributionPercent) / 100).toFixed(2));

    const chain = lineage.chain.map((goal) => toChainNode(goal, lineage.aopReference));

    return Response.json({
      data: {
        currentGoal: lineage.currentGoal,
        parentGoal: lineage.parentGoal,
        rootGoal: lineage.rootGoal,
        aopReference: lineage.aopReference,
        chain,
        businessImpact: {
          contributionToBusinessPercent: effectiveContributionPercent,
          movementToBusinessPercent: businessMovementPercent,
          currentGoalProgressPercent: currentProgressPercent,
          contributionBadge: resolveContributionBadge(effectiveContributionPercent),
          explanation: buildContributionExplanation(
            lineage,
            effectiveContributionPercent,
            businessMovementPercent
          ),
        },
      },
      meta: {
        goalId,
        chainDepth: lineage.chain.length,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

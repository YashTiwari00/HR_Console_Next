import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertManagerCanAccessEmployee } from "@/lib/teamAccess";

const MAX_DEPTH = 4;
const MAX_CYCLE_GOALS = 500;

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toProgress(value) {
  return Math.max(0, Math.min(100, toNumber(value, 0)));
}

function toWeightage(value) {
  return Math.max(0, toNumber(value, 0));
}

function toContributionBadge(percent) {
  if (percent >= 30) return "High";
  if (percent >= 15) return "Medium";
  return "Low";
}

function round1(value) {
  return Number(toNumber(value, 0).toFixed(1));
}

function normalizeOwnerRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "manager") return "manager";
  if (normalized === "leadership") return "leadership";
  return "employee";
}

function isForbidden(error) {
  return Number(error?.statusCode) === 403;
}

function isNotFound(error) {
  const message = String(error?.message || "").toLowerCase();
  return Number(error?.statusCode) === 404 || message.includes("document with the requested id could not be found");
}

function isUnknownAttributeError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("unknown attribute") || message.includes("attribute") && message.includes("not found");
}

function buildSafeGoalNode(goal) {
  return {
    $id: String(goal?.$id || "").trim(),
    title: String(goal?.title || "").trim(),
    description: String(goal?.description || "").trim(),
    weightage: toWeightage(goal?.weightage),
    progressPercent: toProgress(goal?.progressPercent ?? goal?.processPercent),
    employeeId: String(goal?.employeeId || "").trim(),
    managerId: String(goal?.managerId || "").trim(),
    status: String(goal?.status || "").trim(),
    cycleId: String(goal?.cycleId || "").trim(),
    lineageRef: String(goal?.lineageRef || "").trim(),
  };
}

async function getGoalDocumentSafe(databases, goalId) {
  try {
    const goal = await databases.getDocument(databaseId, appwriteConfig.goalsCollectionId, goalId);
    return buildSafeGoalNode(goal);
  } catch (error) {
    if (isUnknownAttributeError(error)) {
      try {
        const fallback = await databases.getDocument(databaseId, appwriteConfig.goalsCollectionId, goalId);
        return buildSafeGoalNode(fallback);
      } catch (fallbackError) {
        throw fallbackError;
      }
    }
    throw error;
  }
}

async function listCycleGoalsSafe(databases, cycleId) {
  if (!cycleId) return [];

  try {
    const result = await databases.listDocuments(databaseId, appwriteConfig.goalsCollectionId, [
      Query.equal("cycleId", cycleId),
      Query.limit(MAX_CYCLE_GOALS),
    ]);

    return (result.documents || []).map((item) => buildSafeGoalNode(item));
  } catch (error) {
    if (isUnknownAttributeError(error)) {
      return [];
    }
    throw error;
  }
}

async function getOwnerProfileSafe(databases, ownerId, ownerCache) {
  const normalizedId = String(ownerId || "").trim();
  if (!normalizedId) {
    return {
      ownerName: "Unknown",
      ownerRole: "employee",
    };
  }

  if (ownerCache.has(normalizedId)) {
    return ownerCache.get(normalizedId);
  }

  try {
    const user = await databases.getDocument(databaseId, appwriteConfig.usersCollectionId, normalizedId);
    const value = {
      ownerName: String(user?.name || user?.email || "Unknown").trim() || "Unknown",
      ownerRole: normalizeOwnerRole(user?.role),
    };
    ownerCache.set(normalizedId, value);
    return value;
  } catch (error) {
    if (isUnknownAttributeError(error) || isNotFound(error)) {
      const fallback = { ownerName: "Unknown", ownerRole: "employee" };
      ownerCache.set(normalizedId, fallback);
      return fallback;
    }
    throw error;
  }
}

async function assertGoalReadAccess(profile, databases, goal) {
  const role = String(profile?.role || "").trim().toLowerCase();
  const profileId = String(profile?.$id || "").trim();
  const employeeId = String(goal?.employeeId || "").trim();
  const managerId = String(goal?.managerId || "").trim();

  if (role === "hr" || role === "leadership") {
    return;
  }

  if (role === "employee") {
    if (employeeId !== profileId) {
      const error = new Error("Forbidden for this goal.");
      error.statusCode = 403;
      throw error;
    }
    return;
  }

  if (role === "manager") {
    if (employeeId === profileId) return;

    if (managerId === profileId) {
      await assertManagerCanAccessEmployee(databases, profileId, employeeId);
      return;
    }

    const error = new Error("Forbidden for this goal.");
    error.statusCode = 403;
    throw error;
  }

  const error = new Error("Forbidden for this goal.");
  error.statusCode = 403;
  throw error;
}

function buildChildMap(cycleGoals) {
  const childrenByParent = new Map();

  for (const goal of cycleGoals) {
    const parentId = String(goal?.lineageRef || "").trim();
    if (!parentId) continue;

    const list = childrenByParent.get(parentId) || [];
    list.push(goal);
    childrenByParent.set(parentId, list);
  }

  return childrenByParent;
}

function collectLeafNodes(startGoalId, childrenByParent, visited = new Set()) {
  if (!startGoalId || visited.has(startGoalId)) return [];
  visited.add(startGoalId);

  const children = childrenByParent.get(startGoalId) || [];
  if (children.length === 0) {
    return [startGoalId];
  }

  const leaves = [];
  for (const child of children) {
    const childId = String(child?.$id || "").trim();
    if (!childId) continue;
    leaves.push(...collectLeafNodes(childId, childrenByParent, visited));
  }

  return leaves;
}

function calculateChainProgressPercent(nodeGoalId, goalsById, childrenByParent) {
  const leafIds = collectLeafNodes(nodeGoalId, childrenByParent);
  if (leafIds.length === 0) {
    return round1(0);
  }

  const leafGoals = leafIds
    .map((id) => goalsById.get(id))
    .filter(Boolean);

  if (leafGoals.length === 0) {
    return round1(0);
  }

  const weighted = leafGoals.reduce(
    (acc, leaf) => {
      const weight = toWeightage(leaf?.weightage);
      const progress = toProgress(leaf?.progressPercent);

      acc.totalWeight += weight;
      acc.weightedProgress += progress * weight;
      acc.plainProgressSum += progress;
      return acc;
    },
    { totalWeight: 0, weightedProgress: 0, plainProgressSum: 0 }
  );

  if (weighted.totalWeight > 0) {
    return round1(weighted.weightedProgress / weighted.totalWeight);
  }

  return round1(weighted.plainProgressSum / leafGoals.length);
}

function buildPlainEnglishSummary(lineage) {
  if (!Array.isArray(lineage) || lineage.length <= 1) {
    const title = String(lineage?.[0]?.title || "").trim() || "Untitled goal";
    return `Your goal '${title}' is a standalone goal for this cycle.`;
  }

  const leaf = lineage[0];
  const parent = lineage[1];
  const top = lineage[lineage.length - 1] || parent;

  const leafTitle = String(leaf?.title || "").trim() || "Untitled goal";
  const parentOwnerName = String(parent?.ownerName || "their manager").trim() || "their manager";
  const parentTitle = String(parent?.title || "parent goal").trim() || "parent goal";
  const topTitle = String(top?.title || "top-level target").trim() || "top-level target";
  const contributionPercent = round1(toNumber(leaf?.contributionPercent, 100));

  return `Your goal '${leafTitle}' contributes ${contributionPercent}% to ${parentOwnerName}'s target '${parentTitle}', which is part of the ${topTitle}.`;
}

/**
 * GET /api/goals/[goalId]/lineage
 * Builds an upward lineageRef chain (max 4 levels) with contribution metadata and deterministic summary.
 */
export async function GET(request, context) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "hr", "leadership"]);

    const params = await context.params;
    const goalId = String(params?.goalId || "").trim();

    if (!goalId) {
      return Response.json({ error: "goalId is required." }, { status: 400 });
    }

    let currentGoal;
    try {
      currentGoal = await getGoalDocumentSafe(databases, goalId);
    } catch (error) {
      if (isNotFound(error)) {
        return Response.json({ error: "Goal not found." }, { status: 404 });
      }
      throw error;
    }

    try {
      await assertGoalReadAccess(profile, databases, currentGoal);
    } catch (error) {
      if (isForbidden(error)) {
        return Response.json({ error: "Forbidden for this goal." }, { status: 403 });
      }
      throw error;
    }

    const chainGoals = [currentGoal];
    const seen = new Set([currentGoal.$id]);

    while (chainGoals.length < MAX_DEPTH) {
      const cursor = chainGoals[chainGoals.length - 1];
      const parentId = String(cursor?.lineageRef || "").trim();
      if (!parentId || seen.has(parentId)) break;

      try {
        const parentGoal = await getGoalDocumentSafe(databases, parentId);
        await assertGoalReadAccess(profile, databases, parentGoal);

        chainGoals.push(parentGoal);
        seen.add(parentGoal.$id);
      } catch (error) {
        console.error(`[goals.lineage] truncating chain at ${parentId}:`, error?.message || error);
        break;
      }
    }

    const cycleId = String(currentGoal?.cycleId || "").trim();
    let cycleGoals = [];
    try {
      cycleGoals = await listCycleGoalsSafe(databases, cycleId);
    } catch (error) {
      console.error("[goals.lineage] unable to load cycle goals for chain progress:", error?.message || error);
      cycleGoals = [];
    }

    const goalsById = new Map();
    for (const goal of cycleGoals) {
      if (goal?.$id) goalsById.set(goal.$id, goal);
    }
    for (const goal of chainGoals) {
      if (goal?.$id) goalsById.set(goal.$id, goal);
    }

    const childrenByParent = buildChildMap(cycleGoals);
    const ownerCache = new Map();

    const lineage = [];
    for (let level = 0; level < chainGoals.length; level += 1) {
      const goal = chainGoals[level];
      const parent = chainGoals[level + 1] || null;

      const parentWeightage = toWeightage(parent?.weightage);
      const thisWeightage = toWeightage(goal?.weightage);
      const contributionPercent = parent
        ? parentWeightage > 0
          ? round1((thisWeightage / parentWeightage) * 100)
          : 0
        : 100;

      const owner = await getOwnerProfileSafe(databases, goal?.employeeId, ownerCache);

      lineage.push({
        level,
        goalId: String(goal?.$id || "").trim(),
        title: String(goal?.title || "").trim(),
        ownerName: owner.ownerName,
        weightage: thisWeightage,
        progressPercent: round1(toProgress(goal?.progressPercent)),
        contributionPercent,
        contributionBadge: toContributionBadge(contributionPercent),
      });
    }

    const topNode = lineage[lineage.length - 1] || null;
    const leafNode = lineage[0] || null;

    const overallContributionPercent = topNode
      ? toWeightage(topNode.weightage) > 0
        ? round1((toWeightage(leafNode?.weightage) / toWeightage(topNode.weightage)) * 100)
        : toNumber(leafNode?.contributionPercent, 100)
      : 100;

    return Response.json({
      goalId,
      lineage,
      plainEnglishSummary: buildPlainEnglishSummary(lineage),
      overallContributionBadge: toContributionBadge(overallContributionPercent),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

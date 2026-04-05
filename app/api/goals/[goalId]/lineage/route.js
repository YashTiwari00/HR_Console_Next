import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";

function canReadGoal(profile, goal) {
  if (profile.role === "hr") return true;
  if (profile.role === "employee") {
    return String(goal?.employeeId || "").trim() === String(profile?.$id || "").trim();
  }

  if (profile.role === "manager") {
    const profileId = String(profile?.$id || "").trim();
    return (
      String(goal?.managerId || "").trim() === profileId ||
      String(goal?.employeeId || "").trim() === profileId
    );
  }

  return false;
}

function toNode(goal) {
  return {
    ...goal,
    children: [],
  };
}

function buildAncestors(currentGoal, goalsById) {
  const ancestors = [];
  const visited = new Set();

  let cursorParentId = String(currentGoal?.parentGoalId || "").trim();

  while (cursorParentId && !visited.has(cursorParentId)) {
    visited.add(cursorParentId);

    const parent = goalsById.get(cursorParentId);
    if (!parent) break;

    ancestors.push(parent);
    cursorParentId = String(parent?.parentGoalId || "").trim();
  }

  return ancestors.reverse();
}

function buildDescendantForest(currentGoalId, goalsById) {
  const childIdsByParent = new Map();

  for (const [goalId, goal] of goalsById.entries()) {
    const parentId = String(goal?.parentGoalId || "").trim();
    if (!parentId) continue;

    const list = childIdsByParent.get(parentId) || [];
    list.push(goalId);
    childIdsByParent.set(parentId, list);
  }

  const visited = new Set();

  function expand(goalId) {
    if (visited.has(goalId)) return null;
    visited.add(goalId);

    const node = goalsById.get(goalId);
    if (!node) return null;

    const childIds = childIdsByParent.get(goalId) || [];
    node.children = childIds
      .map((childId) => expand(childId))
      .filter(Boolean)
      .sort((a, b) => {
        const aTime = new Date(a.$createdAt || 0).valueOf();
        const bTime = new Date(b.$createdAt || 0).valueOf();
        return aTime - bTime;
      });

    return node;
  }

  const directChildIds = childIdsByParent.get(currentGoalId) || [];

  return directChildIds
    .map((childId) => expand(childId))
    .filter(Boolean)
    .sort((a, b) => {
      const aTime = new Date(a.$createdAt || 0).valueOf();
      const bTime = new Date(b.$createdAt || 0).valueOf();
      return aTime - bTime;
    });
}

export async function GET(request, context) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "hr"]);

    const params = await context.params;
    const goalId = String(params.goalId || "").trim();

    if (!goalId) {
      return Response.json({ error: "goalId is required." }, { status: 400 });
    }

    const currentGoalDoc = await databases.getDocument(
      databaseId,
      appwriteConfig.goalsCollectionId,
      goalId
    );

    if (!canReadGoal(profile, currentGoalDoc)) {
      return Response.json({ error: "Forbidden for this goal." }, { status: 403 });
    }

    const queries = [
      Query.equal("cycleId", String(currentGoalDoc.cycleId || "").trim()),
      Query.limit(500),
    ];

    if (profile.role === "employee") {
      queries.unshift(Query.equal("employeeId", String(profile.$id || "").trim()));
    } else if (profile.role === "manager") {
      queries.unshift(Query.equal("managerId", String(currentGoalDoc.managerId || "").trim()));
    }

    // Single scoped query to avoid recursive N+1 goal fetches.
    const result = await databases.listDocuments(
      databaseId,
      appwriteConfig.goalsCollectionId,
      queries
    );

    const goalsById = new Map();
    for (const goal of result.documents || []) {
      const id = String(goal?.$id || "").trim();
      if (!id) continue;
      goalsById.set(id, toNode(goal));
    }

    if (!goalsById.has(goalId)) {
      goalsById.set(goalId, toNode(currentGoalDoc));
    }

    const currentGoal = goalsById.get(goalId);
    const ancestors = buildAncestors(currentGoal, goalsById);
    const descendants = buildDescendantForest(goalId, goalsById);

    return Response.json({
      data: {
        ancestors,
        currentGoal,
        descendants,
      },
      meta: {
        goalId,
        ancestorCount: ancestors.length,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

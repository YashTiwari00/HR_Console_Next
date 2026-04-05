import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { isGoalChildOfParent } from "@/app/api/goals/_lib/cascade";

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

function normalizeGoalNode(goal) {
  return {
    ...goal,
    children: [],
  };
}

function buildGoalTree(rootGoal, scopedGoals) {
  const nodesById = new Map();

  for (const goal of scopedGoals) {
    const id = String(goal?.$id || "").trim();
    if (!id) continue;
    nodesById.set(id, normalizeGoalNode(goal));
  }

  const rootId = String(rootGoal?.$id || "").trim();
  if (!nodesById.has(rootId)) {
    nodesById.set(rootId, normalizeGoalNode(rootGoal));
  }

  const childrenByParent = new Map();
  for (const node of nodesById.values()) {
    const parentId = String(node?.parentGoalId || "").trim();
    if (!parentId) continue;

    const list = childrenByParent.get(parentId) || [];
    list.push(node.$id);
    childrenByParent.set(parentId, list);
  }

  // Compatibility fallback: if legacy rows don't have parentGoalId but lineage indicates
  // they descend from root, attach them under root.
  for (const node of nodesById.values()) {
    const id = String(node?.$id || "").trim();
    if (!id || id === rootId) continue;

    const hasParent = String(node?.parentGoalId || "").trim();
    if (hasParent) continue;

    if (isGoalChildOfParent(node, rootId)) {
      const rootChildren = childrenByParent.get(rootId) || [];
      if (!rootChildren.includes(id)) {
        rootChildren.push(id);
        childrenByParent.set(rootId, rootChildren);
      }
    }
  }

  const visited = new Set();

  function attachChildren(nodeId) {
    if (visited.has(nodeId)) {
      return nodesById.get(nodeId) || null;
    }

    visited.add(nodeId);

    const node = nodesById.get(nodeId);
    if (!node) return null;

    const childIds = childrenByParent.get(nodeId) || [];
    node.children = childIds
      .map((childId) => attachChildren(childId))
      .filter(Boolean)
      .sort((a, b) => {
        const aTime = new Date(a.$createdAt || 0).valueOf();
        const bTime = new Date(b.$createdAt || 0).valueOf();
        return aTime - bTime;
      });

    return node;
  }

  return attachChildren(rootId);
}

function countDescendants(node) {
  if (!node || !Array.isArray(node.children) || node.children.length === 0) {
    return 0;
  }

  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
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

    const parentGoal = await databases.getDocument(
      databaseId,
      appwriteConfig.goalsCollectionId,
      goalId
    );

    if (!canReadGoal(profile, parentGoal)) {
      return Response.json({ error: "Forbidden for this goal." }, { status: 403 });
    }

    const queries = [
      Query.equal("cycleId", String(parentGoal.cycleId || "").trim()),
      Query.limit(500),
    ];

    if (profile.role === "employee") {
      queries.unshift(Query.equal("employeeId", String(profile.$id || "").trim()));
    } else if (profile.role === "manager") {
      queries.unshift(Query.equal("managerId", String(parentGoal.managerId || "").trim()));
    }

    // Single list query to avoid recursive N+1 DB access.
    const result = await databases.listDocuments(
      databaseId,
      appwriteConfig.goalsCollectionId,
      queries
    );

    const scopedGoals = result.documents || [];
    const tree = buildGoalTree(parentGoal, scopedGoals);

    return Response.json({
      data: tree,
      meta: {
        goalId,
        descendants: countDescendants(tree),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

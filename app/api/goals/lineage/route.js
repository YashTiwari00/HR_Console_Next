import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { getGoalLineage } from "@/lib/goals/getGoalLineage";

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

function toChainNode(goal, fallbackAopReference = null) {
  return {
    goalId: String(goal?.$id || "").trim(),
    title: String(goal?.title || "").trim(),
    owner: String(goal?.employeeId || goal?.managerId || "").trim() || null,
    contributionPercent:
      typeof goal?.contributionPercent === "number" ? goal.contributionPercent : null,
    aopReference:
      String(goal?.aopReference || "").trim() || fallbackAopReference || null,
    goalLevel: String(goal?.goalLevel || "").trim() || null,
    status: String(goal?.status || "").trim() || null,
  };
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

    const scopedGoals = await databases.listDocuments(
      databaseId,
      appwriteConfig.goalsCollectionId,
      queries
    );

    const goalsById = new Map();
    for (const goal of scopedGoals.documents || []) {
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

          if (!canReadGoal(profile, fallbackGoal)) {
            return null;
          }

          return fallbackGoal;
        } catch {
          return null;
        }
      },
    });

    if (!lineage.currentGoal) {
      return Response.json({ error: "Goal not found." }, { status: 404 });
    }

    return Response.json({
      data: {
        currentGoal: lineage.currentGoal,
        parentGoal: lineage.parentGoal,
        rootGoal: lineage.rootGoal,
        aopReference: lineage.aopReference,
        chain: lineage.chain.map((goal) => toChainNode(goal, lineage.aopReference)),
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

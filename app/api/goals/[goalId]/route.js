import { appwriteConfig } from "@/lib/appwrite";
import { GOAL_LEVELS, GOAL_STATUSES } from "@/lib/appwriteSchema";
import { Query, databaseId } from "@/lib/appwriteServer";
import { assertFrameworkAllowed, getFrameworkPolicy } from "@/lib/frameworkPolicies";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertManagerCanAccessEmployee } from "@/lib/teamAccess";

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function normalizeGoalLevel(value, fallback = GOAL_LEVELS.EMPLOYEE) {
  const normalized = String(value || "").trim().toLowerCase();
  const allowed = new Set(Object.values(GOAL_LEVELS));
  return allowed.has(normalized) ? normalized : fallback;
}

export async function GET(request, context) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "hr"]);

    const params = await context.params;
    const goalId = params.goalId;
    const goal = await databases.getDocument(
      databaseId,
      appwriteConfig.goalsCollectionId,
      goalId
    );

    if (profile.role === "employee" && goal.employeeId !== profile.$id) {
      return Response.json({ error: "Forbidden for this goal." }, { status: 403 });
    }

    if (profile.role === "manager" && goal.managerId !== profile.$id) {
      return Response.json({ error: "Forbidden for this goal." }, { status: 403 });
    }

    return Response.json({ data: goal });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request, context) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager"]);

    const params = await context.params;
    const goalId = params.goalId;
    const goal = await databases.getDocument(
      databaseId,
      appwriteConfig.goalsCollectionId,
      goalId
    );

    const isEmployeeOwner = goal.employeeId === profile.$id;
    const isManagerEditor = profile.role === "manager" && goal.managerId === profile.$id;

    if (!isEmployeeOwner && !isManagerEditor) {
      return Response.json({ error: "Forbidden for this goal." }, { status: 403 });
    }

    if (isManagerEditor) {
      await assertManagerCanAccessEmployee(databases, profile.$id, goal.employeeId);
    }

    if (goal.status !== GOAL_STATUSES.DRAFT && goal.status !== GOAL_STATUSES.NEEDS_CHANGES) {
      return Response.json(
        { error: "Only draft or needs_changes goals can be edited." },
        { status: 400 }
      );
    }

    const body = await request.json();

    const title = (body.title || goal.title || "").trim();
    const description = (body.description || goal.description || "").trim();
    const cycleId = (body.cycleId || goal.cycleId || "").trim();
    const frameworkTypeInput = (body.frameworkType || goal.frameworkType || "").trim();
    const managerId = isManagerEditor
      ? String(goal.managerId || "").trim()
      : (body.managerId || goal.managerId || profile.managerId || "").trim();
    const dueDate = body.dueDate ?? goal.dueDate ?? null;
    const lineageRef = body.lineageRef ?? goal.lineageRef ?? "";
    const aiSuggested =
      typeof body.aiSuggested === "boolean" ? body.aiSuggested : Boolean(goal.aiSuggested);
    const weightage = toInt(body.weightage ?? goal.weightage, 0);
    const parentGoalId = String(body.parentGoalId ?? goal.parentGoalId ?? "").trim() || null;
    const goalLevelInput = typeof body.goalLevel !== "undefined" ? body.goalLevel : goal.goalLevel;
    const goalLevel = normalizeGoalLevel(goalLevelInput);
    const contributionPercent = toInt(body.contributionPercent ?? goal.contributionPercent, 100);

    if (!title || !description || !cycleId || !frameworkTypeInput || !managerId) {
      return Response.json(
        { error: "title, description, cycleId, frameworkType and managerId are required." },
        { status: 400 }
      );
    }

    const frameworkPolicy = await getFrameworkPolicy(databases);
    const frameworkType = assertFrameworkAllowed(frameworkTypeInput, frameworkPolicy);

    if (weightage < 1 || weightage > 100) {
      return Response.json({ error: "weightage must be between 1 and 100." }, { status: 400 });
    }

    if (typeof goalLevelInput !== "undefined" && !normalizeGoalLevel(goalLevelInput, "")) {
      return Response.json(
        { error: "goalLevel must be one of: business, manager, employee." },
        { status: 400 }
      );
    }

    if (contributionPercent < 0 || contributionPercent > 100) {
      return Response.json(
        { error: "contributionPercent must be between 0 and 100." },
        { status: 400 }
      );
    }

    const existingGoals = await databases.listDocuments(
      databaseId,
      appwriteConfig.goalsCollectionId,
      [
        Query.equal("employeeId", goal.employeeId),
        Query.equal("cycleId", cycleId),
        Query.limit(200),
      ]
    );

    const otherWeightage = existingGoals.documents
      .filter((item) => item.$id !== goalId)
      .reduce((sum, item) => sum + (Number(item.weightage) || 0), 0);

    if (otherWeightage + weightage > 100) {
      return Response.json(
        {
          error:
            "Total goal weightage for this cycle cannot exceed 100. Reduce weightage or edit existing goals.",
        },
        { status: 400 }
      );
    }

    const updated = await databases.updateDocument(
      databaseId,
      appwriteConfig.goalsCollectionId,
      goalId,
      {
        title,
        description,
        cycleId,
        frameworkType,
        managerId,
        parentGoalId,
        goalLevel,
        contributionPercent,
        dueDate,
        lineageRef,
        aiSuggested,
        weightage,
      }
    );

    return Response.json({ data: updated });
  } catch (error) {
    return errorResponse(error);
  }
}

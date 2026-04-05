import { appwriteConfig } from "@/lib/appwrite";
import { GOAL_LEVELS } from "@/lib/appwriteSchema";
import { Query, databaseId } from "@/lib/appwriteServer";
import { normalizeCycleId } from "@/lib/cycle";
import { assertFrameworkAllowed, getFrameworkPolicy } from "@/lib/frameworkPolicies";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertManagerCanAccessEmployee } from "@/lib/teamAccess";
import {
  buildCascadeLineage,
  buildCascadePayload,
  createGoalDocumentCompat,
} from "@/app/api/goals/_lib/cascade";

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function normalizeGoalLevel(value, fallback = GOAL_LEVELS.EMPLOYEE) {
  const normalized = String(value || "").trim().toLowerCase();
  const allowed = new Set(Object.values(GOAL_LEVELS));
  return allowed.has(normalized) ? normalized : fallback;
}

function nextGoalLevel(parentGoalLevel) {
  const normalized = normalizeGoalLevel(parentGoalLevel, GOAL_LEVELS.BUSINESS);
  if (normalized === GOAL_LEVELS.BUSINESS) return GOAL_LEVELS.MANAGER;
  if (normalized === GOAL_LEVELS.MANAGER) return GOAL_LEVELS.EMPLOYEE;
  return GOAL_LEVELS.EMPLOYEE;
}

function canReadGoal(profile, goal) {
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

export async function POST(request, context) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager"]);

    const params = await context.params;
    const parentGoalId = String(params.goalId || "").trim();

    if (!parentGoalId) {
      return Response.json({ error: "goalId is required." }, { status: 400 });
    }

    const parentGoal = await databases.getDocument(
      databaseId,
      appwriteConfig.goalsCollectionId,
      parentGoalId
    );

    if (!canReadGoal(profile, parentGoal)) {
      return Response.json({ error: "Forbidden for this goal." }, { status: 403 });
    }

    const body = await request.json();
    const title = String(body.title || "").trim();
    const description = String(body.description || "").trim();
    const cycleId = normalizeCycleId(String(body.cycleId || parentGoal.cycleId || "").trim());
    const frameworkTypeInput = String(body.frameworkType || parentGoal.frameworkType || "").trim();
    const weightage = toInt(body.weightage, 0);
    const dueDate = body.dueDate ?? parentGoal.dueDate ?? null;
    const lineageRef = buildCascadeLineage(parentGoal, body.lineageRef);
    const goalLevelInput = typeof body.goalLevel !== "undefined" ? body.goalLevel : parentGoal.goalLevel;
    const goalLevel = normalizeGoalLevel(goalLevelInput, nextGoalLevel(parentGoal.goalLevel));
    const contributionPercent = toInt(body.contributionPercent, Number(parentGoal.contributionPercent || 100));

    const requestedEmployeeId = String(body.employeeId || "").trim();
    let employeeId = profile.role === "employee"
      ? String(profile.$id || "").trim()
      : requestedEmployeeId || String(parentGoal.employeeId || "").trim();

    if (profile.role === "manager") {
      await assertManagerCanAccessEmployee(databases, profile.$id, employeeId);
    }

    const managerId = profile.role === "manager"
      ? String(profile.$id || "").trim()
      : String(parentGoal.managerId || profile.managerId || "").trim();

    if (!title || !description || !employeeId || !managerId || !cycleId || !frameworkTypeInput) {
      return Response.json(
        { error: "title, description, employeeId, managerId, cycleId and frameworkType are required." },
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
        Query.equal("employeeId", employeeId),
        Query.equal("cycleId", cycleId),
        Query.limit(200),
      ]
    );

    const currentWeightage = existingGoals.documents.reduce(
      (sum, item) => sum + (Number(item.weightage) || 0),
      0
    );

    if (currentWeightage + weightage > 100) {
      return Response.json(
        {
          error:
            "Total goal weightage for this cycle cannot exceed 100. Reduce weightage or edit existing goals.",
        },
        { status: 400 }
      );
    }

    const goalPayload = buildCascadePayload({
      parentGoal,
      title,
      description,
      cycleId,
      frameworkType,
      managerId,
      employeeId,
      weightage,
      dueDate,
      aiSuggested: body.aiSuggested ?? true,
      lineageRef,
      optionalFields: {
        parentGoalId,
        cascadeSourceGoalId: parentGoalId,
        goalLevel,
        contributionPercent,
        goalConversationId: body.goalConversationId,
        conversationId: body.conversationId,
      },
    });

    const created = await createGoalDocumentCompat(databases, goalPayload);

    return Response.json(
      {
        data: created,
        meta: {
          parentGoalId,
          cascadeMode: "incremental",
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

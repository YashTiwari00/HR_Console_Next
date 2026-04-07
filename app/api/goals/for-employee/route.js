import { appwriteConfig } from "@/lib/appwrite";
import { GOAL_LEVELS, GOAL_STATUSES } from "@/lib/appwriteSchema";
import { ID, Query, databaseId } from "@/lib/appwriteServer";
import { normalizeCycleId } from "@/lib/cycle";
import { assertFrameworkAllowed, getFrameworkPolicy } from "@/lib/frameworkPolicies";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertManagerCanAccessEmployee } from "@/lib/teamAccess";
import { postProcessGoalAop } from "@/app/api/goals/_lib/aopPostProcess";

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function normalizeGoalLevel(value, fallback = GOAL_LEVELS.EMPLOYEE) {
  const normalized = String(value || "").trim().toLowerCase();
  const allowed = new Set(Object.values(GOAL_LEVELS));
  return allowed.has(normalized) ? normalized : fallback;
}

function isUnknownAttributeError(error) {
  return (
    error?.message &&
    String(error.message).toLowerCase().includes("unknown attribute")
  );
}

function isMissingRequiredAttributeError(error, attribute) {
  const message = String(error?.message || "").toLowerCase();
  const normalizedAttribute = String(attribute || "").trim().toLowerCase();

  if (!normalizedAttribute) return false;
  return message.includes("missing required attribute") && message.includes(normalizedAttribute);
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["manager"]);

    const body = await request.json();
    const employeeId = (body.employeeId || "").trim();
    const title = (body.title || "").trim();
    const description = (body.description || "").trim();
    const cycleId = normalizeCycleId((body.cycleId || "").trim());
    const frameworkTypeInput = (body.frameworkType || "").trim();
    const dueDate = body.dueDate || null;
    const lineageRef = body.lineageRef || "";
    const aiSuggested = Boolean(body.aiSuggested);
    const weightage = toInt(body.weightage, 0);
    const parentGoalId = String(body.parentGoalId || "").trim() || null;
    const goalLevelInput = body.goalLevel;
    const goalLevel = normalizeGoalLevel(goalLevelInput);
    const contributionPercent = toInt(body.contributionPercent, 100);

    if (!employeeId || !title || !description || !frameworkTypeInput) {
      return Response.json(
        { error: "employeeId, title, description and frameworkType are required." },
        { status: 400 }
      );
    }

    await assertManagerCanAccessEmployee(databases, profile.$id, employeeId);

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

    const baseGoalPayload = {
      employeeId,
      managerId: profile.$id,
      parentGoalId,
      goalLevel,
      contributionPercent,
      cycleId,
      frameworkType,
      title,
      description,
      weightage,
      status: GOAL_STATUSES.DRAFT,
      dueDate,
      lineageRef,
      aiSuggested,
    };

    let goal;

    try {
      goal = await databases.createDocument(
        databaseId,
        appwriteConfig.goalsCollectionId,
        ID.unique(),
        {
          ...baseGoalPayload,
          progressPercent: 0,
          processPercent: 0,
        }
      );
    } catch (error) {
      if (isUnknownAttributeError(error)) {
        try {
          goal = await databases.createDocument(
            databaseId,
            appwriteConfig.goalsCollectionId,
            ID.unique(),
            {
              ...baseGoalPayload,
              progressPercent: 0,
            }
          );
        } catch (secondError) {
          if (
            isUnknownAttributeError(secondError) ||
            isMissingRequiredAttributeError(secondError, "processPercent")
          ) {
            goal = await databases.createDocument(
              databaseId,
              appwriteConfig.goalsCollectionId,
              ID.unique(),
              {
                ...baseGoalPayload,
                processPercent: 0,
              }
            );
          } else {
            throw secondError;
          }
        }
      } else {
        throw error;
      }
    }

    try {
      await postProcessGoalAop(databases, goal);
    } catch {
      // AOP linkage must never block goal creation.
    }

    return Response.json({ data: goal }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

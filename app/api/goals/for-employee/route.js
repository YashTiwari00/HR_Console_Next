import { appwriteConfig } from "@/lib/appwrite";
import { FRAMEWORK_TYPES, GOAL_STATUSES } from "@/lib/appwriteSchema";
import { ID, Query, databaseId } from "@/lib/appwriteServer";
import { normalizeCycleId } from "@/lib/cycle";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertManagerCanAccessEmployee } from "@/lib/teamAccess";

const VALID_FRAMEWORKS = Object.values(FRAMEWORK_TYPES);

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
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
    const frameworkType = (body.frameworkType || "").trim();
    const dueDate = body.dueDate || null;
    const lineageRef = body.lineageRef || "";
    const aiSuggested = Boolean(body.aiSuggested);
    const weightage = toInt(body.weightage, 0);

    if (!employeeId || !title || !description || !frameworkType) {
      return Response.json(
        { error: "employeeId, title, description and frameworkType are required." },
        { status: 400 }
      );
    }

    await assertManagerCanAccessEmployee(databases, profile.$id, employeeId);

    if (!VALID_FRAMEWORKS.includes(frameworkType)) {
      return Response.json({ error: "Invalid frameworkType." }, { status: 400 });
    }

    if (weightage < 1 || weightage > 100) {
      return Response.json({ error: "weightage must be between 1 and 100." }, { status: 400 });
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

    return Response.json({ data: goal }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

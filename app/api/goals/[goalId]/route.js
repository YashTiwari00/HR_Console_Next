import { appwriteConfig } from "@/lib/appwrite";
import { FRAMEWORK_TYPES, GOAL_STATUSES } from "@/lib/appwriteSchema";
import { Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";

const VALID_FRAMEWORKS = Object.values(FRAMEWORK_TYPES);

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
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
    requireRole(profile, ["employee"]);

    const params = await context.params;
    const goalId = params.goalId;
    const goal = await databases.getDocument(
      databaseId,
      appwriteConfig.goalsCollectionId,
      goalId
    );

    if (goal.employeeId !== profile.$id) {
      return Response.json({ error: "Forbidden for this goal." }, { status: 403 });
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
    const frameworkType = (body.frameworkType || goal.frameworkType || "").trim();
    const managerId = (body.managerId || goal.managerId || profile.managerId || "").trim();
    const dueDate = body.dueDate ?? goal.dueDate ?? null;
    const lineageRef = body.lineageRef ?? goal.lineageRef ?? "";
    const aiSuggested =
      typeof body.aiSuggested === "boolean" ? body.aiSuggested : Boolean(goal.aiSuggested);
    const weightage = toInt(body.weightage ?? goal.weightage, 0);

    if (!title || !description || !cycleId || !frameworkType || !managerId) {
      return Response.json(
        { error: "title, description, cycleId, frameworkType and managerId are required." },
        { status: 400 }
      );
    }

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
        Query.equal("employeeId", profile.$id),
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

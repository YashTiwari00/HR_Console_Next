import { appwriteConfig } from "@/lib/appwrite";
import { FRAMEWORK_TYPES, GOAL_STATUSES } from "@/lib/appwriteSchema";
import { ID, Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";

const VALID_FRAMEWORKS = Object.values(FRAMEWORK_TYPES);

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "hr"]);

    const { searchParams } = new URL(request.url);
    const cycleId = searchParams.get("cycleId");
    const status = searchParams.get("status");

    const queries = [Query.orderDesc("$createdAt"), Query.limit(100)];

    if (profile.role === "employee") {
      queries.push(Query.equal("employeeId", profile.$id));
    } else if (profile.role === "manager") {
      queries.push(Query.equal("managerId", profile.$id));
    }

    if (cycleId) queries.push(Query.equal("cycleId", cycleId));
    if (status) queries.push(Query.equal("status", status));

    const result = await databases.listDocuments(
      databaseId,
      appwriteConfig.goalsCollectionId,
      queries
    );

    return Response.json({ data: result.documents });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee"]);

    const body = await request.json();
    const title = (body.title || "").trim();
    const description = (body.description || "").trim();
    const cycleId = (body.cycleId || "").trim();
    const frameworkType = (body.frameworkType || "").trim();
    const managerId = (body.managerId || profile.managerId || "").trim();
    const dueDate = body.dueDate || null;
    const lineageRef = body.lineageRef || "";
    const aiSuggested = Boolean(body.aiSuggested);
    const weightage = toInt(body.weightage, 0);

    if (!title || !description || !cycleId || !frameworkType) {
      return Response.json(
        { error: "title, description, cycleId and frameworkType are required." },
        { status: 400 }
      );
    }

    if (!managerId) {
      return Response.json(
        { error: "managerId is missing. Set it in profile or provide it in request." },
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

    const goal = await databases.createDocument(
      databaseId,
      appwriteConfig.goalsCollectionId,
      ID.unique(),
      {
        employeeId: profile.$id,
        managerId,
        cycleId,
        frameworkType,
        title,
        description,
        weightage,
        status: GOAL_STATUSES.DRAFT,
        progressPercent: 0,
        dueDate,
        lineageRef,
        aiSuggested,
      }
    );

    return Response.json({ data: goal }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

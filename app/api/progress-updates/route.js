import { appwriteConfig } from "@/lib/appwrite";
import { GOAL_STATUSES, RAG_STATUSES } from "@/lib/appwriteSchema";
import { ID, Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";

const VALID_RAG = Object.values(RAG_STATUSES);

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "hr"]);

    const { searchParams } = new URL(request.url);
    const goalId = searchParams.get("goalId");

    const queries = [Query.orderDesc("$createdAt"), Query.limit(100)];

    if (profile.role === "employee") {
      queries.push(Query.equal("employeeId", profile.$id));
    }

    if (goalId) {
      queries.push(Query.equal("goalId", goalId));
    }

    const result = await databases.listDocuments(
      databaseId,
      appwriteConfig.progressUpdatesCollectionId,
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
    const goalId = (body.goalId || "").trim();
    const updateText = (body.updateText || "").trim();
    const ragStatus = (body.ragStatus || "").trim();
    const attachmentIds = Array.isArray(body.attachmentIds) ? body.attachmentIds : [];
    const percentComplete = toInt(body.percentComplete, -1);

    if (!goalId || !updateText || percentComplete < 0 || percentComplete > 100) {
      return Response.json(
        { error: "goalId, updateText and percentComplete (0-100) are required." },
        { status: 400 }
      );
    }

    if (!VALID_RAG.includes(ragStatus)) {
      return Response.json({ error: "Invalid ragStatus." }, { status: 400 });
    }

    const goal = await databases.getDocument(
      databaseId,
      appwriteConfig.goalsCollectionId,
      goalId
    );

    if (goal.employeeId !== profile.$id) {
      return Response.json({ error: "Forbidden for this goal." }, { status: 403 });
    }

    const progress = await databases.createDocument(
      databaseId,
      appwriteConfig.progressUpdatesCollectionId,
      ID.unique(),
      {
        goalId,
        employeeId: profile.$id,
        percentComplete,
        ragStatus,
        updateText,
        attachmentIds,
      }
    );

    const goalPatch = {
      progressPercent: percentComplete,
    };

    if (percentComplete === 100) {
      goalPatch.status = GOAL_STATUSES.CLOSED;
    }

    const updatedGoal = await databases.updateDocument(
      databaseId,
      appwriteConfig.goalsCollectionId,
      goalId,
      goalPatch
    );

    return Response.json({ data: { progress, goal: updatedGoal } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

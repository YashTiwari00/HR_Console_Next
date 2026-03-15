import { appwriteConfig } from "@/lib/appwrite";
import { GOAL_STATUSES } from "@/lib/appwriteSchema";
import { ID, Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";

const VALID_DECISIONS = ["approved", "rejected", "needs_changes"];

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["manager", "hr"]);

    const queries = [
      Query.equal("status", GOAL_STATUSES.SUBMITTED),
      Query.orderAsc("$createdAt"),
      Query.limit(100),
    ];

    if (profile.role === "manager") {
      queries.push(Query.equal("managerId", profile.$id));
    }

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
    requireRole(profile, ["manager", "hr"]);

    const body = await request.json();
    const goalId = (body.goalId || "").trim();
    const decision = (body.decision || "").trim();
    const comments = (body.comments || "").trim();

    if (!goalId || !decision) {
      return Response.json(
        { error: "goalId and decision are required." },
        { status: 400 }
      );
    }

    if (!VALID_DECISIONS.includes(decision)) {
      return Response.json({ error: "Invalid decision." }, { status: 400 });
    }

    const goal = await databases.getDocument(
      databaseId,
      appwriteConfig.goalsCollectionId,
      goalId
    );

    if (profile.role === "manager" && goal.managerId !== profile.$id) {
      return Response.json({ error: "Forbidden for this goal." }, { status: 403 });
    }

    if (goal.status !== GOAL_STATUSES.SUBMITTED) {
      return Response.json(
        { error: "Only submitted goals can be decided." },
        { status: 400 }
      );
    }

    const nextStatus = decision === "approved" ? GOAL_STATUSES.APPROVED : GOAL_STATUSES.NEEDS_CHANGES;

    const updatedGoal = await databases.updateDocument(
      databaseId,
      appwriteConfig.goalsCollectionId,
      goalId,
      {
        status: nextStatus,
      }
    );

    const approval = await databases.createDocument(
      databaseId,
      appwriteConfig.goalApprovalsCollectionId,
      ID.unique(),
      {
        goalId,
        managerId: goal.managerId,
        decision,
        comments,
        decidedAt: new Date().toISOString(),
      }
    );

    return Response.json({ data: { goal: updatedGoal, approval } });
  } catch (error) {
    return errorResponse(error);
  }
}

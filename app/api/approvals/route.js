import { appwriteConfig } from "@/lib/appwrite";
import { GOAL_STATUSES } from "@/lib/appwriteSchema";
import { ID, Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { listUsersByIds } from "@/lib/teamAccess";

const VALID_DECISIONS = ["approved", "rejected", "needs_changes"];

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["manager", "leadership", "hr"]);

    const { searchParams } = new URL(request.url);
    const origin = (searchParams.get("origin") || "all").trim();

    const queries = [
      Query.equal("status", GOAL_STATUSES.SUBMITTED),
      Query.orderAsc("$createdAt"),
      Query.limit(100),
    ];

    if (profile.role === "manager" || profile.role === "leadership") {
      queries.push(Query.equal("managerId", profile.$id));
    }

    const result = await databases.listDocuments(
      databaseId,
      appwriteConfig.goalsCollectionId,
      queries
    );

    if (profile.role === "hr" && origin === "manager") {
      const employeeIds = Array.from(
        new Set(result.documents.map((goal) => String(goal.employeeId || "").trim()).filter(Boolean))
      );

      const employeeProfiles = await listUsersByIds(databases, employeeIds);
      const employeeProfileById = new Map(employeeProfiles.map((item) => [String(item.$id || "").trim(), item]));

      const managerGoalRows = result.documents.filter((goal) => {
        const employeeId = String(goal.employeeId || "").trim();
        const owner = employeeProfileById.get(employeeId);

        // Keep entries if profile lookup fails to avoid dropping valid pending approvals.
        if (!owner) return true;

        const ownerRole = String(owner.role || "").trim().toLowerCase();
        if (ownerRole !== "manager") return false;

        const assignedHrId = String(owner.hrId || "").trim();
        if (assignedHrId && assignedHrId !== profile.$id) return false;

        return true;
      });

      return Response.json({ data: managerGoalRows });
    }

    return Response.json({ data: result.documents });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["manager", "leadership"]);

    if (profile.role === "hr") {
      return Response.json(
        { error: "Forbidden: HR can supervise only and cannot approve goals." },
        { status: 403 }
      );
    }

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

    if ((profile.role === "manager" || profile.role === "leadership") && goal.managerId !== profile.$id) {
      return Response.json({ error: "Forbidden for this goal." }, { status: 403 });
    }

    if ((profile.role === "manager" || profile.role === "leadership") && goal.employeeId === profile.$id) {
      return Response.json(
        { error: "Managers cannot approve their own goals. Immediate upper manager approval is required." },
        { status: 403 }
      );
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
        managerId: profile.$id,
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

import { appwriteConfig } from "@/lib/appwrite";
import { GOAL_STATUSES } from "@/lib/appwriteSchema";
import { ID, Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { listUsersByIds } from "@/lib/teamAccess";

const VALID_DECISIONS = ["approved", "rejected", "needs_changes"];

function normalizeDecisionItem(item) {
  return {
    goalId: String(item?.goalId || "").trim(),
    decision: String(item?.decision || "").trim(),
    comments: String(item?.comments || "").trim(),
  };
}

async function applyGoalDecision({ databases, profile, goalId, decision, comments }) {
  if (!goalId || !decision) {
    throw new Error("goalId and decision are required.");
  }

  if (!VALID_DECISIONS.includes(decision)) {
    throw new Error("Invalid decision.");
  }

  const goal = await databases.getDocument(
    databaseId,
    appwriteConfig.goalsCollectionId,
    goalId
  );

  if ((profile.role === "manager" || profile.role === "leadership") && goal.managerId !== profile.$id) {
    const error = new Error("Forbidden for this goal.");
    error.status = 403;
    throw error;
  }

  if ((profile.role === "manager" || profile.role === "leadership") && goal.employeeId === profile.$id) {
    const error = new Error(
      "Managers cannot approve their own goals. Immediate upper manager approval is required."
    );
    error.status = 403;
    throw error;
  }

  if (goal.status !== GOAL_STATUSES.SUBMITTED) {
    throw new Error("Only submitted goals can be decided.");
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

  return { goal: updatedGoal, approval };
}

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
    const items = Array.isArray(body?.items)
      ? body.items.map((item) => normalizeDecisionItem(item)).filter((item) => item.goalId)
      : [];

    if (items.length > 0) {
      if (items.length > 100) {
        return Response.json({ error: "Bulk approvals support up to 100 goals per request." }, { status: 400 });
      }

      const successes = [];
      const failures = [];

      for (const item of items) {
        try {
          const result = await applyGoalDecision({
            databases,
            profile,
            goalId: item.goalId,
            decision: item.decision,
            comments: item.comments,
          });

          successes.push({
            goalId: item.goalId,
            decision: item.decision,
            goalStatus: result.goal?.status || null,
          });
        } catch (error) {
          failures.push({
            goalId: item.goalId,
            reason: String(error?.message || "Failed to apply decision."),
          });
        }
      }

      return Response.json(
        {
          ok: true,
          summary: {
            total: items.length,
            approved: successes.length,
            failed: failures.length,
            successes,
            failures,
          },
        },
        { status: failures.length === items.length ? 422 : 200 }
      );
    }

    const single = normalizeDecisionItem(body || {});

    if (!single.goalId || !single.decision) {
      return Response.json(
        { error: "goalId and decision are required." },
        { status: 400 }
      );
    }

    const result = await applyGoalDecision({
      databases,
      profile,
      goalId: single.goalId,
      decision: single.decision,
      comments: single.comments,
    });

    return Response.json({ data: result });
  } catch (error) {
    return errorResponse(error);
  }
}

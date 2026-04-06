import { appwriteConfig } from "@/lib/appwrite";
import { GOAL_STATUSES } from "@/lib/appwriteSchema";
import { ID, databaseId } from "@/lib/appwriteServer";
import { sendInAppAndQueueEmail } from "@/app/api/notifications/_lib/workflows";

const VALID_DECISIONS = ["approved", "rejected", "needs_changes"];

function isUnknownAttributeError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("unknown attribute") || message.includes("attribute not found in schema");
}

function isManagerRole(role) {
  const normalizedRole = String(role || "").trim().toLowerCase();
  return normalizedRole === "manager" || normalizedRole === "leadership";
}

async function updateGoalStatusWithCompat(databases, goalId, payload) {
  try {
    return await databases.updateDocument(
      databaseId,
      appwriteConfig.goalsCollectionId,
      goalId,
      payload
    );
  } catch (error) {
    if (!isUnknownAttributeError(error)) {
      throw error;
    }

    const fallbackPayload = { status: payload.status };
    return databases.updateDocument(
      databaseId,
      appwriteConfig.goalsCollectionId,
      goalId,
      fallbackPayload
    );
  }
}

export function normalizeDecisionItem(item) {
  return {
    goalId: String(item?.goalId || "").trim(),
    decision: String(item?.decision || "").trim(),
    comments: String(item?.comments || "").trim(),
  };
}

export async function applyGoalDecision({
  databases,
  profile,
  goalId,
  decision,
  comments,
  mode = "manual",
}) {
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

  const managerRole = isManagerRole(profile?.role);
  if (managerRole && goal.managerId !== profile.$id) {
    const error = new Error("Forbidden for this goal.");
    error.status = 403;
    throw error;
  }

  if (managerRole && goal.employeeId === profile.$id) {
    const error = new Error(
      "Managers cannot approve their own goals. Immediate upper manager approval is required."
    );
    error.status = 403;
    throw error;
  }

  if (goal.status !== GOAL_STATUSES.SUBMITTED) {
    throw new Error("Only submitted goals can be decided.");
  }

  const nextStatus =
    decision === "approved" ? GOAL_STATUSES.APPROVED : GOAL_STATUSES.NEEDS_CHANGES;

  const nowIso = new Date().toISOString();
  const updatePayload = {
    status: nextStatus,
    approvalSource: mode === "system_auto" ? "system_auto" : "manual",
    autoApprovedAt: mode === "system_auto" ? nowIso : null,
  };

  const updatedGoal = await updateGoalStatusWithCompat(databases, goalId, updatePayload);

  const approval = await databases.createDocument(
    databaseId,
    appwriteConfig.goalApprovalsCollectionId,
    ID.unique(),
    {
      goalId,
      managerId:
        mode === "system_auto"
          ? String(goal.managerId || "").trim() || String(profile?.$id || "system").trim()
          : profile.$id,
      decision,
      comments,
      decidedAt: nowIso,
    }
  );

  if (decision === "approved") {
    try {
      const goalTitle = String(goal.title || "Untitled Goal").trim();
      const dateKey = nowIso.slice(0, 10);
      const managerUserId = String(goal.managerId || "").trim();

      const tasks = [
        sendInAppAndQueueEmail(databases, {
          userId: String(goal.employeeId || "").trim(),
          triggerType: "goal_approved",
          title: "Goal approved",
          message: `Your goal \"${goalTitle}\" has been approved.`,
          actionUrl: "/employee/timeline",
          dedupeKey: `goal-approved-employee-${goalId}-${dateKey}`,
          metadata: { goalId, decision, mode, recipientRole: "employee" },
        }),
      ];

      if (managerUserId) {
        tasks.push(
          sendInAppAndQueueEmail(databases, {
            userId: managerUserId,
            triggerType: "goal_approved",
            title: "Goal approved",
            message: `Goal \"${goalTitle}\" has been approved.`,
            actionUrl: "/manager/team-approvals",
            dedupeKey: `goal-approved-manager-${goalId}-${dateKey}`,
            metadata: { goalId, decision, mode, recipientRole: "manager" },
          })
        );
      }

      await Promise.allSettled(tasks);
    } catch {
      // Notification write failures should never block approval actions.
    }
  }

  return { goal: updatedGoal, approval };
}

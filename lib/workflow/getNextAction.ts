import type { CheckInItem, GoalItem } from "@/app/employee/_lib/pmsClient";

export type WorkflowActionType =
  | "create_goal"
  | "submit_goal"
  | "start_checkin"
  | "submit_self_review"
  | "manager_review"
  | null;

export interface WorkflowAction {
  label: string;
  actionType: WorkflowActionType;
}

function goalsInCycle(goals: GoalItem[], cycle: string) {
  return goals.filter((goal) => String(goal.cycleId || "").trim() === String(cycle || "").trim());
}

function checkInsForGoals(checkIns: CheckInItem[], goalIds: Set<string>) {
  return checkIns.filter((item) => goalIds.has(String(item.goalId || "").trim()));
}

function isFinalCompletedCheckIn(item: CheckInItem) {
  return Boolean(item.isFinalCheckIn) && String(item.status || "") === "completed";
}

function hasManagerRating(item: CheckInItem) {
  const numeric = Number(item.managerRating);
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 5;
}

function isSelfReviewSatisfied(item: CheckInItem) {
  // Backward compatibility: previously rated final check-ins remain valid.
  if (hasManagerRating(item)) {
    return true;
  }

  return String(item.selfReviewStatus || "") === "submitted";
}

export function getNextAction(goals: GoalItem[], checkIns: CheckInItem[], cycle: string): WorkflowAction {
  const scopedGoals = goalsInCycle(goals, cycle);

  if (scopedGoals.length === 0) {
    return {
      label: "Create your goals",
      actionType: "create_goal",
    };
  }

  const hasDraft = scopedGoals.some(
    (goal) => String(goal.status || "") === "draft" || String(goal.status || "") === "needs_changes"
  );

  if (hasDraft) {
    return {
      label: "Submit goals for approval",
      actionType: "submit_goal",
    };
  }

  const hasSubmitted = scopedGoals.some((goal) => String(goal.status || "") === "submitted");
  const hasApproved = scopedGoals.some(
    (goal) => String(goal.status || "") === "approved" || String(goal.status || "") === "closed"
  );

  if (hasSubmitted && !hasApproved) {
    return {
      label: "Waiting for manager approval",
      actionType: null,
    };
  }

  const goalIds = new Set(scopedGoals.map((goal) => String(goal.$id || "").trim()).filter(Boolean));
  const scopedCheckIns = checkInsForGoals(checkIns, goalIds);

  if (hasApproved && scopedCheckIns.length === 0) {
    return {
      label: "Start first check-in",
      actionType: "start_checkin",
    };
  }

  const finalCompletedCheckIns = scopedCheckIns.filter(isFinalCompletedCheckIn);
  const hasFinalCheckIn = finalCompletedCheckIns.length > 0;

  if (scopedCheckIns.length > 0 && !hasFinalCheckIn) {
    return {
      label: "Continue check-ins",
      actionType: "start_checkin",
    };
  }

  const allClosed = scopedGoals.length > 0 && scopedGoals.every((goal) => String(goal.status || "") === "closed");

  const hasPendingSelfReview = finalCompletedCheckIns.some((item) => !isSelfReviewSatisfied(item));
  if (hasPendingSelfReview) {
    return {
      label: "Submit self review",
      actionType: "submit_self_review",
    };
  }

  const hasPendingManagerReview = finalCompletedCheckIns.some(
    (item) => isSelfReviewSatisfied(item) && !hasManagerRating(item)
  );
  if (hasPendingManagerReview) {
    return {
      label: "Awaiting manager review",
      actionType: null,
    };
  }

  if (hasFinalCheckIn && !allClosed) {
    return {
      label: "Manager review completed",
      actionType: "manager_review",
    };
  }

  return {
    label: "Cycle workflow on track",
    actionType: null,
  };
}

import type { CheckInItem, GoalItem } from "@/app/employee/_lib/pmsClient";

export type WorkflowActionType = "create_goal" | "submit_goal" | "start_checkin" | "review" | null;

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

  const hasFinalCheckIn = scopedCheckIns.some(
    (item) => Boolean(item.isFinalCheckIn) && String(item.status || "") === "completed"
  );

  if (scopedCheckIns.length > 0 && !hasFinalCheckIn) {
    return {
      label: "Continue check-ins",
      actionType: "start_checkin",
    };
  }

  const allClosed = scopedGoals.length > 0 && scopedGoals.every((goal) => String(goal.status || "") === "closed");

  if (hasFinalCheckIn && !allClosed) {
    return {
      label: "Complete review",
      actionType: "review",
    };
  }

  return {
    label: "Cycle workflow on track",
    actionType: null,
  };
}

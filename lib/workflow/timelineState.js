function normalize(value) {
  return String(value || "").trim();
}

function goalsInCycle(goals, cycleId) {
  return goals.filter((goal) => normalize(goal.cycleId) === normalize(cycleId));
}

function checkInsForGoals(checkIns, goalIds) {
  return checkIns.filter((item) => goalIds.has(normalize(item.goalId)));
}

function isFinalCompletedCheckIn(item) {
  return Boolean(item.isFinalCheckIn) && normalize(item.status) === "completed";
}

function hasManagerRating(item) {
  const numeric = Number(item.managerRating);
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 5;
}

function isSelfReviewSatisfied(item) {
  // Backward compatibility: rated final check-ins are treated as satisfied.
  if (hasManagerRating(item)) {
    return true;
  }

  return normalize(item.selfReviewStatus) === "submitted";
}

function getNextAction(scopedGoals, scopedCheckIns) {
  if (scopedGoals.length === 0) {
    return { label: "Create your goals", actionType: "create_goal" };
  }

  const hasDraft = scopedGoals.some(
    (goal) => normalize(goal.status) === "draft" || normalize(goal.status) === "needs_changes"
  );

  if (hasDraft) {
    return { label: "Submit goals for approval", actionType: "submit_goal" };
  }

  const hasSubmitted = scopedGoals.some((goal) => normalize(goal.status) === "submitted");
  const hasApproved = scopedGoals.some(
    (goal) => normalize(goal.status) === "approved" || normalize(goal.status) === "closed"
  );

  if (hasSubmitted && !hasApproved) {
    return { label: "Waiting for manager approval", actionType: null };
  }

  if (hasApproved && scopedCheckIns.length === 0) {
    return { label: "Start first check-in", actionType: "start_checkin" };
  }

  const finalCompletedCheckIns = scopedCheckIns.filter(isFinalCompletedCheckIn);
  const hasFinalCheckIn = finalCompletedCheckIns.length > 0;

  if (scopedCheckIns.length > 0 && !hasFinalCheckIn) {
    return { label: "Continue check-ins", actionType: "start_checkin" };
  }

  const allClosed = scopedGoals.length > 0 && scopedGoals.every((goal) => normalize(goal.status) === "closed");

  const hasPendingSelfReview = finalCompletedCheckIns.some((item) => !isSelfReviewSatisfied(item));
  if (hasPendingSelfReview) {
    return { label: "Submit self review", actionType: "submit_self_review" };
  }

  const hasPendingManagerReview = finalCompletedCheckIns.some(
    (item) => isSelfReviewSatisfied(item) && !hasManagerRating(item)
  );
  if (hasPendingManagerReview) {
    return { label: "Awaiting manager review", actionType: null };
  }

  if (hasFinalCheckIn && !allClosed) {
    return { label: "Manager review completed", actionType: "manager_review" };
  }

  return { label: "Cycle workflow on track", actionType: null };
}

export function resolveTimelineState({ goals, checkIns, cycleId }) {
  const scopedGoals = goalsInCycle(Array.isArray(goals) ? goals : [], cycleId);
  const goalIds = new Set(scopedGoals.map((goal) => normalize(goal.$id)).filter(Boolean));
  const scopedCheckIns = checkInsForGoals(Array.isArray(checkIns) ? checkIns : [], goalIds);

  const hasGoals = scopedGoals.length > 0;
  const hasDraft = scopedGoals.some(
    (goal) => normalize(goal.status) === "draft" || normalize(goal.status) === "needs_changes"
  );
  const hasSubmitted = scopedGoals.some((goal) => normalize(goal.status) === "submitted");
  const hasApproved = scopedGoals.some(
    (goal) => normalize(goal.status) === "approved" || normalize(goal.status) === "closed"
  );
  const hasCheckIns = scopedCheckIns.length > 0;
  const finalCompletedCheckIns = scopedCheckIns.filter(isFinalCompletedCheckIn);
  const hasFinalCheckIn = finalCompletedCheckIns.length > 0;
  const hasSelfReviewPending = finalCompletedCheckIns.some((item) => !isSelfReviewSatisfied(item));
  const hasManagerReviewPending = finalCompletedCheckIns.some(
    (item) => isSelfReviewSatisfied(item) && !hasManagerRating(item)
  );
  const hasManagerReviewCompleted =
    hasFinalCheckIn && finalCompletedCheckIns.every((item) => hasManagerRating(item));
  const allClosed = hasGoals && scopedGoals.every((goal) => normalize(goal.status) === "closed");

  const blockers = [];
  if (!hasGoals) blockers.push("No goals found for this cycle.");
  if (hasDraft) blockers.push("Draft or needs_changes goals are pending submission.");
  if (hasSubmitted && !hasApproved) blockers.push("Submitted goals are awaiting approval.");
  if (hasApproved && !hasCheckIns) blockers.push("No check-ins have been started.");
  if (hasCheckIns && !hasFinalCheckIn) blockers.push("Final check-in is not completed yet.");
  if (hasFinalCheckIn && hasSelfReviewPending) blockers.push("Self review submission is pending.");
  if (hasFinalCheckIn && !hasSelfReviewPending && hasManagerReviewPending) {
    blockers.push("Manager review is pending after self review.");
  }
  if (hasManagerReviewCompleted && !allClosed) blockers.push("Cycle close is pending final closure.");

  let currentStage = "goal_creation";

  if (allClosed) {
    currentStage = "cycle_closed";
  } else if (hasManagerReviewCompleted) {
    currentStage = "manager_review";
  } else if (hasFinalCheckIn && hasSelfReviewPending) {
    currentStage = "self_review";
  } else if (hasFinalCheckIn) {
    currentStage = "manager_review";
  } else if (hasApproved && hasCheckIns) {
    currentStage = "check_ins";
  } else if (hasSubmitted || (hasGoals && !hasApproved)) {
    currentStage = "goal_approval";
  }

  const nodes = [
    {
      key: "goal_creation",
      label: "Goal Creation",
      done: hasGoals && !hasDraft,
      blocked: !hasGoals || hasDraft,
    },
    {
      key: "goal_approval",
      label: "Goal Approval",
      done: hasApproved && !hasSubmitted,
      blocked: !hasGoals || (hasSubmitted && !hasApproved),
    },
    {
      key: "check_ins",
      label: "Check-ins",
      done: hasCheckIns,
      blocked: !hasApproved,
    },
    {
      key: "self_review",
      label: "Self Review",
      done: hasFinalCheckIn && !hasSelfReviewPending,
      blocked: !hasFinalCheckIn || hasSelfReviewPending,
    },
    {
      key: "manager_review",
      label: "Manager Review",
      done: hasManagerReviewCompleted,
      blocked: !hasFinalCheckIn || hasSelfReviewPending || hasManagerReviewPending,
    },
    {
      key: "cycle_closed",
      label: "Cycle Closed",
      done: allClosed,
      blocked: !allClosed,
    },
  ];

  return {
    cycleId: normalize(cycleId),
    currentStage,
    blockers,
    nodes,
    nextAction: getNextAction(scopedGoals, scopedCheckIns),
    summary: {
      goals: scopedGoals.length,
      checkIns: scopedCheckIns.length,
      hasFinalCheckIn,
      hasSelfReviewPending,
      hasManagerReviewCompleted,
      allClosed,
    },
  };
}

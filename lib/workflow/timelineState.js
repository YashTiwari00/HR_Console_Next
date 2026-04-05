function normalize(value) {
  return String(value || "").trim();
}

function goalsInCycle(goals, cycleId) {
  return goals.filter((goal) => normalize(goal.cycleId) === normalize(cycleId));
}

function checkInsForGoals(checkIns, goalIds) {
  return checkIns.filter((item) => goalIds.has(normalize(item.goalId)));
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

  const hasFinalCheckIn = scopedCheckIns.some(
    (item) => Boolean(item.isFinalCheckIn) && normalize(item.status) === "completed"
  );

  if (scopedCheckIns.length > 0 && !hasFinalCheckIn) {
    return { label: "Continue check-ins", actionType: "start_checkin" };
  }

  const allClosed = scopedGoals.length > 0 && scopedGoals.every((goal) => normalize(goal.status) === "closed");

  if (hasFinalCheckIn && !allClosed) {
    return { label: "Complete review", actionType: "review" };
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
  const hasFinalCheckIn = scopedCheckIns.some(
    (item) => Boolean(item.isFinalCheckIn) && normalize(item.status) === "completed"
  );
  const allClosed = hasGoals && scopedGoals.every((goal) => normalize(goal.status) === "closed");

  const blockers = [];
  if (!hasGoals) blockers.push("No goals found for this cycle.");
  if (hasDraft) blockers.push("Draft or needs_changes goals are pending submission.");
  if (hasSubmitted && !hasApproved) blockers.push("Submitted goals are awaiting approval.");
  if (hasApproved && !hasCheckIns) blockers.push("No check-ins have been started.");
  if (hasCheckIns && !hasFinalCheckIn) blockers.push("Final check-in is not completed yet.");
  if (hasFinalCheckIn && !allClosed) blockers.push("Cycle close is pending final review/closure.");

  let currentStage = "goal_creation";

  if (allClosed) {
    currentStage = "cycle_closed";
  } else if (hasFinalCheckIn) {
    currentStage = "review";
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
      key: "review",
      label: "Review",
      done: hasFinalCheckIn,
      blocked: !hasFinalCheckIn,
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
      allClosed,
    },
  };
}

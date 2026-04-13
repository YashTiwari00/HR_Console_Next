function toRating(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
    return null;
  }
  return parsed;
}

export function calculateDecisionDrift(decision) {
  const finalRating = toRating(decision?.finalRating);
  const proposedRating = toRating(decision?.proposedRating);

  if (finalRating === null || proposedRating === null) {
    return 0;
  }

  return finalRating - proposedRating;
}

export function buildCalibrationDriftSummary(decisions) {
  const rows = Array.isArray(decisions) ? decisions : [];

  let totalDrift = 0;
  let counted = 0;
  let positiveDriftCount = 0;
  let negativeDriftCount = 0;

  for (const item of rows) {
    const drift = calculateDecisionDrift(item);
    const hasComparableRatings =
      toRating(item?.finalRating) !== null && toRating(item?.proposedRating) !== null;

    if (!hasComparableRatings) {
      continue;
    }

    totalDrift += drift;
    counted += 1;

    if (drift > 0) positiveDriftCount += 1;
    if (drift < 0) negativeDriftCount += 1;
  }

  return {
    avgDrift: counted > 0 ? Number((totalDrift / counted).toFixed(2)) : 0,
    positiveDriftCount,
    negativeDriftCount,
  };
}

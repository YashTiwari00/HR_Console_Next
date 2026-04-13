function toRating(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
    return null;
  }
  return parsed;
}

function resolveDecisionRating(decision) {
  const finalRating = toRating(decision?.finalRating);
  if (finalRating !== null) return finalRating;

  const proposedRating = toRating(decision?.proposedRating);
  if (proposedRating !== null) return proposedRating;

  return toRating(decision?.previousRating);
}

export function buildCalibrationDistribution(decisions) {
  const rows = Array.isArray(decisions) ? decisions : [];

  const counts = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };

  for (const item of rows) {
    const rating = resolveDecisionRating(item);
    if (rating !== null) {
      counts[rating] += 1;
    }
  }

  const total = counts[1] + counts[2] + counts[3] + counts[4] + counts[5];

  const distribution = {
    1: {
      count: counts[1],
      percent: total > 0 ? Math.round((counts[1] / total) * 100) : 0,
    },
    2: {
      count: counts[2],
      percent: total > 0 ? Math.round((counts[2] / total) * 100) : 0,
    },
    3: {
      count: counts[3],
      percent: total > 0 ? Math.round((counts[3] / total) * 100) : 0,
    },
    4: {
      count: counts[4],
      percent: total > 0 ? Math.round((counts[4] / total) * 100) : 0,
    },
    5: {
      count: counts[5],
      percent: total > 0 ? Math.round((counts[5] / total) * 100) : 0,
    },
  };

  return distribution;
}

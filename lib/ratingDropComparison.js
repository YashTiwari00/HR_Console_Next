export const RATING_DROP_RISK_LEVELS = {
  HIGH_RISK: "HIGH RISK",
  MODERATE: "MODERATE",
};

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function evaluateRatingDropRisk(input) {
  const employeeId = String(input?.employeeId || "").trim();
  const previousRating = toFiniteNumber(input?.previousRating);
  const currentRating = toFiniteNumber(input?.currentRating);

  if (!employeeId || previousRating === null || currentRating === null) {
    return null;
  }

  const drop = Number((previousRating - currentRating).toFixed(2));

  if (drop > 1) {
    return {
      employeeId,
      previousRating,
      currentRating,
      drop,
      riskLevel: RATING_DROP_RISK_LEVELS.HIGH_RISK,
    };
  }

  if (drop === 1) {
    return {
      employeeId,
      previousRating,
      currentRating,
      drop,
      riskLevel: RATING_DROP_RISK_LEVELS.MODERATE,
    };
  }

  return null;
}

export function buildRatingDropComparisonDataset(rows) {
  const source = Array.isArray(rows) ? rows : [];
  const result = [];

  for (const row of source) {
    const compared = evaluateRatingDropRisk(row);
    if (compared) {
      result.push(compared);
    }
  }

  return result;
}

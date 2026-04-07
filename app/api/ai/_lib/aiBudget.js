const DEFAULT_WARNING_THRESHOLD = 0.8;

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

export function normalizeBudgetThreshold(value, fallback = DEFAULT_WARNING_THRESHOLD) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) return fallback;
  return parsed;
}

export function calculateTotalCost(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;

  const total = values.reduce((sum, value) => {
    if (value && typeof value === "object") {
      return sum + Math.max(0, normalizeNumber(value.estimatedCost, 0));
    }
    return sum + Math.max(0, normalizeNumber(value, 0));
  }, 0);

  return Number(total.toFixed(6));
}

export function isNearBudget(totalCost, budget, threshold = DEFAULT_WARNING_THRESHOLD) {
  const normalizedBudget = normalizeNumber(budget, 0);
  if (normalizedBudget <= 0) return false;

  const normalizedCost = Math.max(0, normalizeNumber(totalCost, 0));
  const normalizedThreshold = normalizeBudgetThreshold(threshold);

  return normalizedCost < normalizedBudget && normalizedCost / normalizedBudget >= normalizedThreshold;
}

export function isOverBudget(totalCost, budget) {
  const normalizedBudget = normalizeNumber(budget, 0);
  if (normalizedBudget <= 0) return false;

  const normalizedCost = Math.max(0, normalizeNumber(totalCost, 0));
  return normalizedCost >= normalizedBudget;
}

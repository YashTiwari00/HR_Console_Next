export const RATING_LABELS = ["EE", "DE", "ME", "SME", "NI"];

export const RATING_VALUE_BY_LABEL = {
  EE: 5,
  DE: 4,
  ME: 3,
  SME: 2,
  NI: 1,
};

const VALUE_LABEL_PAIRS = Object.entries(RATING_VALUE_BY_LABEL).map(([label, value]) => ({
  label,
  value,
}));

export function isRatingLabel(value) {
  return RATING_LABELS.includes(String(value || "").trim().toUpperCase());
}

export function labelToRatingValue(label) {
  const normalized = String(label || "").trim().toUpperCase();
  if (!isRatingLabel(normalized)) return null;
  return RATING_VALUE_BY_LABEL[normalized];
}

export function valueToRatingLabel(value) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 5) return null;
  const found = VALUE_LABEL_PAIRS.find((item) => item.value === numeric);
  return found ? found.label : null;
}

export function parseRatingInput(input) {
  if (input === null || input === undefined || input === "") {
    return { value: null, label: null };
  }

  const asLabel = String(input).trim().toUpperCase();
  if (isRatingLabel(asLabel)) {
    return {
      value: labelToRatingValue(asLabel),
      label: asLabel,
    };
  }

  const numeric = Number(input);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 5) {
    return { value: null, label: null };
  }

  return {
    value: numeric,
    label: valueToRatingLabel(numeric),
  };
}

export function weightedScoreX100(goals) {
  const items = Array.isArray(goals) ? goals : [];
  const valid = items.filter((item) => {
    const rating = Number(item?.ratingValue);
    const weightage = Number(item?.weightage);
    return Number.isFinite(rating) && rating >= 1 && rating <= 5 && Number.isFinite(weightage) && weightage > 0;
  });

  if (valid.length === 0) return null;

  const totalWeight = valid.reduce((sum, item) => sum + Number(item.weightage), 0);
  if (totalWeight <= 0) return null;

  const weightedSum = valid.reduce((sum, item) => {
    return sum + Number(item.ratingValue) * Number(item.weightage);
  }, 0);

  return Math.round((weightedSum / totalWeight) * 100);
}

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toSafeProgress(child) {
  const raw =
    child?.progress ??
    child?.progressPercent ??
    child?.processPercent ??
    0;

  const numeric = toFiniteNumber(raw, 0);
  return Math.max(0, Math.min(100, numeric));
}

function toSafeContributionPercent(child) {
  const raw = child?.contributionPercent ?? 0;
  const numeric = toFiniteNumber(raw, 0);
  return Math.max(0, Math.min(100, numeric));
}

export function calculateParentGoalProgress(children) {
  const rows = Array.isArray(children) ? children : [];
  if (rows.length === 0) return 0;

  const weightedProgress = rows.reduce((sum, child) => {
    const progress = toSafeProgress(child);
    const contributionPercent = toSafeContributionPercent(child);
    return sum + (progress * contributionPercent) / 100;
  }, 0);

  // Parent progress should remain a valid percentage even with partial or over-specified data.
  return Number(Math.max(0, Math.min(100, weightedProgress)).toFixed(2));
}

export function scoreX100ToLabel(scoreX100) {
  const numeric = Number(scoreX100);
  if (!Number.isFinite(numeric)) return null;

  if (numeric >= 450) return "EE";
  if (numeric >= 350) return "DE";
  if (numeric >= 250) return "ME";
  if (numeric >= 150) return "SME";
  return "NI";
}

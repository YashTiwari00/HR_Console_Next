import { valueToRatingLabel } from "@/lib/ratings";
import { buildExplainability } from "@/lib/ai/explainability";

function safeEmployeeName(name) {
  const value = String(name || "").trim();
  return value || "Employee";
}

export function toRatingLabel(value) {
  return valueToRatingLabel(value);
}

export function buildRatingDropMessage(input) {
  const employeeName = safeEmployeeName(input?.employeeName);
  const previousRatingLabel = toRatingLabel(input?.previousRating);
  const currentRatingLabel = toRatingLabel(input?.currentRating);

  const fromLabel = previousRatingLabel || "N/A";
  const toLabel = currentRatingLabel || "N/A";

  return `Rating drop detected for ${employeeName} - was ${fromLabel}, now ${toLabel}. Suggested next step: schedule a focused coaching check-in and align on recovery goals.`;
}

export function buildRatingDropExplainability(input) {
  const drop = Number(input?.drop);
  const riskLevel = String(input?.riskLevel || "").trim().toUpperCase();

  const isHighRisk = riskLevel === "HIGH RISK" || (Number.isFinite(drop) && drop > 1);
  const confidence = isHighRisk ? 0.82 : 0.75;
  const basedOn = ["goal progress", "check-ins"];

  const reason =
    "Performance declined based on lower goal completion and check-in feedback";

  const explainability = buildExplainability({
    source: "rule_based_rating_drop_v1",
    confidence,
    reason,
    based_on: basedOn,
    whyFactors: basedOn,
    time_window: String(input?.cycleId || "current_cycle").trim() || "current_cycle",
  });

  return {
    reason: explainability.reason,
    based_on: explainability.based_on,
    confidence: explainability.confidence,
  };
}

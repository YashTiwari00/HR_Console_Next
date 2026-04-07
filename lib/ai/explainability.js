import { EXPLAINABILITY_CONFIDENCE } from "@/lib/appwriteSchema";

const CONFIDENCE_TO_SCORE = {
  [EXPLAINABILITY_CONFIDENCE.LOW]: 0.35,
  [EXPLAINABILITY_CONFIDENCE.MEDIUM]: 0.65,
  [EXPLAINABILITY_CONFIDENCE.HIGH]: 0.85,
};

function normalizeConfidenceLabel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const allowed = new Set(Object.values(EXPLAINABILITY_CONFIDENCE));
  return allowed.has(normalized) ? normalized : EXPLAINABILITY_CONFIDENCE.MEDIUM;
}

function normalizeConfidenceScore(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, Number(value)));
  }

  const label = normalizeConfidenceLabel(value);
  return CONFIDENCE_TO_SCORE[label] ?? CONFIDENCE_TO_SCORE[EXPLAINABILITY_CONFIDENCE.MEDIUM];
}

function normalizeWhyFactors(input) {
  if (!Array.isArray(input)) return [];

  return input
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 5);
}

function normalizeTimeWindow(value, fallback = "current_cycle") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function normalizeBasedOn(input, fallbackFactors) {
  if (Array.isArray(input)) {
    const values = input
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .slice(0, 6);
    if (values.length > 0) return values;
  }

  if (Array.isArray(fallbackFactors) && fallbackFactors.length > 0) {
    return fallbackFactors.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 6);
  }

  return ["available context"];
}

function normalizeReason(value, fallbackFactors) {
  const direct = String(value || "").trim();
  if (direct) return direct;

  const firstFactor = Array.isArray(fallbackFactors) ? String(fallbackFactors[0] || "").trim() : "";
  if (firstFactor) {
    return `Output generated using ${firstFactor.toLowerCase()}.`;
  }

  return "Output generated from available context and role-aware patterns.";
}

export function buildExplainability({
  source = "openrouter_llm",
  confidence = EXPLAINABILITY_CONFIDENCE.MEDIUM,
  reason = "",
  based_on = [],
  whyFactors = [],
  timeWindow = "current_cycle",
  time_window,
}) {
  const safeFactors = normalizeWhyFactors(whyFactors);
  const basedOn = normalizeBasedOn(based_on, safeFactors);
  const normalizedTimeWindow = normalizeTimeWindow(time_window ?? timeWindow);
  const normalizedConfidence = normalizeConfidenceScore(confidence);
  const normalizedLabel = normalizeConfidenceLabel(confidence);
  const normalizedReason = normalizeReason(reason, basedOn);

  return {
    source: String(source || "openrouter_llm").trim() || "openrouter_llm",
    confidence: normalizedConfidence,
    confidenceLabel: normalizedLabel,
    reason: normalizedReason,
    based_on: basedOn,
    time_window: normalizedTimeWindow,
    whyFactors:
      safeFactors.length > 0
        ? safeFactors
        : ["Recommendation inferred from provided cycle context and role patterns."],
    timeWindow: normalizedTimeWindow,
  };
}

export function buildFallbackExplainability({
  reason = "Output generated from limited context.",
  confidence = 0.4,
  based_on = ["fallback context"],
  time_window = "current_cycle",
} = {}) {
  return buildExplainability({
    source: "fallback",
    confidence,
    reason,
    based_on,
    whyFactors: based_on,
    time_window,
  });
}
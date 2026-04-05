import { EXPLAINABILITY_CONFIDENCE } from "@/lib/appwriteSchema";

function normalizeConfidence(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const allowed = new Set(Object.values(EXPLAINABILITY_CONFIDENCE));
  return allowed.has(normalized) ? normalized : EXPLAINABILITY_CONFIDENCE.MEDIUM;
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

export function buildExplainability({
  source = "openrouter_llm",
  confidence = EXPLAINABILITY_CONFIDENCE.MEDIUM,
  whyFactors = [],
  timeWindow = "current_cycle",
}) {
  const safeFactors = normalizeWhyFactors(whyFactors);

  return {
    source: String(source || "openrouter_llm").trim() || "openrouter_llm",
    confidence: normalizeConfidence(confidence),
    whyFactors:
      safeFactors.length > 0
        ? safeFactors
        : ["Recommendation inferred from provided cycle context and role patterns."],
    timeWindow: normalizeTimeWindow(timeWindow),
  };
}
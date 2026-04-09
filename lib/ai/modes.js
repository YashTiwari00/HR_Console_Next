export const DEFAULT_MODE = "suggestion";

export const ROLES_ALLOWED_DECISION_SUPPORT = ["manager", "hr", "leadership"];

const DECISION_SUPPORT_LENS_BY_ROLE = {
  manager: "coaching and burnout risk lens",
  hr: "calibration and bias detection lens",
  leadership: "strategic talent and capability gaps lens",
};

export function resolveAiMode(requestedMode, userRole) {
  if (
    requestedMode === "decision_support"
    && ROLES_ALLOWED_DECISION_SUPPORT.includes(String(userRole || "").trim().toLowerCase())
  ) {
    return "decision_support";
  }

  return DEFAULT_MODE;
}

export function buildModeSystemSuffix(mode, role) {
  if (mode === "suggestion") {
    return [
      "Mode: suggestion.",
      "Keep responses short, friendly, and jargon-free.",
      "Limit the response to 3-4 sentences maximum.",
    ].join(" ");
  }

  const normalizedRole = String(role || "").trim().toLowerCase();
  const roleLens = DECISION_SUPPORT_LENS_BY_ROLE[normalizedRole] || "general decision-support lens";

  return [
    "Mode: decision_support.",
    "Provide a structured analysis with concise sections and clear reasoning.",
    `Apply a ${roleLens}.`,
    "End with an Explainability block containing: Contributing Factors, Time Window, Confidence Level (High/Medium/Low).",
  ].join(" ");
}
export type AiMode = "suggestion" | "decision_support";

export const DEFAULT_MODE: AiMode = "suggestion";

export const ROLES_ALLOWED_DECISION_SUPPORT = ["manager", "hr", "leadership"] as const;

const DECISION_SUPPORT_LENS_BY_ROLE: Record<string, string> = {
  manager: "coaching and burnout risk lens",
  hr: "calibration and bias detection lens",
  leadership: "strategic talent and capability gaps lens",
};

// Server-side enforcement gate for AI mode access.
export function resolveAiMode(requestedMode: string | undefined, userRole: string): AiMode {
  if (
    requestedMode === "decision_support"
    && ROLES_ALLOWED_DECISION_SUPPORT.includes(userRole as (typeof ROLES_ALLOWED_DECISION_SUPPORT)[number])
  ) {
    return "decision_support";
  }

  return DEFAULT_MODE;
}

export function buildModeSystemSuffix(mode: AiMode, role: string): string {
  if (mode === "suggestion") {
    return [
      "Mode: suggestion.",
      "Keep responses short, friendly, and jargon-free.",
      "Limit the response to 3-4 sentences maximum.",
    ].join(" ");
  }

  const roleLens = DECISION_SUPPORT_LENS_BY_ROLE[role] || "general decision-support lens";

  return [
    "Mode: decision_support.",
    "Provide a structured analysis with concise sections and clear reasoning.",
    `Apply a ${roleLens}.`,
    "End with an Explainability block containing: Contributing Factors, Time Window, Confidence Level (High/Medium/Low).",
  ].join(" ");
}
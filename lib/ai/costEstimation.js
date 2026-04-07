const DEFAULT_PROMPT_COST_PER_1K = 0.00015;
const DEFAULT_COMPLETION_COST_PER_1K = 0.0006;
const CHARS_PER_TOKEN = 4;

function normalizeNonNegativeNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function roundCurrency(value) {
  return Number(normalizeNonNegativeNumber(value, 0).toFixed(6));
}

function normalizeTokenCount(value) {
  return Math.max(0, Math.round(normalizeNonNegativeNumber(value, 0)));
}

function parseRate(rawValue, fallback) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function normalizeContentToText(content) {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .join("\n");
  }

  if (content == null) return "";
  return String(content);
}

function getPromptText(messages) {
  if (!Array.isArray(messages)) return "";

  return messages
    .map((message) => normalizeContentToText(message?.content))
    .join("\n");
}

export function getAiTokenPricing() {
  return {
    promptCostPer1k: parseRate(process.env.AI_COST_PER_1K_PROMPT, DEFAULT_PROMPT_COST_PER_1K),
    completionCostPer1k: parseRate(process.env.AI_COST_PER_1K_COMPLETION, DEFAULT_COMPLETION_COST_PER_1K),
  };
}

export function normalizeProviderTokenUsage(providerUsage) {
  if (!providerUsage || typeof providerUsage !== "object") {
    return null;
  }

  const promptTokens = normalizeTokenCount(
    providerUsage.prompt_tokens ?? providerUsage.promptTokens ?? providerUsage.input_tokens
  );
  const completionTokens = normalizeTokenCount(
    providerUsage.completion_tokens ?? providerUsage.completionTokens ?? providerUsage.output_tokens
  );
  const totalTokens = normalizeTokenCount(
    providerUsage.total_tokens ?? providerUsage.totalTokens ?? promptTokens + completionTokens
  );

  if (promptTokens === 0 && completionTokens === 0 && totalTokens === 0) {
    return null;
  }

  return {
    promptTokens,
    completionTokens,
    totalTokens: totalTokens > 0 ? totalTokens : promptTokens + completionTokens,
  };
}

export function estimateTokensFromLength(text) {
  const normalized = normalizeContentToText(text);
  if (!normalized) return 0;
  return Math.max(1, Math.ceil(normalized.length / CHARS_PER_TOKEN));
}

export function calculateEstimatedCost({
  promptTokens,
  completionTokens,
  promptCostPer1k,
  completionCostPer1k,
}) {
  const normalizedPrompt = normalizeTokenCount(promptTokens);
  const normalizedCompletion = normalizeTokenCount(completionTokens);
  const promptCost = (normalizedPrompt / 1000) * normalizeNonNegativeNumber(promptCostPer1k, 0);
  const completionCost =
    (normalizedCompletion / 1000) * normalizeNonNegativeNumber(completionCostPer1k, 0);

  return roundCurrency(promptCost + completionCost);
}

export function buildAiUsageDelta({ providerUsage, messages, completionText }) {
  const pricing = getAiTokenPricing();
  const promptText = getPromptText(messages);

  const fromProvider = normalizeProviderTokenUsage(providerUsage);

  const promptTokens = fromProvider
    ? fromProvider.promptTokens
    : estimateTokensFromLength(promptText);

  const completionTokens = fromProvider
    ? fromProvider.completionTokens
    : estimateTokensFromLength(completionText);

  const totalTokens = fromProvider
    ? fromProvider.totalTokens
    : normalizeTokenCount(promptTokens + completionTokens);

  return {
    tokensUsed: totalTokens,
    estimatedCost: calculateEstimatedCost({
      promptTokens,
      completionTokens,
      promptCostPer1k: pricing.promptCostPer1k,
      completionCostPer1k: pricing.completionCostPer1k,
    }),
    promptTokens,
    completionTokens,
    totalTokens,
    tokenSource: fromProvider ? "provider" : "estimated",
  };
}

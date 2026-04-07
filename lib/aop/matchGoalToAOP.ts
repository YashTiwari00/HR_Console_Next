type MatchInput = {
  title?: string | null;
  description?: string | null;
  aopContent?: string | null;
};

type MatchResult = {
  isAligned: boolean;
  reference: string;
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "to",
  "with",
]);

function normalizeText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: unknown) {
  const normalized = normalizeText(value);
  if (!normalized) return [] as string[];

  return normalized
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

export function matchGoalToAOP(input: MatchInput): MatchResult {
  try {
    const goalTokens = new Set([...tokenize(input.title), ...tokenize(input.description)]);
    const aopTokens = new Set(tokenize(input.aopContent));

    if (goalTokens.size === 0 || aopTokens.size === 0) {
      return { isAligned: false, reference: "" };
    }

    const overlap = [...goalTokens].filter((token) => aopTokens.has(token));
    const overlapCount = overlap.length;
    const overlapRatio = overlapCount / Math.max(1, goalTokens.size);

    const isAligned = overlapCount >= 2 && overlapRatio >= 0.15;

    if (!isAligned) {
      return { isAligned: false, reference: "" };
    }

    const themes = overlap.slice(0, 4).join(", ");
    return {
      isAligned: true,
      reference: themes
        ? `Keyword overlap with AOP themes: ${themes}.`
        : "Goal text aligns with current AOP themes.",
    };
  } catch {
    return { isAligned: false, reference: "" };
  }
}

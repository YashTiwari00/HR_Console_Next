import { callOpenRouterWithUsage } from "@/lib/openrouter";

export type AnalyzeRole = "manager" | "employee";

export interface AnalyzeGoalInput {
  title: string;
  description: string;
  weight: number;
}

export interface AllocationSuggestion {
  suggestedUsers: number;
  split: number[];
}

export interface AnalyzedGoal {
  originalTitle: string;
  improvedTitle: string;
  improvedDescription: string;
  suggestedMetrics: string;
  allocationSuggestions: AllocationSuggestion[];
}

export interface AnalyzeGoalsResult {
  goals: AnalyzedGoal[];
  fallbackUsed: boolean;
  usageMeta?: {
    providerUsage: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    } | null;
    messages: Array<{ role: string; content: string }>;
    completionText: string;
  };
}

function normalizeWeight(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}

function normalizeInputGoal(input: unknown): AnalyzeGoalInput {
  const goal = input as Record<string, unknown>;
  return {
    title: String(goal?.title ?? "").trim(),
    description: String(goal?.description ?? "").trim(),
    weight: normalizeWeight(goal?.weight ?? goal?.weightage),
  };
}

function safeJsonParse(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function normalizeSplit(rawSplit: unknown, suggestedUsers: number): number[] {
  if (!Array.isArray(rawSplit) || rawSplit.length === 0) {
    return suggestedUsers > 0 ? [100] : [];
  }

  const parsed = rawSplit
    .map((value) => Number.parseInt(String(value), 10))
    .filter((value) => Number.isInteger(value) && value >= 0);

  if (parsed.length === 0) {
    return suggestedUsers > 0 ? [100] : [];
  }

  const total = parsed.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return suggestedUsers > 0 ? [100] : [];
  }

  // Keep percentages deterministic and sum-adjusted.
  const normalized = parsed.map((value) => Math.round((value / total) * 100));
  const normalizedTotal = normalized.reduce((sum, value) => sum + value, 0);
  if (normalizedTotal !== 100 && normalized.length > 0) {
    normalized[0] += 100 - normalizedTotal;
  }

  return normalized;
}

function normalizeAllocationSuggestions(input: unknown): AllocationSuggestion[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((entry) => {
      const value = entry as Record<string, unknown>;
      const suggestedUsers = Math.max(
        1,
        Number.parseInt(String(value?.suggestedUsers ?? "1"), 10) || 1
      );
      return {
        suggestedUsers,
        split: normalizeSplit(value?.split, suggestedUsers),
      };
    })
    .slice(0, 3);
}

function fallbackGoals(goals: AnalyzeGoalInput[], role: AnalyzeRole): AnalyzedGoal[] {
  return goals.map((goal) => ({
    originalTitle: goal.title,
    improvedTitle: goal.title,
    improvedDescription: goal.description,
    suggestedMetrics: "No AI metric suggestion available. Keep this goal measurable with clear KPI targets.",
    allocationSuggestions:
      role === "manager"
        ? [
            {
              suggestedUsers: 1,
              split: [100],
            },
          ]
        : [],
  }));
}

function normalizeGoalResult(rawGoal: unknown, fallbackGoal: AnalyzeGoalInput, role: AnalyzeRole): AnalyzedGoal {
  const value = rawGoal as Record<string, unknown>;

  const improvedTitle = String(value?.improvedTitle ?? "").trim() || fallbackGoal.title;
  const improvedDescription =
    String(value?.improvedDescription ?? "").trim() || fallbackGoal.description;
  const suggestedMetrics =
    String(value?.suggestedMetrics ?? "").trim() ||
    "Define at least one measurable KPI and completion deadline.";

  return {
    originalTitle: String(value?.originalTitle ?? "").trim() || fallbackGoal.title,
    improvedTitle,
    improvedDescription,
    suggestedMetrics,
    allocationSuggestions:
      role === "manager"
        ? normalizeAllocationSuggestions(value?.allocationSuggestions)
        : [],
  };
}

function buildPrompt(goals: AnalyzeGoalInput[], role: AnalyzeRole): string {
  return [
    "Analyze and improve these performance goals.",
    "Requirements:",
    "1) Convert each goal into stronger SMART wording.",
    "2) Improve clarity and measurable outcomes.",
    "3) Add metrics if missing.",
    role === "manager"
      ? "4) Also add allocation suggestions: split into sub-task staffing guidance with suggestedUsers and split percentages."
      : "4) Do NOT include allocation suggestions for employees.",
    "Return strict JSON only with this exact shape:",
    '{"goals":[{"originalTitle":"...","improvedTitle":"...","improvedDescription":"...","suggestedMetrics":"...","allocationSuggestions":[{"suggestedUsers":2,"split":[50,50]}]}]}',
    "Input goals:",
    JSON.stringify(goals, null, 2),
  ].join("\n");
}

export async function analyzeGoalsWithAi({
  goals,
  role,
}: {
  goals: unknown[];
  role: AnalyzeRole;
}): Promise<AnalyzeGoalsResult> {
  const normalizedInput = (Array.isArray(goals) ? goals : [])
    .map((goal) => normalizeInputGoal(goal))
    .filter((goal) => goal.title && goal.description)
    .slice(0, 10);

  if (normalizedInput.length === 0) {
    return { goals: [], fallbackUsed: false };
  }

  if (normalizedInput.length > 10) {
    throw new Error("Maximum 10 goals are allowed per request.");
  }

  const fallback = fallbackGoals(normalizedInput, role);

  try {
    const messages = [
      {
        role: "system",
        content:
          "You are a performance management expert. Always output strict JSON only, no markdown.",
      },
      {
        role: "user",
        content: buildPrompt(normalizedInput, role),
      },
    ];

    const completion = await callOpenRouterWithUsage({
      messages,
      jsonMode: true,
      maxTokens: 900,
    });

    const raw = completion.content;

    const parsed = safeJsonParse(raw) as { goals?: unknown[] } | null;

    if (!parsed || !Array.isArray(parsed.goals) || parsed.goals.length === 0) {
      return {
        goals: fallback,
        fallbackUsed: true,
        usageMeta: {
          providerUsage: completion.usage,
          messages,
          completionText: raw,
        },
      };
    }

    const normalizedGoals = normalizedInput.map((baseGoal, index) =>
      normalizeGoalResult(parsed.goals?.[index], baseGoal, role)
    );

    return {
      goals: normalizedGoals,
      fallbackUsed: false,
      usageMeta: {
        providerUsage: completion.usage,
        messages,
        completionText: raw,
      },
    };
  } catch {
    return {
      goals: fallback,
      fallbackUsed: true,
    };
  }
}

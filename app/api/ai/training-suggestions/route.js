import { NextResponse } from "next/server";

import { assertAndTrackAiUsage as checkAndIncrementUsageInternal } from "@/app/api/ai/_lib/aiUsage.js";
import { callOpenRouter } from "@/lib/openrouter";
import { requireAuth, requireRole } from "@/lib/serverAuth";
import { buildModeSystemSuffix, resolveAiMode } from "@/lib/ai/modes.js";

const SYSTEM_PROMPT = `You are an expert L&D (Learning & Development) advisor for a corporate HR team.
Your job is to analyze employee performance weak areas and suggest targeted, practical training programs.
Be specific, realistic, and actionable. Avoid generic suggestions.
Always return valid JSON only - no markdown, no explanation outside the JSON.`;

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeWeakGoalTitle(goal) {
  if (typeof goal === "string") {
    return normalizeText(goal);
  }

  if (goal && typeof goal === "object") {
    return normalizeText(goal.title);
  }

  return "";
}

function stripJsonFences(raw) {
  const text = normalizeText(raw);
  if (!text) return "";

  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function normalizePriority(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "high") return "High";
  if (normalized === "medium") return "Medium";
  if (normalized === "low") return "Low";
  return "Medium";
}

async function checkAndIncrementUsage(userId, featureType, cycleId, context) {
  try {
    await checkAndIncrementUsageInternal({
      databases: context.databases,
      userId,
      cycleId,
      featureType,
      userRole: context.userRole,
      resolvedMode: context.resolvedMode,
    });

    return { allowed: true };
  } catch (error) {
    if (error?.statusCode === 429) {
      return { allowed: false };
    }

    throw error;
  }
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    const body = await request.json().catch(() => ({}));

    const employeeId = normalizeText(body.employeeId);
    const employeeName = normalizeText(body.employeeName);
    const department = normalizeText(body.department);
    const cycleId = normalizeText(body.cycleId);
    const weakGoals = Array.isArray(body.weakGoals) ? body.weakGoals : [];
    const rawMode = body?.mode ?? "suggestion";
    const mode = resolveAiMode(rawMode, profile.role);

    if (!employeeId || !employeeName || !cycleId) {
      return NextResponse.json(
        { error: "employeeId, employeeName, and cycleId are required" },
        { status: 400 }
      );
    }

    const weakGoalLines = weakGoals
      .map((goal) => normalizeWeakGoalTitle(goal))
      .filter(Boolean)
      .join("\n");

    if (!weakGoalLines) {
      return NextResponse.json(
        { error: "weakGoals must include at least one valid goal title" },
        { status: 400 }
      );
    }

    const usageCheck = await checkAndIncrementUsage(profile.$id, "training_suggestions", cycleId, {
      databases,
      userRole: profile.role,
      resolvedMode: mode,
    });
    if (!usageCheck.allowed) {
      return NextResponse.json({ error: "AI usage limit reached for this cycle", limitReached: true }, { status: 429 });
    }

    const userPrompt = `Employee: ${employeeName} | Department: ${department || "Unknown"}
Weak performance areas identified from goal ratings (SME/NI ratings):
${weakGoalLines}

Return a JSON array of training suggestions. Each item must have:
- weakArea: string (the identified skill/knowledge gap from the goal title)
- suggestedTraining: string (specific course name, certification, or program type)
- priority: 'High' | 'Medium' | 'Low'
- rationale: string (1 sentence why this training addresses the gap)

Return ONLY valid JSON array, nothing else.`;

    const aiContent = await callOpenRouter({
      messages: [
        { role: "system", content: `${SYSTEM_PROMPT}\n${buildModeSystemSuffix(mode, profile.role)}` },
        { role: "user", content: userPrompt },
      ],
      maxTokens: mode === "decision_support" ? 2000 : 800,
    });

    const cleaned = stripJsonFences(aiContent);

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: "AI response parsing failed" }, { status: 500 });
    }

    if (!Array.isArray(parsed)) {
      return NextResponse.json({ error: "AI response parsing failed" }, { status: 500 });
    }

    const suggestions = parsed.map((item) => ({
      weakArea: normalizeText(item?.weakArea),
      suggestedTraining: normalizeText(item?.suggestedTraining),
      priority: normalizePriority(item?.priority),
      rationale: normalizeText(item?.rationale),
    }));

    return NextResponse.json({
      employeeId,
      suggestions,
    });
  } catch (error) {
    const status = error?.statusCode || 500;
    const message = error?.message || "Unexpected server error.";
    return NextResponse.json({ error: message }, { status });
  }
}

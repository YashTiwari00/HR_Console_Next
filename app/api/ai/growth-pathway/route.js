import { NextResponse } from "next/server";

import { checkUsageAndIncrement } from "@/app/api/ai/_lib/aiUsage.js";
import { callOpenRouterWithUsage } from "@/lib/openrouter";
import { requireAuth, requireRole } from "@/lib/serverAuth";

const CAP_PER_CYCLE = 3;
const MAX_FIELD_CHARS = 200;
const MAX_ROLE_CHARS = 100;

const SYSTEM_PROMPT = `You are a career development coach for a professional performance management system.
You give encouraging, practical, and specific career pathway suggestions.
You NEVER mention numeric ratings, scores, or stack rankings.
You speak directly to the employee in second person ("You have shown...").
Your tone is warm, growth-focused, and actionable.
Keep your response concise: 3 sections max, 4-6 bullet points total.
Always end with one specific "Next Step" recommendation.`;

function sanitizeText(value, max = MAX_FIELD_CHARS) {
  return String(value || "").trim().slice(0, max);
}

function sanitizeCycleHistory(value) {
  if (!Array.isArray(value)) return null;

  const normalized = value
    .map((item) => ({
      cycleName: sanitizeText(item?.cycleName),
      scoreLabel: sanitizeText(item?.scoreLabel),
    }))
    .filter((item) => item.cycleName || item.scoreLabel);

  return normalized;
}

function sanitizeTnaItems(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => ({
      area: sanitizeText(item?.area),
      signal: sanitizeText(item?.signal),
    }))
    .filter((item) => item.area || item.signal);
}

function buildUserPrompt({ role, department, cycleHistory, tnaItems, readinessLabel }) {
  const trendLabels = cycleHistory
    .map((item) => sanitizeText(item?.scoreLabel))
    .filter(Boolean)
    .reverse();

  const trendText = trendLabels.length > 0 ? trendLabels.join(" -> ") : "No recent labels available";

  const developmentAreas = tnaItems
    .map((item) => sanitizeText(item?.area))
    .filter(Boolean)
    .join(", ");

  return `Employee profile:
- Current role: ${role}
- Department: ${department}
- Recent performance trend: ${trendText} (most recent last)
- Current readiness level: ${readinessLabel}
- Development areas identified: ${developmentAreas || "None identified yet"}

Based on this profile, suggest:
1. A realistic career pathway (next 1-2 roles, not just a generic ladder)
2. The top 2-3 skills to focus on for progression
3. One specific next step they can take this quarter

Be specific to their role and department. Be encouraging. Do not mention ratings or scores.`;
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee"]);

    const body = await request.json().catch(() => ({}));

    const cycleId = sanitizeText(body?.cycleId);
    const role = sanitizeText(body?.role, MAX_ROLE_CHARS);
    const department = sanitizeText(body?.department);
    const readinessLabel = sanitizeText(body?.readinessLabel);
    const cycleHistory = sanitizeCycleHistory(body?.cycleHistory);
    const tnaItems = sanitizeTnaItems(body?.tnaItems);

    if (!cycleId) {
      return NextResponse.json({ error: "cycleId is required" }, { status: 400 });
    }

    if (!role) {
      return NextResponse.json({ error: "role is required" }, { status: 400 });
    }

    if (!Array.isArray(cycleHistory)) {
      return NextResponse.json({ error: "cycleHistory must be an array" }, { status: 400 });
    }

    const usage = await checkUsageAndIncrement({
      databases,
      userId: profile.$id,
      featureType: "growth_pathway",
      cycleId,
      cap: CAP_PER_CYCLE,
    });

    if (!usage.allowed) {
      return NextResponse.json(
        {
          error: "AI usage limit reached for this cycle",
          usedCount: usage.count,
          cap: CAP_PER_CYCLE,
        },
        { status: 429 }
      );
    }

    const userPrompt = buildUserPrompt({
      role,
      department,
      cycleHistory,
      tnaItems,
      readinessLabel,
    });

    let completion;
    try {
      completion = await callOpenRouterWithUsage({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        jsonMode: false,
        maxTokens: 800,
      });
    } catch {
      return NextResponse.json(
        { error: "AI service temporarily unavailable" },
        { status: 503 }
      );
    }

    return NextResponse.json({
      pathway: sanitizeText(completion?.content, 4000),
    });
  } catch (error) {
    const status = error?.statusCode || 500;
    const message = error?.message || "Unexpected server error.";
    return NextResponse.json({ error: message }, { status });
  }
}

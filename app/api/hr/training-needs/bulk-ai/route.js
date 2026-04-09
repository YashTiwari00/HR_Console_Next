import { NextResponse } from "next/server";

import { appwriteConfig } from "@/lib/appwrite";
import { ID, Query, databaseId } from "@/lib/appwriteServer";
import { callOpenRouter } from "@/lib/openrouter";
import { requireAuth, requireRole } from "@/lib/serverAuth";

const MAX_EMPLOYEES = 20;
const BULK_CAP_PER_CYCLE = 2;
const FEATURE_TYPE = "training_suggestions_bulk";

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

async function checkAndIncrementBulkUsage(databases, userId, cycleId) {
  const result = await databases.listDocuments(
    databaseId,
    appwriteConfig.aiEventsCollectionId,
    [
      Query.equal("userId", userId),
      Query.equal("cycleId", cycleId),
      Query.equal("featureType", FEATURE_TYPE),
      Query.limit(1),
    ]
  );

  const existing = result.documents[0] || null;
  const currentCount = Number(existing?.requestCount || 0);

  if (currentCount >= BULK_CAP_PER_CYCLE) {
    return { allowed: false };
  }

  const nextCount = currentCount + 1;
  const payload = {
    requestCount: nextCount,
    lastUsedAt: new Date().toISOString(),
  };

  if (existing?.$id) {
    await databases.updateDocument(
      databaseId,
      appwriteConfig.aiEventsCollectionId,
      existing.$id,
      payload
    );
  } else {
    await databases.createDocument(
      databaseId,
      appwriteConfig.aiEventsCollectionId,
      ID.unique(),
      {
        userId,
        featureType: FEATURE_TYPE,
        cycleId,
        requestCount: 1,
        lastUsedAt: new Date().toISOString(),
        metadata: "{}",
        tokensUsed: 0,
        estimatedCost: 0,
      }
    );
  }

  return {
    allowed: true,
    used: nextCount,
    limit: BULK_CAP_PER_CYCLE,
  };
}

async function generateSuggestionsForEmployee(employeeName, department, weakGoals) {
  const weakGoalLines = weakGoals
    .map((goal) => normalizeWeakGoalTitle(goal))
    .filter(Boolean)
    .join("\n");

  if (!weakGoalLines) {
    return [];
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
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    maxTokens: 700,
  });

  const parsed = JSON.parse(stripJsonFences(aiContent));
  if (!Array.isArray(parsed)) {
    throw new Error("AI response parsing failed");
  }

  return parsed.map((item) => ({
    weakArea: normalizeText(item?.weakArea),
    suggestedTraining: normalizeText(item?.suggestedTraining),
    priority: normalizePriority(item?.priority),
    rationale: normalizeText(item?.rationale),
  }));
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    const body = await request.json().catch(() => ({}));
    const employees = Array.isArray(body?.employees) ? body.employees : [];
    const cycleId = normalizeText(body?.cycleId);

    if (!cycleId) {
      return NextResponse.json({ error: "cycleId is required" }, { status: 400 });
    }

    if (employees.length > MAX_EMPLOYEES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_EMPLOYEES} employees per bulk call` },
        { status: 400 }
      );
    }

    const usageCheck = await checkAndIncrementBulkUsage(databases, profile.$id, cycleId);
    if (!usageCheck.allowed) {
      return NextResponse.json(
        { error: "AI usage limit reached for this cycle", limitReached: true },
        { status: 429 }
      );
    }

    const results = [];

    for (const employee of employees) {
      const employeeId = normalizeText(employee?.employeeId);
      const employeeName = normalizeText(employee?.employeeName) || "Unknown";
      const department = normalizeText(employee?.department) || "-";
      const weakGoals = Array.isArray(employee?.weakGoals) ? employee.weakGoals : [];

      try {
        const suggestions = await generateSuggestionsForEmployee(
          employeeName,
          department,
          weakGoals
        );

        results.push({
          employeeId,
          employeeName,
          suggestions,
        });
      } catch {
        results.push({
          employeeId,
          employeeName,
          suggestions: [],
          error: "AI generation failed",
        });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    const status = error?.statusCode || 500;
    const message = error?.message || "Unexpected server error.";
    return NextResponse.json({ error: message }, { status });
  }
}

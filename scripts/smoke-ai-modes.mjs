import { Client, Databases, Query, Users } from "node-appwrite";

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.NEXT_PUBLIC_DATABASE_ID;
const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3000";

const collectionIds = {
  users: process.env.NEXT_PUBLIC_USERS_COLLECTION_ID || "users",
  goals: process.env.NEXT_PUBLIC_GOALS_COLLECTION_ID || "goals",
  goalCycles: process.env.NEXT_PUBLIC_GOAL_CYCLES_COLLECTION_ID || "goal_cycles",
};

function assertEnv() {
  const missing = [];
  if (!endpoint) missing.push("NEXT_PUBLIC_APPWRITE_ENDPOINT");
  if (!projectId) missing.push("NEXT_PUBLIC_APPWRITE_PROJECT_ID");
  if (!apiKey) missing.push("APPWRITE_API_KEY");
  if (!databaseId) missing.push("NEXT_PUBLIC_DATABASE_ID");

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

function adminClients() {
  assertEnv();
  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  return {
    databases: new Databases(client),
    users: new Users(client),
  };
}

async function listAllDocuments(databases, collectionId, queries = []) {
  const batchSize = 100;
  let offset = 0;
  const all = [];

  while (true) {
    const response = await databases.listDocuments(databaseId, collectionId, [
      ...queries,
      Query.limit(batchSize),
      Query.offset(offset),
    ]);

    all.push(...(response.documents || []));
    if ((response.documents || []).length < batchSize) break;
    offset += batchSize;
  }

  return all;
}

function normalize(value) {
  return String(value || "").trim();
}

function toResult(name, pass, details) {
  return { name, pass, details };
}

function asJsonSafe(payload) {
  try {
    return JSON.parse(JSON.stringify(payload));
  } catch {
    return null;
  }
}

function modeProbePrompt() {
  return [
    "Within HR Console context, summarize what a manager should do before a check-in.",
    "Keep it concise and practical.",
  ].join(" ");
}

function buildCookieHeader(sessionToken) {
  return `a_session_${projectId}=${encodeURIComponent(sessionToken)}`;
}

async function waitMs(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function shouldRetryStatus(status) {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

async function fetchWithRetry(url, options, retryConfig = {}) {
  const maxAttempts = Number(retryConfig.maxAttempts || 3);
  const baseDelayMs = Number(retryConfig.baseDelayMs || 400);

  let lastResponse = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(url, options);
    lastResponse = response;

    if (!shouldRetryStatus(response.status) || attempt === maxAttempts) {
      return response;
    }

    await waitMs(baseDelayMs * attempt);
  }

  return lastResponse;
}

function computeRichnessScore(data) {
  const rawSummary = data?.summary;
  const summary = typeof rawSummary === "string"
    ? normalize(rawSummary)
    : rawSummary && typeof rawSummary === "object"
      ? normalize(JSON.stringify(rawSummary))
      : normalize(rawSummary);
  const insightsCount = Array.isArray(data?.insights) ? data.insights.length : 0;
  const highlightsCount = Array.isArray(data?.highlights) ? data.highlights.length : 0;
  const blockersCount = Array.isArray(data?.blockers) ? data.blockers.length : 0;
  const nextActionsCount = Array.isArray(data?.nextActions) ? data.nextActions.length : 0;

  const sectionMarker = /(key themes|progress assessment|risk signals|recommended next actions|contributing factors|confidence level)/i.test(
    summary
  )
    ? 1
    : 0;

  return (
    Math.floor(summary.length / 60) +
    insightsCount * 2 +
    highlightsCount +
    blockersCount +
    nextActionsCount * 2 +
    sectionMarker * 3
  );
}

function extractSummaryText(data) {
  const rawSummary = data?.summary;
  if (typeof rawSummary === "string") return normalize(rawSummary);
  if (rawSummary && typeof rawSummary === "object") return normalize(JSON.stringify(rawSummary));
  return normalize(rawSummary);
}

async function main() {
  const { databases, users } = adminClients();
  const profiles = await listAllDocuments(databases, collectionIds.users);

  const employee = profiles.find((item) => normalize(item.role).toLowerCase() === "employee");
  const manager = profiles.find((item) => normalize(item.role).toLowerCase() === "manager");
  const hr = profiles.find((item) => normalize(item.role).toLowerCase() === "hr");

  if (!employee || !manager || !hr) {
    throw new Error("Required seeded employee/manager/hr profiles not found.");
  }

  const activeCycles = await listAllDocuments(databases, collectionIds.goalCycles, [
    Query.equal("state", "active"),
    Query.limit(25),
  ]);

  const selectedCycle = activeCycles[0];
  if (!selectedCycle) {
    throw new Error("No active cycle found for AI mode smoke tests.");
  }

  const goals = await listAllDocuments(databases, collectionIds.goals, [Query.limit(400)]);
  const managerTeamGoal = goals.find(
    (goal) =>
      normalize(goal.managerId) === normalize(manager.$id) &&
      normalize(goal.employeeId) &&
      normalize(goal.cycleId)
  );

  if (!managerTeamGoal) {
    throw new Error("No manager-team goal found for check-in summary smoke test.");
  }

  const sessionCache = new Map();
  const createdSessionIds = [];

  async function sessionForUser(userId) {
    if (sessionCache.has(userId)) return sessionCache.get(userId);

    const session = await users.createSession(userId);
    const token = session.secret || session.$id;
    if (!token) {
      throw new Error(`No usable session token generated for user ${userId}`);
    }

    sessionCache.set(userId, token);
    if (session.$id) createdSessionIds.push(session.$id);
    return token;
  }

  async function chatCall({ userId, role, mode }) {
    const sessionToken = await sessionForUser(userId);
    const response = await fetchWithRetry(`${baseUrl}/api/ai/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: buildCookieHeader(sessionToken),
      },
      body: JSON.stringify({
        role,
        mode,
        messages: [{ role: "user", content: modeProbePrompt() }],
      }),
    });

    const text = await response.text();
    return {
      status: response.status,
      text,
    };
  }

  async function usageModeCall({ userId, mode }) {
    const sessionToken = await sessionForUser(userId);
    const response = await fetchWithRetry(`${baseUrl}/api/ai/usage?mode=${encodeURIComponent(mode)}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        cookie: buildCookieHeader(sessionToken),
      },
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    return {
      status: response.status,
      payload,
      currentMode: normalize(payload?.data?.currentMode),
    };
  }

  async function checkinSummaryCall({ userId, mode, goal, notes }) {
    const sessionToken = await sessionForUser(userId);
    const response = await fetchWithRetry(`${baseUrl}/api/ai/checkin-summary`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: buildCookieHeader(sessionToken),
      },
      body: JSON.stringify({
        cycleId: normalize(goal.cycleId) || normalize(selectedCycle.$id),
        goalId: normalize(goal.$id),
        employeeId: normalize(goal.employeeId),
        goalTitle: normalize(goal.title),
        notes,
        mode,
      }),
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    return {
      status: response.status,
      payload,
      data: payload?.data || null,
      summaryLength: normalize(payload?.data?.summary).length,
      richnessScore: computeRichnessScore(payload?.data || {}),
    };
  }

  async function goalSuggestionCall({ userId, mode }) {
    const sessionToken = await sessionForUser(userId);
    const response = await fetchWithRetry(`${baseUrl}/api/ai/goal-suggestion`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: buildCookieHeader(sessionToken),
      },
      body: JSON.stringify({
        cycleId: normalize(selectedCycle.$id),
        frameworkType: "OKR",
        prompt: `SMOKE-MODES-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        mode,
      }),
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const suggestions = Array.isArray(payload?.data?.suggestions) ? payload.data.suggestions : [];

    return {
      status: response.status,
      payload,
      suggestions,
    };
  }

  const results = [];

  const employeeChat = await chatCall({
    userId: employee.$id,
    role: "employee",
    mode: "decision_support",
  });
  const employeeUsageMode = await usageModeCall({
    userId: employee.$id,
    mode: "decision_support",
  });
  results.push(
    toResult(
      "Employee /api/ai/chat decision_support coerces to suggestion (no 403)",
      employeeChat.status === 200 && employeeUsageMode.status === 200 && employeeUsageMode.currentMode === "suggestion",
      {
        chatStatus: employeeChat.status,
        usageStatus: employeeUsageMode.status,
        expectedStatus: 200,
        resolvedMode: employeeUsageMode.currentMode,
        chatSample: normalize(employeeChat.text).slice(0, 240),
      }
    )
  );

  const managerChat = await chatCall({
    userId: manager.$id,
    role: "manager",
    mode: "decision_support",
  });
  const managerUsageMode = await usageModeCall({
    userId: manager.$id,
    mode: "decision_support",
  });
  results.push(
    toResult(
      "Manager /api/ai/chat decision_support honored",
      managerChat.status === 200 && managerUsageMode.status === 200 && managerUsageMode.currentMode === "decision_support",
      {
        chatStatus: managerChat.status,
        usageStatus: managerUsageMode.status,
        expectedStatus: 200,
        resolvedMode: managerUsageMode.currentMode,
        chatSample: normalize(managerChat.text).slice(0, 240),
      }
    )
  );

  const summarySuggestion = await checkinSummaryCall({
    userId: manager.$id,
    mode: "suggestion",
    goal: managerTeamGoal,
    notes: "Quick summary request for smoke baseline. Keep this compact.",
  });

  const summaryDecision = await checkinSummaryCall({
    userId: manager.$id,
    mode: "decision_support",
    goal: managerTeamGoal,
    notes:
      "Please include key themes, progress assessment, risk signals, and recommended next actions. Add clear reasoning from available evidence.",
  });

  const decisionHasStructure =
    Array.isArray(summaryDecision?.data?.insights) && summaryDecision.data.insights.length > 0 &&
    Array.isArray(summaryDecision?.data?.nextActions) && summaryDecision.data.nextActions.length > 0;
  const richerByScore = summaryDecision.richnessScore >= summarySuggestion.richnessScore;
  const richerByLength = summaryDecision.summaryLength >= summarySuggestion.summaryLength;
  const sufficientlyRichAbsolute = summaryDecision.summaryLength >= 80 && summaryDecision.richnessScore >= 4;
  results.push(
    toResult(
      "Manager /api/ai/checkin-summary decision_support is richer than suggestion",
      summarySuggestion.status === 200
        && summaryDecision.status === 200
        && decisionHasStructure
        && (richerByScore || richerByLength || sufficientlyRichAbsolute),
      {
        baselineStatus: summarySuggestion.status,
        decisionStatus: summaryDecision.status,
        baselineSummaryLength: summarySuggestion.summaryLength,
        decisionSummaryLength: summaryDecision.summaryLength,
        baselineRichnessScore: summarySuggestion.richnessScore,
        decisionRichnessScore: summaryDecision.richnessScore,
        decisionHasStructure,
        baselineSample: extractSummaryText(summarySuggestion?.data).slice(0, 240),
        decisionSample: extractSummaryText(summaryDecision?.data).slice(0, 240),
      }
    )
  );

  const managerGoalSuggestions = await goalSuggestionCall({
    userId: manager.$id,
    mode: "decision_support",
  });

  const hasFrameworkAndWeightage = managerGoalSuggestions.suggestions.some((item) => {
    const framework = normalize(item?.framework).toUpperCase();
    const weightage = Number(item?.weightage);
    const weightageJustification = normalize(item?.weightageJustification);
    return (
      ["OKR", "MBO", "HYBRID"].includes(framework) &&
      Number.isFinite(weightage) &&
      weightage > 0 &&
      Boolean(weightageJustification)
    );
  });

  results.push(
    toResult(
      "Manager /api/ai/goal-suggestion decision_support includes framework + weightage fields",
      managerGoalSuggestions.status === 200 && managerGoalSuggestions.suggestions.length > 0 && hasFrameworkAndWeightage,
      {
        status: managerGoalSuggestions.status,
        expectedStatus: 200,
        suggestionsCount: managerGoalSuggestions.suggestions.length,
        source: normalize(managerGoalSuggestions?.payload?.source || managerGoalSuggestions?.payload?.data?.source),
        sampleSuggestion: asJsonSafe(managerGoalSuggestions.suggestions[0] || null),
      }
    )
  );

  const hrChat = await chatCall({
    userId: hr.$id,
    role: "hr",
    mode: "decision_support",
  });
  const hrUsageMode = await usageModeCall({
    userId: hr.$id,
    mode: "decision_support",
  });
  results.push(
    toResult(
      "HR /api/ai/chat decision_support works",
      hrChat.status === 200 && hrUsageMode.status === 200 && hrUsageMode.currentMode === "decision_support",
      {
        chatStatus: hrChat.status,
        usageStatus: hrUsageMode.status,
        expectedStatus: 200,
        resolvedMode: hrUsageMode.currentMode,
        chatSample: normalize(hrChat.text).slice(0, 240),
      }
    )
  );

  const failed = results.filter((item) => !item.pass);
  for (const result of results) {
    const marker = result.pass ? "PASS" : "FAIL";
    console.log(`[${marker}] ${result.name}`);
    if (!result.pass) {
      console.log(JSON.stringify(result.details, null, 2));
    }
  }

  for (const sessionId of createdSessionIds) {
    try {
      await users.deleteSession(sessionId);
    } catch {
      // Ignore cleanup errors.
    }
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("AI modes smoke test failed:", error?.message || error);
  process.exitCode = 1;
});

import { appwriteConfig } from "@/lib/appwrite";
import { ID, Query, databaseId } from "@/lib/appwriteServer";
import {
  getDefaultAiCaps,
  listActiveAiPolicies,
  resolveAiPolicyConfig,
} from "@/app/api/ai/_lib/aiPolicy";
import {
  calculateTotalCost,
  isNearBudget,
  isOverBudget,
  normalizeBudgetThreshold,
} from "@/app/api/ai/_lib/aiBudget";

export const FEATURE_CAPS = getDefaultAiCaps();

const DEFAULT_NEAR_LIMIT_THRESHOLD = 0.8;
const DEFAULT_BUDGET_WARNING_THRESHOLD = 0.8;
const COST_CACHE_TTL_MS = 2 * 60 * 1000;
const OVERVIEW_CACHE_TTL_MS = 60 * 1000;
const userCycleCostCache = new Map();
const overviewCache = new Map();

function getNearLimitThreshold() {
  const parsed = Number(process.env.AI_NEAR_LIMIT_THRESHOLD);
  if (!Number.isFinite(parsed)) return DEFAULT_NEAR_LIMIT_THRESHOLD;
  if (parsed <= 0) return DEFAULT_NEAR_LIMIT_THRESHOLD;
  if (parsed >= 1) return 1;
  return parsed;
}

function getUsageRatio(used, limit) {
  const safeUsed = Math.max(0, Number(used) || 0);
  const safeLimit = Math.max(1, Number(limit) || 1);
  return safeUsed / safeLimit;
}

export function isNearLimit(used, limit) {
  const threshold = getNearLimitThreshold();
  const safeUsed = Math.max(0, Number(used) || 0);
  const safeLimit = Math.max(1, Number(limit) || 1);
  return safeUsed < safeLimit && getUsageRatio(safeUsed, safeLimit) >= threshold;
}

function getUserCycleCostCacheKey(userId, cycleId) {
  return `${String(userId || "").trim()}:${String(cycleId || "").trim()}`;
}

function getCachedUserCycleTotalCost(userId, cycleId) {
  const key = getUserCycleCostCacheKey(userId, cycleId);
  const cached = userCycleCostCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    userCycleCostCache.delete(key);
    return null;
  }
  return cached.totalCost;
}

function setCachedUserCycleTotalCost(userId, cycleId, totalCost) {
  const key = getUserCycleCostCacheKey(userId, cycleId);
  userCycleCostCache.set(key, {
    totalCost: Number(Math.max(0, Number(totalCost) || 0).toFixed(6)),
    expiresAt: Date.now() + COST_CACHE_TTL_MS,
  });
}

async function calculateUserCycleTotalCost(databases, userId, cycleId, { forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const cached = getCachedUserCycleTotalCost(userId, cycleId);
    if (cached != null) {
      return cached;
    }
  }

  try {
    const result = await databases.listDocuments(databaseId, appwriteConfig.aiEventsCollectionId, [
      Query.equal("userId", String(userId || "").trim()),
      Query.equal("cycleId", String(cycleId || "").trim()),
      Query.limit(200),
    ]);
    const totalCost = calculateTotalCost(result.documents || []);
    setCachedUserCycleTotalCost(userId, cycleId, totalCost);
    return totalCost;
  } catch {
    return 0;
  }
}

function normalizeBudget(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Number(parsed.toFixed(6));
}

function buildBudgetSignals({ totalCost, budget, warningThreshold }) {
  const normalizedTotalCost = Number(Math.max(0, Number(totalCost) || 0).toFixed(6));
  const normalizedBudget = normalizeBudget(budget);
  const normalizedThreshold = normalizeBudgetThreshold(
    warningThreshold,
    DEFAULT_BUDGET_WARNING_THRESHOLD
  );

  if (normalizedBudget == null || normalizedBudget <= 0) {
    return {
      totalCost: normalizedTotalCost,
      budget: null,
      nearBudget: false,
      overBudget: false,
    };
  }

  return {
    totalCost: normalizedTotalCost,
    budget: normalizedBudget,
    nearBudget: isNearBudget(normalizedTotalCost, normalizedBudget, normalizedThreshold),
    overBudget: isOverBudget(normalizedTotalCost, normalizedBudget),
  };
}

function normalizeRoleFilter(role) {
  const normalized = String(role || "").trim().toLowerCase();
  return normalized || null;
}

function getOverviewCacheKey(cycleId, role) {
  const rolePart = normalizeRoleFilter(role) || "__all_roles__";
  return `${String(cycleId || "__all__")}:${rolePart}`;
}

function getCachedOverview(cycleId, role) {
  const key = getOverviewCacheKey(cycleId, role);
  const cached = overviewCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    overviewCache.delete(key);
    return null;
  }
  return cached.data;
}

function setCachedOverview(cycleId, role, data) {
  const key = getOverviewCacheKey(cycleId, role);
  overviewCache.set(key, {
    data,
    expiresAt: Date.now() + OVERVIEW_CACHE_TTL_MS,
  });
}

async function listUsersByIds(databases, userIds) {
  if (!Array.isArray(userIds) || userIds.length === 0) return new Map();

  const byId = new Map();
  const uniqueIds = Array.from(new Set(userIds.map((value) => String(value || "").trim()).filter(Boolean)));

  const chunkSize = 100;
  for (let offset = 0; offset < uniqueIds.length; offset += chunkSize) {
    const chunk = uniqueIds.slice(offset, offset + chunkSize);
    if (chunk.length === 0) continue;

    try {
      const result = await databases.listDocuments(databaseId, appwriteConfig.usersCollectionId, [
        Query.equal("$id", chunk),
        Query.limit(Math.max(100, chunk.length + 5)),
      ]);

      for (const row of result.documents || []) {
        byId.set(String(row.$id || "").trim(), row);
      }
    } catch {
      // Ignore lookup failures and fall back to unknown role.
    }
  }

  return byId;
}

function buildRoleBudgetProfileMap(policies) {
  const byRole = new Map();

  for (const policy of policies || []) {
    const role = String(policy?.role || "").trim().toLowerCase();
    if (!role) continue;

    const current = byRole.get(role) || {
      budget: 0,
      warningThreshold: DEFAULT_BUDGET_WARNING_THRESHOLD,
      hasBudget: false,
    };

    const budget = normalizeBudget(policy?.costBudgetPerCycle);
    if (budget != null && budget > 0) {
      current.budget += budget;
      current.hasBudget = true;
    }

    const threshold = normalizeBudgetThreshold(policy?.warningThreshold, DEFAULT_BUDGET_WARNING_THRESHOLD);
    current.warningThreshold = Math.min(current.warningThreshold, threshold);

    byRole.set(role, {
      ...current,
      budget: Number(current.budget.toFixed(6)),
    });
  }

  return byRole;
}

function isRequestCountTypeError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("requestcount") && message.includes("invalid type");
}

function isMissingSchemaAttributeError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("attribute not found in schema") || message.includes("unknown attribute");
}

function getMissingAttributeName(error) {
  const message = String(error?.message || "").toLowerCase();
  const match =
    message.match(/attribute not found in schema:\s*([a-z0-9_]+)/i) ||
    message.match(/unknown attribute:\s*"?([a-z0-9_]+)"?/i);
  return match?.[1] || null;
}

function normalizeNonNegativeNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function normalizeUsageResponse({
  cap,
  used,
  featureType,
  cycleId,
  tokensUsed = 0,
  estimatedCost = 0,
  totalCost = 0,
  budget = null,
  warningThreshold = DEFAULT_BUDGET_WARNING_THRESHOLD,
}) {
  const usageRatio = getUsageRatio(used, cap);
  const budgetSignals = buildBudgetSignals({
    totalCost,
    budget,
    warningThreshold,
  });

  return {
    cap,
    limit: cap,
    used,
    remaining: Math.max(0, cap - used),
    featureType,
    cycleId,
    tokensUsed: Math.round(normalizeNonNegativeNumber(tokensUsed)),
    estimatedCost: Number(normalizeNonNegativeNumber(estimatedCost).toFixed(6)),
    nearLimit: isNearLimit(used, cap),
    usagePercent: Number((usageRatio * 100).toFixed(2)),
    totalCost: budgetSignals.totalCost,
    budget: budgetSignals.budget,
    nearBudget: budgetSignals.nearBudget,
    overBudget: budgetSignals.overBudget,
  };
}

function buildMetadataWithMode(metadata, resolvedMode) {
  const base = String(metadata || "{}").trim() || "{}";
  if (!resolvedMode) return base;

  try {
    const parsed = JSON.parse(base);
    const next = {
      ...(parsed && typeof parsed === "object" ? parsed : {}),
      mode: String(resolvedMode || "").trim(),
    };
    return JSON.stringify(next);
  } catch {
    return JSON.stringify({ mode: String(resolvedMode || "").trim() });
  }
}

async function updateUsageCount(databases, documentId, used, resolvedMode) {
  let payload = {
    requestCount: used,
    lastUsedAt: new Date().toISOString(),
    metadata: buildMetadataWithMode("{}", resolvedMode),
  };

  if (resolvedMode) {
    payload.mode = String(resolvedMode || "").trim();
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await databases.updateDocument(
        databaseId,
        appwriteConfig.aiEventsCollectionId,
        documentId,
        payload
      );
      return;
    } catch (error) {
      if (isRequestCountTypeError(error)) {
        payload = {
          ...payload,
          requestCount: String(used),
        };
        continue;
      }

      if (isMissingSchemaAttributeError(error)) {
        const missingAttribute = getMissingAttributeName(error);
        if (missingAttribute && missingAttribute in payload) {
          const reduced = { ...payload };
          delete reduced[missingAttribute];
          payload = reduced;
          continue;
        }
      }

      throw error;
    }
  }
}

async function createUsageRow(databases, payload) {
  let nextPayload = { ...payload };

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await databases.createDocument(
        databaseId,
        appwriteConfig.aiEventsCollectionId,
        ID.unique(),
        nextPayload
      );
      return;
    } catch (error) {
      if (isRequestCountTypeError(error)) {
        nextPayload = {
          ...nextPayload,
          requestCount: String(nextPayload.requestCount),
        };
        continue;
      }

      if (isMissingSchemaAttributeError(error)) {
        const missingAttribute = getMissingAttributeName(error);
        if (missingAttribute && missingAttribute in nextPayload) {
          const reducedPayload = { ...nextPayload };
          delete reducedPayload[missingAttribute];
          nextPayload = reducedPayload;
          continue;
        }
      }

      throw error;
    }
  }
}

export async function checkUsageAndIncrement({
  databases,
  userId,
  featureType,
  cycleId,
  cap = 3,
}) {
  const normalizedCap = Math.max(1, Math.floor(Number(cap) || 3));
  const normalizedUserId = String(userId || "").trim();
  const normalizedFeatureType = String(featureType || "").trim();
  const normalizedCycleId = String(cycleId || "").trim();

  if (!normalizedUserId || !normalizedFeatureType || !normalizedCycleId) {
    return {
      allowed: false,
      count: 0,
      cap: normalizedCap,
    };
  }

  const queryResult = await databases.listDocuments(
    databaseId,
    appwriteConfig.aiEventsCollectionId,
    [
      Query.equal("userId", normalizedUserId),
      Query.equal("cycleId", normalizedCycleId),
      Query.equal("featureType", normalizedFeatureType),
      Query.limit(1),
    ]
  );

  const existing = queryResult.documents?.[0] || null;
  const currentCount = Number(existing?.requestCount || 0);

  if (existing && currentCount >= normalizedCap) {
    return {
      allowed: false,
      count: currentCount,
      cap: normalizedCap,
    };
  }

  if (existing) {
    const nextCount = currentCount + 1;
    await updateUsageCount(databases, existing.$id, nextCount);
    return {
      allowed: true,
      count: nextCount,
      cap: normalizedCap,
    };
  }

  await createUsageRow(databases, {
    userId: normalizedUserId,
    featureType: normalizedFeatureType,
    cycleId: normalizedCycleId,
    requestCount: 1,
    lastUsedAt: new Date().toISOString(),
    metadata: "{}",
    tokensUsed: 0,
    estimatedCost: 0,
  });

  return {
    allowed: true,
    count: 1,
    cap: normalizedCap,
  };
}

function normalizeCount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getAiUsageSnapshot({ databases, userId, cycleId }) {
  const filters = [Query.equal("userId", String(userId || "").trim()), Query.limit(200)];
  if (cycleId) {
    filters.push(Query.equal("cycleId", String(cycleId || "").trim()));
  }

  const result = await databases.listDocuments(
    databaseId,
    appwriteConfig.aiEventsCollectionId,
    filters
  );

  const byFeature = {};

  for (const featureType of Object.keys(FEATURE_CAPS)) {
    byFeature[featureType] = {
      featureType,
      cap: FEATURE_CAPS[featureType],
      used: 0,
      remaining: FEATURE_CAPS[featureType],
      warning: false,
    };
  }

  for (const row of result.documents || []) {
    const featureType = String(row.featureType || "").trim();
    if (!byFeature[featureType]) continue;

    const cap = byFeature[featureType].cap;
    const used = normalizeCount(row.requestCount);
    const remaining = Math.max(0, cap - used);

    byFeature[featureType] = {
      featureType,
      cap,
      used,
      remaining,
      nearLimit: isNearLimit(used, cap),
      warning: remaining <= 1 || used / Math.max(1, cap) >= 0.8,
    };
  }

  return {
    cycleId: cycleId || null,
    features: Object.values(byFeature),
  };
}

export async function getAiUsageOverview({ databases, cycleId, role }) {
  const normalizedRoleFilter = normalizeRoleFilter(role);
  const cachedOverview = getCachedOverview(cycleId, normalizedRoleFilter);
  if (cachedOverview) {
    return cachedOverview;
  }

  const filters = [Query.limit(500)];
  if (cycleId) {
    filters.push(Query.equal("cycleId", String(cycleId || "").trim()));
  }

  const result = await databases.listDocuments(
    databaseId,
    appwriteConfig.aiEventsCollectionId,
    filters
  );

  const totalsByFeature = {};
  const totalCostByFeatureMap = new Map();
  const totalCostByRoleMap = new Map();
  const userTotals = new Map();
  const nearLimitUsers = [];
  const userCycleCostTotals = new Map();
  const userIds = Array.from(
    new Set((result.documents || []).map((row) => String(row?.userId || "").trim()).filter(Boolean))
  );
  const usersById = await listUsersByIds(databases, userIds);

  for (const featureType of Object.keys(FEATURE_CAPS)) {
    totalsByFeature[featureType] = {
      featureType,
      capPerUser: FEATURE_CAPS[featureType],
      totalUsed: 0,
      nearCapUsers: 0,
      rows: 0,
    };
  }

  for (const row of result.documents || []) {
    const featureType = String(row.featureType || "").trim();
    if (!totalsByFeature[featureType]) continue;

    const userId = String(row.userId || "").trim();
    const resolvedRole =
      String(usersById.get(userId)?.role || "unknown").trim().toLowerCase() || "unknown";
    if (normalizedRoleFilter && resolvedRole !== normalizedRoleFilter) {
      continue;
    }
    const used = normalizeCount(row.requestCount);
    const cap = FEATURE_CAPS[featureType];
    const ratio = getUsageRatio(used, cap);
    const nearLimit = isNearLimit(used, cap);
    const usagePercent = Number((ratio * 100).toFixed(2));
    const rowCost = Number(Math.max(0, Number(row.estimatedCost) || 0).toFixed(6));

    totalsByFeature[featureType].totalUsed += used;
    totalsByFeature[featureType].rows += 1;
    totalCostByFeatureMap.set(
      featureType,
      Number(((totalCostByFeatureMap.get(featureType) || 0) + rowCost).toFixed(6))
    );
    if (ratio >= 0.8) {
      totalsByFeature[featureType].nearCapUsers += 1;
    }

    const userCycleKey = `${userId}:${String(row.cycleId || "").trim()}`;
    const userCycleCurrent = userCycleCostTotals.get(userCycleKey) || {
      userId,
      cycleId: String(row.cycleId || "").trim(),
      role: resolvedRole,
      totalCost: 0,
    };
    userCycleCurrent.totalCost = Number((userCycleCurrent.totalCost + rowCost).toFixed(6));
    userCycleCostTotals.set(userCycleKey, userCycleCurrent);

    const key = `${userId}:${featureType}`;
    userTotals.set(key, {
      userId,
      featureType,
      cycleId: String(row.cycleId || "").trim(),
      used,
      cap,
      remaining: Math.max(0, cap - used),
      nearCap: ratio >= 0.8,
      nearLimit,
      usagePercent,
      warning: Math.max(0, cap - used) <= 1 || ratio >= 0.8,
      lastUsedAt: row.lastUsedAt || null,
    });

    if (nearLimit) {
      nearLimitUsers.push({
        userId,
        featureType,
        usagePercent,
      });
    }
  }

  const roleBudgetProfiles = buildRoleBudgetProfileMap(await listActiveAiPolicies({ databases }));

  for (const [key, entry] of userCycleCostTotals.entries()) {
    const roleProfile = roleBudgetProfiles.get(entry.role) || {
      budget: 0,
      warningThreshold: DEFAULT_BUDGET_WARNING_THRESHOLD,
      hasBudget: false,
    };

    const budgetSignals = buildBudgetSignals({
      totalCost: entry.totalCost,
      budget: roleProfile.hasBudget ? roleProfile.budget : null,
      warningThreshold: roleProfile.warningThreshold,
    });

    userCycleCostTotals.set(key, {
      ...entry,
      budget: budgetSignals.budget,
      nearBudget: budgetSignals.nearBudget,
      overBudget: budgetSignals.overBudget,
      usagePercent:
        budgetSignals.budget && budgetSignals.budget > 0
          ? Number(((budgetSignals.totalCost / budgetSignals.budget) * 100).toFixed(2))
          : null,
    });

    const nextRoleCost = Number(
      ((totalCostByRoleMap.get(entry.role) || 0) + entry.totalCost).toFixed(6)
    );
    totalCostByRoleMap.set(entry.role, nextRoleCost);
  }

  const topUsers = Array.from(userTotals.values()).sort((a, b) => b.used - a.used).slice(0, 25);
  const topSpenders = Array.from(userCycleCostTotals.values())
    .sort((a, b) => b.totalCost - a.totalCost)
    .map((row) => ({
      userId: row.userId,
      cycleId: row.cycleId,
      role: row.role,
      totalCost: row.totalCost,
      budget: row.budget,
      usagePercent: row.usagePercent,
      nearBudget: row.nearBudget,
      overBudget: row.overBudget,
    }));

  const nearBudgetUsers = topSpenders.filter((row) => row.nearBudget);
  const overBudgetUsers = topSpenders.filter((row) => row.overBudget);

  const totalCostByFeature = Array.from(totalCostByFeatureMap.entries()).map(([featureType, totalCost]) => ({
    featureType,
    totalCost,
  }));

  const totalCostByRole = Array.from(totalCostByRoleMap.entries()).map(([role, totalCost]) => ({
    role,
    totalCost,
  }));

  nearLimitUsers.sort((a, b) => b.usagePercent - a.usagePercent);

  const overview = {
    cycleId: cycleId || null,
    role: normalizedRoleFilter,
    totalsByFeature: Object.values(totalsByFeature),
    topUsers,
    totalNearLimitUsers: nearLimitUsers.length,
    nearLimitUsers,
    totalCostByFeature,
    totalCostByRole,
    topSpenders,
    nearBudgetUsers,
    overBudgetUsers,
  };

  setCachedOverview(cycleId, normalizedRoleFilter, overview);
  return overview;
}

export async function assertAndTrackAiUsage({ databases, userId, cycleId, featureType, userRole, resolvedMode }) {
  const policyConfig = await resolveAiPolicyConfig({
    databases,
    featureType,
    role: userRole,
  });
  const cap = policyConfig.limitPerCycle;
  const totalCost = await calculateUserCycleTotalCost(databases, userId, cycleId);

  const queryResult = await databases.listDocuments(
    databaseId,
    appwriteConfig.aiEventsCollectionId,
    [
      Query.equal("userId", userId),
      Query.equal("cycleId", cycleId),
      Query.equal("featureType", featureType),
      Query.limit(1),
    ]
  );

  const existing = queryResult.documents[0] || null;

  if (existing && Number(existing.requestCount || 0) >= cap) {
    const error = new Error(`AI usage cap reached for ${featureType}.`);
    error.statusCode = 429;
    throw error;
  }

  if (existing) {
    const used = Number(existing.requestCount || 0) + 1;

    await updateUsageCount(databases, existing.$id, used, resolvedMode);

    return normalizeUsageResponse({
      cap,
      used,
      featureType,
      cycleId,
      tokensUsed: existing.tokensUsed,
      estimatedCost: existing.estimatedCost,
      totalCost,
      budget: policyConfig.costBudgetPerCycle,
      warningThreshold: policyConfig.warningThreshold,
    });
  }

  await createUsageRow(databases, {
    userId,
    featureType,
    cycleId,
    requestCount: 1,
    lastUsedAt: new Date().toISOString(),
    metadata: buildMetadataWithMode("{}", resolvedMode),
    ...(resolvedMode ? { mode: String(resolvedMode || "").trim() } : {}),
    tokensUsed: 0,
    estimatedCost: 0,
  });

  return normalizeUsageResponse({
    cap,
    used: 1,
    featureType,
    cycleId,
    tokensUsed: 0,
    estimatedCost: 0,
    totalCost,
    budget: policyConfig.costBudgetPerCycle,
    warningThreshold: policyConfig.warningThreshold,
  });
}

async function updateUsageCostWithFallback(databases, documentId, payload) {
  let nextPayload = { ...payload };

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await databases.updateDocument(
        databaseId,
        appwriteConfig.aiEventsCollectionId,
        documentId,
        nextPayload
      );
      return;
    } catch (error) {
      if (!isMissingSchemaAttributeError(error)) {
        throw error;
      }

      const missingAttribute = getMissingAttributeName(error);
      if (!missingAttribute || !(missingAttribute in nextPayload)) {
        throw error;
      }

      const reducedPayload = { ...nextPayload };
      delete reducedPayload[missingAttribute];
      nextPayload = reducedPayload;
    }
  }
}

export async function trackAiUsageCost({
  databases,
  userId,
  cycleId,
  featureType,
  usage,
  tokensUsedDelta,
  estimatedCostDelta,
}) {
  const cap = Number(usage?.limit ?? usage?.cap ?? (FEATURE_CAPS[featureType] || 3));
  const safeTokensDelta = Math.max(0, Math.round(normalizeNonNegativeNumber(tokensUsedDelta)));
  const safeCostDelta = Number(normalizeNonNegativeNumber(estimatedCostDelta).toFixed(6));

  if (safeTokensDelta <= 0 && safeCostDelta <= 0) {
    return normalizeUsageResponse({
      cap,
      used: Number(usage?.used || 0),
      featureType,
      cycleId,
      tokensUsed: usage?.tokensUsed,
      estimatedCost: usage?.estimatedCost,
      totalCost: usage?.totalCost,
      budget: usage?.budget,
    });
  }

  try {
    const queryResult = await databases.listDocuments(
      databaseId,
      appwriteConfig.aiEventsCollectionId,
      [
        Query.equal("userId", userId),
        Query.equal("cycleId", cycleId),
        Query.equal("featureType", featureType),
        Query.limit(1),
      ]
    );

    const existing = queryResult.documents[0] || null;
    const baseTokens = normalizeNonNegativeNumber(existing?.tokensUsed);
    const baseCost = normalizeNonNegativeNumber(existing?.estimatedCost);
    const nextTokens = Math.round(baseTokens + safeTokensDelta);
    const nextCost = Number((baseCost + safeCostDelta).toFixed(6));
    const baselineTotalCost = Number(usage?.totalCost);
    const nextTotalCost = Number(
      (
        (Number.isFinite(baselineTotalCost)
          ? baselineTotalCost
          : await calculateUserCycleTotalCost(databases, userId, cycleId)) + safeCostDelta
      ).toFixed(6)
    );

    if (existing?.$id) {
      await updateUsageCostWithFallback(databases, existing.$id, {
        tokensUsed: nextTokens,
        estimatedCost: nextCost,
      });
    }

    setCachedUserCycleTotalCost(userId, cycleId, nextTotalCost);

    return normalizeUsageResponse({
      cap,
      used: Number(usage?.used || existing?.requestCount || 0),
      featureType,
      cycleId,
      tokensUsed: nextTokens,
      estimatedCost: nextCost,
      totalCost: nextTotalCost,
      budget: usage?.budget,
    });
  } catch {
    return normalizeUsageResponse({
      cap,
      used: Number(usage?.used || 0),
      featureType,
      cycleId,
      tokensUsed: Number(usage?.tokensUsed || 0),
      estimatedCost: Number(usage?.estimatedCost || 0),
      totalCost: Number(usage?.totalCost || 0),
      budget: usage?.budget,
    });
  }
}

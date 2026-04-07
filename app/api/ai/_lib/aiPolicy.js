import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";

const DEFAULT_CAPS = {
  goal_suggestion: 3,
  checkin_summary: 3,
  goal_analysis: 3,
  meeting_intelligence: 8,
  meeting_qa: 20,
};

const VALID_ROLES = new Set(["employee", "manager", "hr"]);
const CACHE_TTL_MS = 5 * 60 * 1000;
const policyCache = new Map();
const policyListCache = new Map();
const DEFAULT_WARNING_THRESHOLD = 0.8;

function normalizeRole(role) {
  const value = String(role || "").trim().toLowerCase();
  return VALID_ROLES.has(value) ? value : null;
}

function normalizeLimit(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

function normalizeOptionalBudget(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Number(parsed.toFixed(6));
}

function normalizeWarningThreshold(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
    return DEFAULT_WARNING_THRESHOLD;
  }
  return parsed;
}

function getCacheKey(featureType, role) {
  return `${featureType}:${role || "default"}`;
}

function getCachedLimit(featureType, role) {
  const key = getCacheKey(featureType, role);
  const cached = policyCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    policyCache.delete(key);
    return null;
  }
  return cached.config;
}

function setCachedLimit(featureType, role, config) {
  const key = getCacheKey(featureType, role);
  policyCache.set(key, {
    config,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function getDefaultCap(featureType) {
  return DEFAULT_CAPS[featureType] || 3;
}

export async function resolveAiPolicyLimit({ databases, featureType, role }) {
  const config = await resolveAiPolicyConfig({ databases, featureType, role });
  return config.limitPerCycle;
}

export async function resolveAiPolicyConfig({ databases, featureType, role }) {
  const fallback = getDefaultCap(featureType);
  const normalizedRole = normalizeRole(role);

  const cached = getCachedLimit(featureType, normalizedRole);
  if (cached) {
    return cached;
  }

  const fallbackConfig = {
    featureType,
    role: normalizedRole,
    limitPerCycle: fallback,
    costBudgetPerCycle: null,
    warningThreshold: DEFAULT_WARNING_THRESHOLD,
    source: "fallback",
  };

  if (!normalizedRole) {
    setCachedLimit(featureType, normalizedRole, fallbackConfig);
    return fallbackConfig;
  }

  try {
    const result = await databases.listDocuments(databaseId, appwriteConfig.aiPoliciesCollectionId, [
      Query.equal("featureType", featureType),
      Query.equal("role", normalizedRole),
      Query.equal("isActive", true),
      Query.limit(1),
    ]);

    const policy = result.documents?.[0] || null;
    const resolvedConfig = {
      featureType,
      role: normalizedRole,
      limitPerCycle: normalizeLimit(policy?.limitPerCycle, fallback),
      costBudgetPerCycle: normalizeOptionalBudget(policy?.costBudgetPerCycle),
      warningThreshold: normalizeWarningThreshold(policy?.warningThreshold),
      source: policy ? "policy" : "fallback",
    };

    setCachedLimit(featureType, normalizedRole, resolvedConfig);
    return resolvedConfig;
  } catch {
    setCachedLimit(featureType, normalizedRole, fallbackConfig);
    return fallbackConfig;
  }
}

function getPolicyListCacheKey() {
  return "all-active-policies";
}

export async function listActiveAiPolicies({ databases }) {
  const cacheKey = getPolicyListCacheKey();
  const cached = policyListCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.rows;
  }

  try {
    const result = await databases.listDocuments(databaseId, appwriteConfig.aiPoliciesCollectionId, [
      Query.equal("isActive", true),
      Query.limit(200),
    ]);
    const rows = result.documents || [];
    policyListCache.set(cacheKey, {
      rows,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return rows;
  } catch {
    return [];
  }
}

export function getDefaultAiCaps() {
  return { ...DEFAULT_CAPS };
}

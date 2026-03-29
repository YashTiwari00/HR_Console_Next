import { account, databases } from "@/lib/appwrite";
import { normalizeRole } from "@/lib/auth/roles";
import { Query } from "appwrite";
import { OAuthProvider } from "appwrite";

const DATABASE_ID = process.env.NEXT_PUBLIC_DATABASE_ID;
const USERS_TABLE = "users";
function joinUrl(base, path) {
  const cleanBase = String(base || "").replace(/\/$/, "");
  const cleanPath = String(path || "").startsWith("/")
    ? String(path || "")
    : `/${String(path || "")}`;
  return `${cleanBase}${cleanPath}`;
}

function resolveOAuthRedirectUrl(defaultPath, envKey) {
  const rawValue = process.env[envKey];

  if (rawValue) {
    const value = String(rawValue).trim();
    if (/^https?:\/\//i.test(value)) {
      return value;
    }

    // Always prefer the current browser origin for relative paths.
    return joinUrl(window.location.origin, value);
  }

  return joinUrl(window.location.origin, defaultPath);
}

export async function loginWithGoogle() {
  try {
    const successBaseUrl = resolveOAuthRedirectUrl(
      "/auth/callback",
      "NEXT_PUBLIC_OAUTH_SUCCESS_URL"
    );
    const separator = successBaseUrl.includes("?") ? "&" : "?";
    const successUrl = `${successBaseUrl}${separator}userId={userId}&secret={secret}`;
    const failureUrl = resolveOAuthRedirectUrl(
      "/login",
      "NEXT_PUBLIC_OAUTH_FAILURE_URL"
    );
    const scopesFromEnv = String(process.env.NEXT_PUBLIC_OAUTH_SCOPES || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const scopes =
      scopesFromEnv.length > 0
        ? scopesFromEnv
        : [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/calendar",
            "https://www.googleapis.com/auth/calendar.events",
          ];

    await account.createOAuth2Token({
      provider: OAuthProvider.Google,
      success: successUrl,
      failure: failureUrl,
      ...(scopes.length > 0 ? { scopes } : {}),
    });
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function logout() {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });

    // Best-effort cleanup for environments where Appwrite browser cookie is present.
    await account.deleteSession("current").catch(() => null);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

export async function getCurrentUser() {
  try {
    const response = await fetch("/api/me", {
      method: "GET",
      cache: "no-store",
      credentials: "include",
    });

    if (response.ok) {
      const payload = await response.json();
      return payload?.data?.user || null;
    }

    const user = await account.get();

    return user;
  } catch {
    try {
      const user = await account.get();
      return user;
    } catch {
      return null;
    }
  }
}

export async function waitForCurrentUser(options = {}) {
  const attempts = Number(options.attempts || 10);
  const delayMs = Number(options.delayMs || 350);

  for (let i = 0; i < attempts; i += 1) {
    const user = await getCurrentUser();
    if (user) return user;

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return null;
}

export async function finalizeOAuthCallbackSession(userId, secret) {
  if (!userId || !secret) {
    throw new Error("Missing OAuth callback credentials.");
  }

  try {
    const response = await fetch("/api/auth/session", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId, secret }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error || "Failed to establish session.");
    }
  } catch (error) {
    const message = String(error?.message || "").toLowerCase();
    const isSafeToIgnore =
      message.includes("already") || message.includes("active");

    if (!isSafeToIgnore) {
      console.error(error);
      throw error;
    }
  }

  return getCurrentUser();
}

export async function getUserProfile(userId) {
  try {
    return await databases.getDocument(DATABASE_ID, USERS_TABLE, userId);
  } catch {
    try {
      const result = await databases.listDocuments(DATABASE_ID, USERS_TABLE, [
        Query.equal("$id", userId),
        Query.limit(1),
      ]);

      return result.documents[0] || null;
    } catch {
      return null;
    }
  }
}

export async function getUserRole() {
  try {
    const response = await fetch("/api/auth/redirect", {
      method: "GET",
      cache: "no-store",
      credentials: "include",
    });

    if (response.ok) {
      const payload = await response.json();
      const role = normalizeRole(payload?.data?.role);
      if (role) return role;
      if (payload?.data?.redirectTo === "/onboarding") return null;
    }
  } catch {
    // Fallback to direct Appwrite profile lookup.
  }

  const user = await getCurrentUser();

  if (!user) return null;

  const profile = await getUserProfile(user.$id);

  if (!profile) return null;

  return normalizeRole(profile.role);
}

export async function getRoleRedirectFromServer() {
  try {
    const response = await fetch("/api/auth/redirect", {
      method: "GET",
      cache: "no-store",
      credentials: "include",
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    return payload?.data?.redirectTo || null;
  } catch {
    return null;
  }
}

function mapOnboardingRoleError(error, role) {
  const message = String(error?.message || error?.response?.message || "").trim();
  const normalized = message.toLowerCase();

  const roleSchemaMismatch =
    normalized.includes("role") &&
    (normalized.includes("enum") ||
      normalized.includes("invalid") ||
      normalized.includes("value must be one of") ||
      normalized.includes("invalid format") ||
      normalized.includes("invalid document structure") ||
      normalized.includes("unknown attribute"));

  if (roleSchemaMismatch) {
    return new Error(
      `Selected role \"${role}\" is not enabled in backend schema yet. Ask admin to run schema sync with --apply, then try again.`
    );
  }

  return error;
}

export async function completeGoogleOnboarding(role = "employee", options = {}) {
  const safeRole = normalizeRole(role) || "employee";
  const requestedRegion = String(options?.region || "").trim();
  const safeRegion = safeRole === "region-admin" ? requestedRegion : "";

  if (safeRole === "region-admin" && !safeRegion) {
    throw new Error("Region is required for region admin onboarding.");
  }

  try {
    const response = await fetch("/api/auth/onboarding", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        role: safeRole,
        ...(safeRegion ? { region: safeRegion } : {}),
      }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload?.error || "Failed to finish onboarding.");
    }

    return payload?.data?.profile || null;
  } catch (error) {
    throw mapOnboardingRoleError(error, safeRole);
  }
}

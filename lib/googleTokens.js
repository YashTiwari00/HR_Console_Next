import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId, ID } from "@/lib/appwriteServer";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

function toIso(input) {
  if (!input) return null;

  if (typeof input === "number" && Number.isFinite(input)) {
    const ms = input > 10_000_000_000 ? input : input * 1000;
    return new Date(ms).toISOString();
  }

  const str = String(input).trim();
  if (!str) return null;

  if (/^\d+$/.test(str)) {
    const raw = Number(str);
    const ms = raw > 10_000_000_000 ? raw : raw * 1000;
    return new Date(ms).toISOString();
  }

  const date = new Date(str);
  if (Number.isNaN(date.valueOf())) return null;
  return date.toISOString();
}

export function normalizeGoogleTokenPayload(input) {
  const accessToken = String(input?.accessToken || "").trim();
  const refreshToken = String(input?.refreshToken || "").trim();
  const email = String(input?.email || "").trim();
  const scope = String(input?.scope || "").trim();
  const provider = String(input?.provider || "google").trim() || "google";
  const expiry = toIso(input?.expiry);

  return {
    accessToken,
    refreshToken,
    email,
    scope,
    provider,
    expiry,
  };
}

function requireGoogleOAuthEnv() {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || "").trim();

  if (!clientId || !clientSecret) {
    const error = new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET.");
    error.statusCode = 500;
    throw error;
  }

  return { clientId, clientSecret };
}

async function exchangeRefreshTokenForAccess(refreshToken) {
  const safeRefreshToken = String(refreshToken || "").trim();
  if (!safeRefreshToken) {
    return null;
  }

  const { clientId, clientSecret } = requireGoogleOAuthEnv();

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: safeRefreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) {
    const error = new Error(payload?.error_description || payload?.error || "Failed to exchange refresh token.");
    error.statusCode = 502;
    throw error;
  }

  const expiresInSeconds = Number(payload.expires_in || 3600);

  return {
    accessToken: String(payload.access_token),
    expiry: new Date(Date.now() + Math.max(expiresInSeconds, 60) * 1000).toISOString(),
    scope: String(payload.scope || "").trim(),
  };
}

async function resolveUserEmail(databases, userId, fallback) {
  const fromInput = String(fallback || "").trim();
  if (fromInput) return fromInput;

  try {
    const profile = await databases.getDocument(
      databaseId,
      appwriteConfig.usersCollectionId,
      userId
    );

    return String(profile?.email || "").trim();
  } catch {
    return "";
  }
}

export async function upsertGoogleToken(databases, input) {
  const userId = String(input?.userId || "").trim();
  if (!userId) {
    const error = new Error("userId is required for token upsert.");
    error.statusCode = 400;
    throw error;
  }

  const normalized = normalizeGoogleTokenPayload(input);

  const list = await databases.listDocuments(
    databaseId,
    appwriteConfig.googleTokensCollectionId,
    [Query.equal("userId", userId), Query.limit(1)]
  );

  const existing = list.documents[0] || null;

  let accessToken = normalized.accessToken || String(existing?.accessToken || "").trim();
  const refreshToken = normalized.refreshToken || String(existing?.refreshToken || "").trim();
  let expiry = normalized.expiry || String(existing?.expiry || "").trim();
  let scope = normalized.scope || String(existing?.scope || "").trim();

  if (!accessToken && refreshToken) {
    const refreshed = await exchangeRefreshTokenForAccess(refreshToken);
    accessToken = refreshed?.accessToken || "";
    expiry = refreshed?.expiry || expiry;
    scope = refreshed?.scope || scope;
  }

  if (!accessToken) {
    const error = new Error(
      "Missing access token. Provide refreshToken once to bootstrap, or provide accessToken."
    );
    error.statusCode = 400;
    throw error;
  }

  if (!expiry) {
    expiry = new Date(Date.now() + 55 * 60 * 1000).toISOString();
  }

  const email = await resolveUserEmail(databases, userId, normalized.email || existing?.email);

  const payload = {
    userId,
    email,
    accessToken,
    refreshToken,
    expiry,
    scope,
    provider: normalized.provider || String(existing?.provider || "google"),
  };

  if (existing) {
    return databases.updateDocument(
      databaseId,
      appwriteConfig.googleTokensCollectionId,
      existing.$id,
      payload
    );
  }

  return databases.createDocument(
    databaseId,
    appwriteConfig.googleTokensCollectionId,
    ID.unique(),
    payload
  );
}

export function extractGoogleTokensFromSession(session) {
  const provider = String(session?.provider || "").toLowerCase();
  if (provider && provider !== "google") {
    return null;
  }

  const accessToken =
    String(session?.providerAccessToken || session?.providerToken || "").trim();
  const refreshToken =
    String(session?.providerRefreshToken || "").trim();
  const expiryRaw =
    session?.providerAccessTokenExpiry || session?.providerAccessTokenExpiryTime || null;
  const scope = String(session?.providerAccessTokenScope || session?.scope || "").trim();

  if (!accessToken) {
    return null;
  }

  return {
    accessToken,
    refreshToken,
    expiry: toIso(expiryRaw) || new Date(Date.now() + 55 * 60 * 1000).toISOString(),
    scope,
    provider: "google",
  };
}

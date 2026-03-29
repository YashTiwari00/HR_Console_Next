import { appwriteConfig } from "@/lib/appwrite";
import { normalizeRole } from "@/lib/auth/roles";
import { Query, databaseId } from "@/lib/appwriteServer";
import { upsertGoogleToken } from "@/lib/googleTokens";
import { errorResponse, requireAuth } from "@/lib/serverAuth";
import { NextResponse } from "next/server";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

function resolveGoogleCallbackUri(request) {
  const explicitRedirectUri = String(process.env.GOOGLE_OAUTH_REDIRECT_URI || "").trim();
  if (explicitRedirectUri) {
    return explicitRedirectUri;
  }

  const appOrigin = String(
    process.env.NEXT_PUBLIC_APP_ORIGIN || process.env.APP_ORIGIN || ""
  ).trim();

  if (appOrigin) {
    return new URL("/api/google/callback", appOrigin).toString();
  }

  return new URL("/api/google/callback", request.url).toString();
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

function resolveRoleRedirect(role) {
  const safeRole = normalizeRole(role);

  if (safeRole === "manager") return "/manager";
  if (safeRole === "employee") return "/employee";
  if (safeRole === "hr") return "/hr";
  if (safeRole === "region-admin") return "/region-admin";

  return "/onboarding";
}

async function readExistingRefreshToken(databases, userId) {
  const result = await databases.listDocuments(
    databaseId,
    appwriteConfig.googleTokensCollectionId,
    [Query.equal("userId", userId), Query.limit(1)]
  );

  return String(result.documents[0]?.refreshToken || "").trim();
}

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const code = String(searchParams.get("code") || "").trim();

    if (!code) {
      return Response.json({ error: "Missing OAuth code." }, { status: 400 });
    }

    const { clientId, clientSecret } = requireGoogleOAuthEnv();
    const redirectUri = resolveGoogleCallbackUri(request);

    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });

    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    const tokenPayload = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok) {
      const message =
        tokenPayload?.error_description ||
        tokenPayload?.error ||
        "Failed to exchange Google OAuth code.";
      return Response.json({ error: String(message) }, { status: 502 });
    }

    const accessToken = String(tokenPayload?.access_token || "").trim();
    const refreshToken = String(tokenPayload?.refresh_token || "").trim();
    const expiresInSeconds = Number(tokenPayload?.expires_in || 3600);
    const scope = String(tokenPayload?.scope || "").trim();

    if (!accessToken) {
      return Response.json(
        { error: "Google OAuth response did not include access_token." },
        { status: 502 }
      );
    }

    const existingRefreshToken = await readExistingRefreshToken(databases, profile.$id);
    if (!refreshToken && !existingRefreshToken) {
      return Response.json(
        {
          error:
            "Google did not return a refresh_token. Remove app access in Google permissions and reconnect.",
        },
        { status: 400 }
      );
    }

    const expiry = new Date(
      Date.now() + Math.max(expiresInSeconds, 60) * 1000
    ).toISOString();

    await upsertGoogleToken(databases, {
      userId: profile.$id,
      email: String(profile?.email || "").trim(),
      accessToken,
      refreshToken,
      expiry,
      scope,
      provider: "google",
    });

    return NextResponse.redirect(new URL(resolveRoleRedirect(profile?.role), request.url));
  } catch (error) {
    if (error?.statusCode === 401) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    return errorResponse(error);
  }
}
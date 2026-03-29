import { errorResponse, requireAuth } from "@/lib/serverAuth";
import { NextResponse } from "next/server";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
];

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

function requireGoogleClientId() {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
  if (!clientId) {
    const error = new Error("Missing GOOGLE_CLIENT_ID.");
    error.statusCode = 500;
    throw error;
  }

  return clientId;
}

export async function GET(request) {
  try {
    await requireAuth(request);

    const authUrl = new URL(GOOGLE_AUTH_URL);
    authUrl.searchParams.set("client_id", requireGoogleClientId());
    authUrl.searchParams.set("redirect_uri", resolveGoogleCallbackUri(request));
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("scope", GOOGLE_SCOPES.join(" "));

    return NextResponse.redirect(authUrl);
  } catch (error) {
    if (error?.statusCode === 401) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    return errorResponse(error);
  }
}
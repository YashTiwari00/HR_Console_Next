import { createAdminAccount } from "@/lib/appwriteServer";
import {
  buildSessionCookieOptions,
  getProjectSessionCookieName,
} from "@/lib/auth/session";
import { errorResponse } from "@/lib/serverAuth";
import { NextResponse } from "next/server";

function isValidAppwriteUserId(value) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/.test(String(value || ""));
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = String(body?.userId || "").trim();
    const secret = String(body?.secret || "").trim();

    if (!userId || !secret) {
      return NextResponse.json(
        { error: "Missing OAuth callback credentials." },
        { status: 400 }
      );
    }

    if (!isValidAppwriteUserId(userId)) {
      return NextResponse.json(
        {
          error:
            "Invalid OAuth callback userId. Ensure Google sign-in starts with createOAuth2Token so callback includes Appwrite userId and secret.",
        },
        { status: 400 }
      );
    }

    const account = createAdminAccount();
    const session = await account.createSession({ userId, secret });

    if (!session?.secret) {
      return NextResponse.json(
        {
          error:
            "Session secret missing from Appwrite response. Ensure APPWRITE_API_KEY has sessions.write scope.",
        },
        { status: 500 }
      );
    }

    const sessionToken = String(session.secret);

    let maxAgeSeconds;
    if (session?.expire) {
      const expireAtMs = new Date(session.expire).getTime();
      const nowMs = Date.now();
      const seconds = Math.floor((expireAtMs - nowMs) / 1000);
      if (Number.isFinite(seconds) && seconds > 0) {
        maxAgeSeconds = seconds;
      }
    }

    const response = NextResponse.json({ data: { ok: true } });
    response.cookies.set(
      "appwrite_session",
      sessionToken,
      buildSessionCookieOptions(maxAgeSeconds)
    );

    const projectCookie = getProjectSessionCookieName();
    if (projectCookie) {
      response.cookies.set(
        projectCookie,
        sessionToken,
        buildSessionCookieOptions(maxAgeSeconds)
      );
    }

    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

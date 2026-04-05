import { NextRequest, NextResponse } from "next/server";
import { expectedRoleRoute } from "@/lib/auth/roles";
import { hasAppwriteSessionCookie } from "@/lib/auth/session";

const AUTH_PAGES = new Set(["/login", "/signup", "/onboarding", "/auth/callback"]);

async function fetchRedirectTarget(request: NextRequest): Promise<string | null> {
  const cookieHeader = request.headers.get("cookie") || "";
  const origin = request.nextUrl.origin;

  try {
    const response = await fetch(`${origin}/api/auth/redirect`, {
      method: "GET",
      headers: {
        cookie: cookieHeader,
      },
      cache: "no-store",
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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const expectedRoute = expectedRoleRoute(pathname);
  const isAuthPage = AUTH_PAGES.has(pathname);

  const hasSession = hasAppwriteSessionCookie(request);

  if (expectedRoute) {
    if (!hasSession) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const redirectTo = await fetchRedirectTarget(request);

    if (!redirectTo) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    if (redirectTo === "/onboarding") {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }

    if (redirectTo !== expectedRoute) {
      return NextResponse.redirect(new URL(redirectTo, request.url));
    }

    return NextResponse.next();
  }

  if (isAuthPage && hasSession) {
    const redirectTo = await fetchRedirectTarget(request);

    if (!redirectTo) {
      if (pathname === "/auth/callback") {
        return NextResponse.redirect(new URL("/login", request.url));
      }

      return NextResponse.next();
    }

    if (pathname === "/onboarding" && redirectTo === "/onboarding") {
      return NextResponse.next();
    }

    if (redirectTo !== pathname) {
      return NextResponse.redirect(new URL(redirectTo, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/employee/:path*",
    "/manager/:path*",
    "/hr/:path*",
    "/region-admin/:path*",
    "/leadership/:path*",
    "/auth/callback",
    "/login",
    "/signup",
    "/onboarding",
  ],
};

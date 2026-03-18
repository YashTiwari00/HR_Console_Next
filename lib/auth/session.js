const APPWRITE_SESSION_COOKIE = "appwrite_session";

export function getProjectSessionCookieName(projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID) {
  return projectId ? `a_session_${projectId}` : "";
}

export function readSessionFromCookieHeader(cookieHeader, projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID) {
  if (!cookieHeader) return null;

  const pairs = String(cookieHeader)
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  const exactName = getProjectSessionCookieName(projectId);
  const exactPrefix = exactName ? `${exactName}=` : "";

  if (exactPrefix) {
    for (const pair of pairs) {
      if (pair.startsWith(exactPrefix)) {
        return decodeURIComponent(pair.slice(exactPrefix.length));
      }
    }
  }

  for (const pair of pairs) {
    if (pair.startsWith("a_session_")) {
      const idx = pair.indexOf("=");
      if (idx > -1) {
        return decodeURIComponent(pair.slice(idx + 1));
      }
    }
  }

  return null;
}

export function readSessionFromRequest(request) {
  const primarySession = request?.cookies?.get(APPWRITE_SESSION_COOKIE)?.value;
  if (primarySession) return primarySession;

  const cookieHeader = request?.headers?.get("cookie") || "";
  return readSessionFromCookieHeader(cookieHeader);
}

export function hasAppwriteSessionCookie(request) {
  if (request?.cookies?.get(APPWRITE_SESSION_COOKIE)?.value) {
    return true;
  }

  const exactName = getProjectSessionCookieName(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID);
  if (exactName && request?.cookies?.get(exactName)?.value) {
    return true;
  }

  return request?.cookies?.getAll?.().some((item) => item.name.startsWith("a_session_")) || false;
}

export function buildSessionCookieOptions(maxAgeSeconds) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(Number.isFinite(maxAgeSeconds) && maxAgeSeconds > 0
      ? { maxAge: maxAgeSeconds }
      : {}),
  };
}

export function clearSessionCookie(response) {
  response.cookies.set(APPWRITE_SESSION_COOKIE, "", {
    ...buildSessionCookieOptions(undefined),
    maxAge: 0,
  });

  const projectCookie = getProjectSessionCookieName();
  if (projectCookie) {
    response.cookies.set(projectCookie, "", {
      ...buildSessionCookieOptions(undefined),
      maxAge: 0,
    });
  }
}
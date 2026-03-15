import { Query } from "appwrite";
import { appwriteConfig } from "@/lib/appwrite";
import {
  createAdminServices,
  createJWTAccount,
  createSessionAccount,
  databaseId,
} from "@/lib/appwriteServer";

function readSessionFromCookieHeader(cookieHeader, projectId) {
  if (!cookieHeader) return null;

  const pairs = cookieHeader.split(";").map((part) => part.trim());
  const exactPrefix = `a_session_${projectId}=`;

  for (const pair of pairs) {
    if (pair.startsWith(exactPrefix)) {
      return decodeURIComponent(pair.slice(exactPrefix.length));
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

function readSessionFromRequest(request) {
  const headerSession = request.headers.get("x-appwrite-session");
  if (headerSession) return headerSession;

  const cookieHeader = request.headers.get("cookie");
  return readSessionFromCookieHeader(
    cookieHeader,
    process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID
  );
}

async function getUserProfile(databases, userId) {
  try {
    return await databases.getDocument(
      databaseId,
      appwriteConfig.usersCollectionId,
      userId
    );
  } catch {
    const result = await databases.listDocuments(
      databaseId,
      appwriteConfig.usersCollectionId,
      [Query.equal("$id", userId), Query.limit(1)]
    );

    return result.documents[0] || null;
  }
}

export async function requireAuth(request) {
  const jwt = request.headers.get("x-appwrite-jwt");
  const session = readSessionFromRequest(request);

  if (!session && !jwt) {
    const error = new Error("Unauthorized: missing session.");
    error.statusCode = 401;
    throw error;
  }

  const account = jwt ? createJWTAccount(jwt) : createSessionAccount(session);

  let user;
  try {
    user = await account.get();
  } catch {
    const error = new Error("Unauthorized: invalid session.");
    error.statusCode = 401;
    throw error;
  }

  const { databases, storage } = createAdminServices();
  const profile = await getUserProfile(databases, user.$id);

  if (!profile) {
    const error = new Error("Unauthorized: profile not found.");
    error.statusCode = 403;
    throw error;
  }

  return {
    user,
    profile,
    databases,
    storage,
  };
}

export function requireRole(profile, allowedRoles) {
  if (!allowedRoles.includes(profile.role)) {
    const error = new Error("Forbidden: role not allowed.");
    error.statusCode = 403;
    throw error;
  }
}

export function errorResponse(error) {
  const status = error.statusCode || 500;
  const message = error.message || "Unexpected server error.";

  return Response.json({ error: message }, { status });
}

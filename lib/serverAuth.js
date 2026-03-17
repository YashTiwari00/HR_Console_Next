import { Query } from "appwrite";
import { ALLOWED_ROLES, normalizeRole } from "@/lib/auth/roles";
import { readSessionFromRequest } from "@/lib/auth/session";
import { appwriteConfig } from "@/lib/appwrite";
import {
  createAdminServices,
  createJWTAccount,
  createSessionAccount,
  databaseId,
} from "@/lib/appwriteServer";

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

async function authenticateUser(request) {
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

  return user;
}

export async function requireSessionAuth(request) {
  const user = await authenticateUser(request);
  const { databases, storage } = createAdminServices();
  const profile = await getUserProfile(databases, user.$id);

  return {
    user,
    profile,
    databases,
    storage,
  };
}

export async function requireProfileAuth(request) {
  const context = await requireSessionAuth(request);

  if (!context.profile) {
    const error = new Error("Unauthorized: profile not found.");
    error.statusCode = 403;
    throw error;
  }

  return context;
}

export const requireAuth = requireProfileAuth;

export function requireRole(profile, allowedRoles) {
  const role = normalizeRole(profile?.role);
  const normalizedAllowedRoles = Array.isArray(allowedRoles)
    ? allowedRoles.map((item) => normalizeRole(item)).filter(Boolean)
    : ALLOWED_ROLES;

  if (!role || !normalizedAllowedRoles.includes(role)) {
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

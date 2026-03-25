import { appwriteConfig } from "@/lib/appwrite";
import { ALLOWED_ROLES, normalizeRole } from "@/lib/auth/roles";
import { databaseId, Query } from "@/lib/appwriteServer";
import { errorResponse, requireSessionAuth } from "@/lib/serverAuth";
import { NextResponse } from "next/server";

function isDocumentAlreadyExistsError(error) {
  const message = String(error?.message || error?.response?.message || "").toLowerCase();
  return message.includes("already exists") && message.includes("document");
}

function toSafeString(value) {
  return String(value || "").trim();
}

async function getProfileByUserId(databases, userId) {
  try {
    return await databases.getDocument(databaseId, appwriteConfig.usersCollectionId, userId);
  } catch {
    const result = await databases.listDocuments(databaseId, appwriteConfig.usersCollectionId, [
      Query.equal("$id", userId),
      Query.limit(1),
    ]);

    return result.documents[0] || null;
  }
}

async function applyOnboardingMutation(databases, user, currentProfile, nextRole, nextRegion) {
  const role = normalizeRole(nextRole) || "employee";
  const region = role === "region-admin" ? toSafeString(nextRegion) : "";

  if (role === "region-admin" && !region) {
    const error = new Error("Region is required for region admin onboarding.");
    error.statusCode = 400;
    throw error;
  }

  if (currentProfile) {
    const existingRole = normalizeRole(currentProfile.role);
    const existingRegion = toSafeString(currentProfile.region);

    if (
      existingRole === "region-admin" &&
      role === "region-admin" &&
      region &&
      !existingRegion
    ) {
      return databases.updateDocument(databaseId, appwriteConfig.usersCollectionId, user.$id, {
        region,
      });
    }

    if (existingRole && ALLOWED_ROLES.includes(existingRole)) {
      return currentProfile;
    }

    const updates = { role };
    if (region) {
      updates.region = region;
    }

    return databases.updateDocument(databaseId, appwriteConfig.usersCollectionId, user.$id, updates);
  }

  try {
    return await databases.createDocument(databaseId, appwriteConfig.usersCollectionId, user.$id, {
      name: user.name || user.email || "",
      email: user.email,
      role,
      ...(region ? { region } : {}),
      department: "engineering",
    });
  } catch (error) {
    if (!isDocumentAlreadyExistsError(error)) {
      throw error;
    }

    const profileAfterConflict = await getProfileByUserId(databases, user.$id);
    if (!profileAfterConflict) {
      throw error;
    }

    return applyOnboardingMutation(databases, user, profileAfterConflict, role, region);
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const role = normalizeRole(body?.role) || "employee";
    const region = toSafeString(body?.region);

    const { user, profile, databases } = await requireSessionAuth(request);
    const updated = await applyOnboardingMutation(databases, user, profile, role, region);

    return NextResponse.json({
      data: {
        profile: updated,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

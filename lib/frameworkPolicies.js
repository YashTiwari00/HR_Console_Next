import { appwriteConfig } from "@/lib/appwrite";
import { ID, Query, databaseId } from "@/lib/appwriteServer";
import { FRAMEWORK_TYPES } from "@/lib/appwriteSchema";

export const DEFAULT_ENABLED_FRAMEWORKS = Object.values(FRAMEWORK_TYPES);

function isMissingCollectionError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("collection") && message.includes("not found");
}

function isUnknownAttributeError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("attribute not found in schema") || message.includes("unknown attribute");
}

function normalizeFrameworkList(value) {
  if (!Array.isArray(value)) return [];

  const allowed = new Set(DEFAULT_ENABLED_FRAMEWORKS);
  const normalized = value
    .map((item) => String(item || "").trim().toUpperCase())
    .filter((item) => allowed.has(item));

  return [...new Set(normalized)];
}

export function validateFrameworkInput(frameworkType) {
  const normalized = String(frameworkType || "").trim().toUpperCase();
  return DEFAULT_ENABLED_FRAMEWORKS.includes(normalized) ? normalized : "";
}

export async function getFrameworkPolicy(databases) {
  try {
    let result;
    try {
      result = await databases.listDocuments(
        databaseId,
        appwriteConfig.frameworkPoliciesCollectionId,
        [Query.equal("isDefault", true), Query.orderDesc("$updatedAt"), Query.limit(1)]
      );
    } catch (error) {
      if (!isUnknownAttributeError(error)) {
        throw error;
      }

      result = await databases.listDocuments(
        databaseId,
        appwriteConfig.frameworkPoliciesCollectionId,
        [Query.orderDesc("$updatedAt"), Query.limit(1)]
      );
    }

    const doc = result.documents[0] || null;
    if (!doc) {
      return {
        source: "fallback",
        enabledFrameworks: DEFAULT_ENABLED_FRAMEWORKS,
      };
    }

    const enabledFrameworks = normalizeFrameworkList(doc.enabledFrameworks);

    return {
      source: "policy",
      policyId: doc.$id,
      enabledFrameworks:
        enabledFrameworks.length > 0 ? enabledFrameworks : DEFAULT_ENABLED_FRAMEWORKS,
      updatedAt: doc.updatedAt || doc.$updatedAt || null,
      updatedBy: doc.updatedBy || null,
      name: doc.name || "Default Framework Policy",
    };
  } catch (error) {
    if (isMissingCollectionError(error)) {
      return {
        source: "fallback",
        enabledFrameworks: DEFAULT_ENABLED_FRAMEWORKS,
      };
    }

    throw error;
  }
}

export function assertFrameworkAllowed(frameworkType, policy) {
  const normalized = validateFrameworkInput(frameworkType);
  if (!normalized) {
    const error = new Error("Invalid frameworkType.");
    error.statusCode = 400;
    throw error;
  }

  const enabled = Array.isArray(policy?.enabledFrameworks)
    ? policy.enabledFrameworks
    : DEFAULT_ENABLED_FRAMEWORKS;

  if (!enabled.includes(normalized)) {
    const error = new Error("Selected frameworkType is currently disabled by policy.");
    error.statusCode = 400;
    throw error;
  }

  return normalized;
}

export async function upsertDefaultFrameworkPolicy(databases, actorId, payload) {
  const normalizedList = normalizeFrameworkList(payload?.enabledFrameworks);

  if (normalizedList.length === 0) {
    const error = new Error("enabledFrameworks must contain at least one valid framework.");
    error.statusCode = 400;
    throw error;
  }

  let existing;
  try {
    existing = await databases.listDocuments(
      databaseId,
      appwriteConfig.frameworkPoliciesCollectionId,
      [Query.equal("isDefault", true), Query.orderDesc("$updatedAt"), Query.limit(1)]
    );
  } catch (error) {
    if (!isUnknownAttributeError(error)) {
      throw error;
    }

    existing = await databases.listDocuments(
      databaseId,
      appwriteConfig.frameworkPoliciesCollectionId,
      [Query.orderDesc("$updatedAt"), Query.limit(1)]
    );
  }

  const current = existing.documents[0] || null;
  const now = new Date().toISOString();
  const documentPayload = {
    name: String(payload?.name || "Default Framework Policy").trim() || "Default Framework Policy",
    enabledFrameworks: normalizedList,
    isDefault: true,
    updatedBy: String(actorId || "").trim() || null,
    updatedAt: now,
  };

  const createCompat = async () => {
    let nextPayload = { ...documentPayload };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await databases.createDocument(
          databaseId,
          appwriteConfig.frameworkPoliciesCollectionId,
          ID.unique(),
          nextPayload
        );
      } catch (error) {
        if (!isUnknownAttributeError(error) || !("isDefault" in nextPayload)) {
          throw error;
        }
        const fallbackPayload = { ...nextPayload };
        delete fallbackPayload.isDefault;
        nextPayload = fallbackPayload;
      }
    }

    throw new Error("Unable to create framework policy document.");
  };

  const updateCompat = async (id) => {
    let nextPayload = { ...documentPayload };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await databases.updateDocument(
          databaseId,
          appwriteConfig.frameworkPoliciesCollectionId,
          id,
          nextPayload
        );
      } catch (error) {
        if (!isUnknownAttributeError(error) || !("isDefault" in nextPayload)) {
          throw error;
        }
        const fallbackPayload = { ...nextPayload };
        delete fallbackPayload.isDefault;
        nextPayload = fallbackPayload;
      }
    }

    throw new Error("Unable to update framework policy document.");
  };

  if (current?.$id) {
    return updateCompat(current.$id);
  }

  return createCompat();
}

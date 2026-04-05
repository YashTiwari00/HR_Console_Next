import { appwriteConfig } from "@/lib/appwrite";
import { GOAL_LEVELS } from "@/lib/appwriteSchema";
import { ID, databaseId } from "@/lib/appwriteServer";

function isUnknownAttributeError(error) {
  return String(error?.message || "").toLowerCase().includes("unknown attribute");
}

function isMissingRequiredAttributeError(error, attribute) {
  const message = String(error?.message || "").toLowerCase();
  const normalizedAttribute = String(attribute || "").trim().toLowerCase();

  if (!normalizedAttribute) return false;
  return message.includes("missing required attribute") && message.includes(normalizedAttribute);
}

function extractUnknownAttributeName(error) {
  const message = String(error?.message || "");
  const match =
    message.match(/unknown attribute[^\"']*[\"']([^\"']+)[\"']/i) ||
    message.match(/attribute[^\"']*[\"']([^\"']+)[\"'][^\"']*unknown/i);

  return (match?.[1] || "").trim();
}

function normalizeOptionalCascadeFields(input = {}) {
  const parentGoalId = String(input.parentGoalId || "").trim();
  const cascadeSourceGoalId = String(input.cascadeSourceGoalId || parentGoalId).trim();
  const goalConversationId = String(input.goalConversationId || input.conversationId || "").trim();

  const out = {};

  if (parentGoalId) out.parentGoalId = parentGoalId;
  if (cascadeSourceGoalId) out.cascadeSourceGoalId = cascadeSourceGoalId;
  if (goalConversationId) out.goalConversationId = goalConversationId;

  if (typeof input.goalLevel !== "undefined" && input.goalLevel !== null && input.goalLevel !== "") {
    const normalizedLevel = String(input.goalLevel || "").trim().toLowerCase();
    if (Object.values(GOAL_LEVELS).includes(normalizedLevel)) {
      out.goalLevel = normalizedLevel;
    }
  }

  if (
    typeof input.contributionPercent !== "undefined" &&
    input.contributionPercent !== null &&
    input.contributionPercent !== ""
  ) {
    const parsedContribution = Number.parseInt(String(input.contributionPercent), 10);
    if (!Number.isNaN(parsedContribution) && parsedContribution >= 0 && parsedContribution <= 100) {
      out.contributionPercent = parsedContribution;
    }
  }

  return out;
}

export async function createGoalDocumentCompat(databases, payload) {
  const mutablePayload = {
    ...payload,
    progressPercent: 0,
    processPercent: 0,
  };

  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      return await databases.createDocument(
        databaseId,
        appwriteConfig.goalsCollectionId,
        ID.unique(),
        mutablePayload
      );
    } catch (error) {
      if (isUnknownAttributeError(error)) {
        const unknownField = extractUnknownAttributeName(error);

        if (unknownField && Object.prototype.hasOwnProperty.call(mutablePayload, unknownField)) {
          delete mutablePayload[unknownField];
          continue;
        }

        if (Object.prototype.hasOwnProperty.call(mutablePayload, "processPercent")) {
          delete mutablePayload.processPercent;
          continue;
        }

        if (Object.prototype.hasOwnProperty.call(mutablePayload, "progressPercent")) {
          delete mutablePayload.progressPercent;
          continue;
        }
      }

      if (
        isMissingRequiredAttributeError(error, "processPercent") &&
        !Object.prototype.hasOwnProperty.call(mutablePayload, "processPercent")
      ) {
        mutablePayload.processPercent = 0;
        continue;
      }

      if (
        isMissingRequiredAttributeError(error, "progressPercent") &&
        !Object.prototype.hasOwnProperty.call(mutablePayload, "progressPercent")
      ) {
        mutablePayload.progressPercent = 0;
        continue;
      }

      throw error;
    }
  }

  throw new Error("Unable to create goal with compatible schema fallback.");
}

export function buildCascadeLineage(parentGoal, inputLineageRef = "") {
  const baseLineage = String(inputLineageRef || parentGoal?.lineageRef || "").trim();
  const marker = `cascade:${String(parentGoal?.$id || "").trim()}`;

  if (!marker || marker === "cascade:") {
    return baseLineage;
  }

  if (!baseLineage) {
    return marker;
  }

  return baseLineage.includes(marker) ? baseLineage : `${baseLineage} > ${marker}`;
}

export function isGoalChildOfParent(goal, parentGoalId) {
  const normalizedParentId = String(parentGoalId || "").trim();

  if (!normalizedParentId) return false;
  if (String(goal?.$id || "").trim() === normalizedParentId) return false;

  if (String(goal?.parentGoalId || "").trim() === normalizedParentId) {
    return true;
  }

  const lineageRef = String(goal?.lineageRef || "");
  if (!lineageRef) return false;

  return lineageRef.includes(`cascade:${normalizedParentId}`) || lineageRef.includes(normalizedParentId);
}

export function buildCascadePayload({
  parentGoal,
  title,
  description,
  cycleId,
  frameworkType,
  managerId,
  employeeId,
  weightage,
  dueDate,
  aiSuggested,
  lineageRef,
  optionalFields,
}) {
  return {
    employeeId,
    managerId,
    cycleId,
    frameworkType,
    title,
    description,
    weightage,
    status: "draft",
    dueDate,
    lineageRef,
    aiSuggested: Boolean(aiSuggested),
    ...normalizeOptionalCascadeFields(optionalFields),
    parentGoalId: String(parentGoal?.$id || "").trim(),
    cascadeSourceGoalId: String(parentGoal?.$id || "").trim(),
  };
}

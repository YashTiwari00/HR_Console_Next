import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import {
  buildRatingDropExplainability,
  buildRatingDropMessage,
  toRatingLabel,
} from "@/lib/ratingDropMessaging";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { listUsersByIds } from "@/lib/teamAccess";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function toSafeLimit(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, parsed));
}

function isMissingCollectionError(error, collectionId) {
  const message = String(error?.message || "").toLowerCase();
  const target = String(collectionId || "").trim().toLowerCase();
  return (
    message.includes("collection") &&
    (message.includes("not found") || message.includes("could not be found")) &&
    (!target || message.includes(target))
  );
}

function normalizeRiskLevel(input) {
  const value = String(input || "").trim().toUpperCase();
  if (value === "HIGH RISK") return "HIGH RISK";
  if (value === "MODERATE") return "MODERATE";
  return "";
}

async function listRatingDropInsights(databases, queries) {
  try {
    const response = await databases.listDocuments(
      databaseId,
      appwriteConfig.ratingDropInsightsCollectionId,
      queries
    );

    return response.documents || [];
  } catch (error) {
    if (isMissingCollectionError(error, appwriteConfig.ratingDropInsightsCollectionId)) {
      return [];
    }

    throw error;
  }
}

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["manager", "hr"]);

    const role = String(profile?.role || "").trim().toLowerCase();
    const profileId = String(profile?.$id || "").trim();
    const { searchParams } = new URL(request.url);

    const cycleId = String(searchParams.get("cycleId") || "").trim().toUpperCase();
    const requestedManagerId = String(searchParams.get("managerId") || "").trim();
    const riskLevel = normalizeRiskLevel(searchParams.get("riskLevel"));
    const limit = toSafeLimit(searchParams.get("limit"));

    const managerId = role === "manager" ? profileId : requestedManagerId;

    const queries = [Query.orderDesc("createdAt"), Query.limit(limit)];
    if (cycleId) queries.push(Query.equal("cycleId", cycleId));
    if (managerId) queries.push(Query.equal("managerId", managerId));
    if (riskLevel) queries.push(Query.equal("riskLevel", riskLevel));

    const insightRows = await listRatingDropInsights(databases, queries);
    if (insightRows.length === 0) {
      return Response.json({
        data: {
          filters: {
            cycleId: cycleId || null,
            managerId: managerId || null,
            riskLevel: riskLevel || null,
          },
          rows: [],
        },
      });
    }

    const employeeIds = Array.from(
      new Set(insightRows.map((row) => String(row?.employeeId || "").trim()).filter(Boolean))
    );

    const employeeProfiles = await listUsersByIds(databases, employeeIds);
    const employeeNameById = new Map(
      employeeProfiles.map((item) => [String(item?.$id || "").trim(), String(item?.name || "").trim()])
    );

    const rows = insightRows.map((row) => {
      const employeeId = String(row?.employeeId || "").trim();
      const employeeName = employeeNameById.get(employeeId) || "Unknown Employee";
      const previousRating = Number(row?.previousRating);
      const currentRating = Number(row?.currentRating);
      const previousRatingLabel = toRatingLabel(previousRating);
      const currentRatingLabel = toRatingLabel(currentRating);
      const drop = Number(row?.drop);
      const rowRiskLevel = normalizeRiskLevel(row?.riskLevel);
      const dropSeverity = rowRiskLevel || "UNKNOWN";

      return {
        employeeId,
        employeeName,
        previousRatingLabel,
        currentRatingLabel,
        dropSeverity,
        shortMessage: buildRatingDropMessage({
          employeeName,
          previousRating,
          currentRating,
        }),
        explainability: buildRatingDropExplainability({
          drop,
          riskLevel: rowRiskLevel,
          cycleId,
        }),
        riskLevel: rowRiskLevel || null,
        drop: Number.isFinite(drop) ? drop : null,
        cycleId: String(row?.cycleId || "").trim() || null,
        createdAt: String(row?.createdAt || "").trim() || null,
      };
    });

    return Response.json({
      data: {
        filters: {
          cycleId: cycleId || null,
          managerId: managerId || null,
          riskLevel: riskLevel || null,
        },
        rows,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

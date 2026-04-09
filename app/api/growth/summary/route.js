import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import {
  buildFallbackPayload,
  dedupeTnaItems,
  deriveReadinessFromHistory,
  isMissingCollectionError,
  iso,
  mapReadinessBand,
  text,
} from "@/app/api/growth/_lib/summaryHelpers";

const MAX_HISTORY = 3;
const MAX_GOALS = 20;
const MAX_SELF_REVIEWS = 10;
const MAX_TNA_ITEMS = 5;

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee"]);

    const employeeId = text(profile?.$id);
    const employeeName = text(profile?.name);
    const role = text(profile?.role);
    const department = text(profile?.department);

    const partialErrors = {};

    let cycleHistory = [];
    let snapshotData = {
      performanceBand: null,
      potentialBand: null,
      readinessBand: null,
      cycleId: null,
      computedAt: null,
    };
    let recentGoalsRaw = [];
    let recentGoals = [];
    let selfReviews = [];
    let selfReviewSummary = { totalSubmitted: 0, latestCycleId: null };
    let tnaItems = [];
    let latestReadiness = null;

    try {
      const scoresResponse = await databases.listDocuments(
        databaseId,
        appwriteConfig.employeeCycleScoresCollectionId,
        [
          Query.equal("employeeId", employeeId),
          Query.orderDesc("computedAt"),
          Query.limit(MAX_HISTORY),
        ]
      );

      const rows = scoresResponse.documents || [];
      if (rows.length > 0) {
        const cycleIds = Array.from(new Set(rows.map((row) => text(row?.cycleId)).filter(Boolean)));
        const cycleById = new Map();

        try {
          const byIdResponse = await databases.listDocuments(
            databaseId,
            appwriteConfig.goalCyclesCollectionId,
            [Query.equal("$id", cycleIds), Query.limit(100)]
          );
          (byIdResponse.documents || []).forEach((cycle) => {
            cycleById.set(text(cycle?.$id), cycle);
            cycleById.set(text(cycle?.name), cycle);
          });
        } catch (error) {
          if (!isMissingCollectionError(error, appwriteConfig.goalCyclesCollectionId)) {
            throw error;
          }
        }

        cycleHistory = rows.map((row) => {
          const cycleId = text(row?.cycleId);
          const cycle = cycleById.get(cycleId) || null;
          return {
            cycleId,
            cycleName: text(cycle?.name || cycleId),
            scoreLabel: text(row?.scoreLabel) || null,
            computedAt: iso(row?.computedAt),
          };
        });
      }
    } catch (error) {
      if (!isMissingCollectionError(error, appwriteConfig.employeeCycleScoresCollectionId)) {
        partialErrors.cycleHistory = true;
        cycleHistory = null;
      } else {
        cycleHistory = [];
      }
    }

    try {
      const snapshotResponse = await databases.listDocuments(
        databaseId,
        appwriteConfig.talentSnapshotsCollectionId,
        [
          Query.equal("employeeId", employeeId),
          Query.orderDesc("computedAt"),
          Query.limit(1),
        ]
      );
      const doc = snapshotResponse.documents?.[0] || null;
      if (doc) {
        snapshotData = {
          performanceBand: text(doc.performanceBand) || null,
          potentialBand: text(doc.potentialBand) || null,
          readinessBand: text(doc.readinessBand) || null,
          cycleId: text(doc.cycleId) || null,
          computedAt: iso(doc.computedAt),
        };
      }
    } catch (error) {
      if (!isMissingCollectionError(error, appwriteConfig.talentSnapshotsCollectionId)) {
        partialErrors.talentSnapshot = true;
        snapshotData = null;
      }
    }

    try {
      const goalsResponse = await databases.listDocuments(
        databaseId,
        appwriteConfig.goalsCollectionId,
        [
          Query.equal("employeeId", employeeId),
          Query.equal("status", ["approved", "closed"]),
          Query.orderDesc("$createdAt"),
          Query.limit(MAX_GOALS),
        ]
      );
      recentGoalsRaw = goalsResponse.documents || [];
      recentGoals = recentGoalsRaw.map((goal) => ({
        $id: text(goal?.$id),
        title: text(goal?.title),
        cycleId: text(goal?.cycleId),
        frameworkType: text(goal?.frameworkType),
        progressPercent: Number.isFinite(Number(goal?.progressPercent)) ? Number(goal.progressPercent) : 0,
        managerFinalRatingLabel: goal?.ratingVisibleToEmployee ? text(goal?.managerFinalRatingLabel) || null : null,
        weightage: Number.isFinite(Number(goal?.weightage)) ? Number(goal.weightage) : 0,
      }));
    } catch {
      partialErrors.recentGoals = true;
      recentGoals = null;
      recentGoalsRaw = [];
    }

    try {
      const reviewsResponse = await databases.listDocuments(
        databaseId,
        appwriteConfig.goalSelfReviewsCollectionId,
        [
          Query.equal("employeeId", employeeId),
          Query.equal("status", "submitted"),
          Query.orderDesc("$createdAt"),
          Query.limit(MAX_SELF_REVIEWS),
        ]
      );
      const rows = reviewsResponse.documents || [];
      selfReviews = rows.map((row) => ({
        goalId: text(row?.goalId),
        cycleId: text(row?.cycleId),
        selfRatingLabel: text(row?.selfRatingLabel) || null,
        challenges: text(row?.challenges),
        achievements: text(row?.achievements),
      }));
      selfReviewSummary = {
        totalSubmitted: selfReviews.length,
        latestCycleId: text(selfReviews[0]?.cycleId) || null,
      };
    } catch {
      partialErrors.selfReviews = true;
      selfReviews = null;
      selfReviewSummary = null;
    }

    try {
      const ratingSignals = (recentGoalsRaw || [])
        .filter((goal) => goal?.ratingVisibleToEmployee && ["SME", "NI"].includes(text(goal?.managerFinalRatingLabel).toUpperCase()))
        .map((goal) => ({ area: text(goal?.title), signal: "rating", cycleId: text(goal?.cycleId) }));

      const selfReviewSignals = (selfReviews || [])
        .filter((row) => text(row?.challenges))
        .map((row) => ({
          area: text(row?.challenges).slice(0, 60),
          signal: "self_review",
          cycleId: text(row?.cycleId),
        }));

      const progressSignals = (recentGoalsRaw || [])
        .filter((goal) => Number(goal?.progressPercent || 0) < 50)
        .map((goal) => ({
          area: text(goal?.title) || "Completion challenge",
          signal: "progress",
          cycleId: text(goal?.cycleId),
        }));

      tnaItems = dedupeTnaItems([...ratingSignals, ...selfReviewSignals, ...progressSignals]);
    } catch {
      partialErrors.tnaItems = true;
      tnaItems = null;
    }

    try {
      const fromSnapshot = mapReadinessBand(snapshotData?.readinessBand);
      if (fromSnapshot) {
        latestReadiness = { ...fromSnapshot, source: "snapshot" };
      } else {
        latestReadiness = { ...deriveReadinessFromHistory(cycleHistory), source: "derived" };
      }
    } catch {
      partialErrors.latestReadiness = true;
      latestReadiness = null;
    }

    const partial = Object.keys(partialErrors).length > 0;

    return Response.json({
      data: {
        employeeId,
        employeeName,
        role,
        department,
        cycleHistory,
        latestReadiness,
        tnaItems,
        recentGoals,
        selfReviewSummary,
        dataAvailable: {
          hasCycleHistory: Array.isArray(cycleHistory) && cycleHistory.length > 0,
          hasTalentSnapshot: Boolean(snapshotData?.readinessBand),
          hasTnaItems: Array.isArray(tnaItems) && tnaItems.length > 0,
        },
        generatedAt: new Date().toISOString(),
      },
      partial,
      partialErrors,
    });
  } catch (error) {
    if (error?.statusCode === 401 || error?.statusCode === 403) {
      return errorResponse(error);
    }

    return Response.json(
      {
        data: buildFallbackPayload(),
        partial: true,
        partialErrors: { endpoint: true },
      },
      { status: 200 }
    );
  }
}

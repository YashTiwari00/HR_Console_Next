import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { listManagersByHrId, listUsersByIds } from "@/lib/teamAccess";

function latestReviewByCheckIn(approvals) {
  const map = new Map();

  for (const item of approvals) {
    const id = String(item.checkInId || "").trim();
    if (!id) continue;

    const existing = map.get(id);
    if (!existing) {
      map.set(id, item);
      continue;
    }

    const existingTime = new Date(existing.decidedAt || "").valueOf();
    const nextTime = new Date(item.decidedAt || "").valueOf();

    if (Number.isNaN(existingTime) || (!Number.isNaN(nextTime) && nextTime > existingTime)) {
      map.set(id, item);
    }
  }

  return map;
}

function isMissingCollectionError(error) {
  const message = String(error?.message || "").toLowerCase();
  const collectionId = String(appwriteConfig.checkInApprovalsCollectionId || "").toLowerCase();

  return (
    message.includes("collection") &&
    message.includes("requested id") &&
    message.includes("could not be found") &&
    (!collectionId || message.includes(collectionId))
  );
}

async function listApprovalsSafe(databases) {
  try {
    const response = await databases.listDocuments(
      databaseId,
      appwriteConfig.checkInApprovalsCollectionId,
      [Query.orderDesc("decidedAt"), Query.limit(400)]
    );

    return { rows: response.documents, available: true };
  } catch (error) {
    if (isMissingCollectionError(error)) {
      return { rows: [], available: false };
    }

    throw error;
  }
}

async function listManagerCycleRatingsSafe(databases) {
  try {
    const response = await databases.listDocuments(
      databaseId,
      appwriteConfig.managerCycleRatingsCollectionId,
      [Query.orderDesc("ratedAt"), Query.limit(400)]
    );

    return response.documents;
  } catch {
    return [];
  }
}

function reviewStatusOf(latestReview) {
  if (!latestReview) return "pending";
  if (latestReview.decision === "approved") return "approved";
  if (latestReview.decision === "rejected") return "rejected";
  return "needs_changes";
}

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    const { searchParams } = new URL(request.url);
    const statusFilter = (searchParams.get("status") || "pending").trim();

    const [assignedManagers, checkInsResult, goalsResult, approvalsResult, managerCycleRatings] = await Promise.all([
      listManagersByHrId(databases, profile.$id),
      databases.listDocuments(databaseId, appwriteConfig.checkInsCollectionId, [
        Query.equal("status", "completed"),
        Query.orderDesc("scheduledAt"),
        Query.limit(200),
      ]),
      databases.listDocuments(databaseId, appwriteConfig.goalsCollectionId, [
        Query.limit(200),
      ]),
      listApprovalsSafe(databases),
      listManagerCycleRatingsSafe(databases),
    ]);

    const assignedManagerIds = new Set(
      assignedManagers.map((manager) => String(manager.$id || "").trim()).filter(Boolean)
    );

    const latestReviewMap = latestReviewByCheckIn(approvalsResult.rows);
    const goalById = new Map(goalsResult.documents.map((goal) => [goal.$id, goal]));
    const managerRatingByCycle = new Map();

    for (const row of managerCycleRatings) {
      const key = `${String(row.managerId || "").trim()}|${String(row.cycleId || "").trim()}`;
      if (!key.trim()) continue;
      if (!managerRatingByCycle.has(key)) {
        managerRatingByCycle.set(key, row);
      }
    }

    const userIds = new Set();
    const scopedCheckIns = checkInsResult.documents.filter((checkIn) =>
      assignedManagerIds.has(String(checkIn.managerId || "").trim())
    );

    for (const checkIn of scopedCheckIns) {
      userIds.add(String(checkIn.managerId || "").trim());
      userIds.add(String(checkIn.employeeId || "").trim());
    }

    const users = await listUsersByIds(databases, Array.from(userIds).filter(Boolean));
    const userById = new Map(users.map((item) => [item.$id, item]));

    const rows = scopedCheckIns
      .map((checkIn) => {
        const latestReview = latestReviewMap.get(checkIn.$id);
        const reviewStatus = reviewStatusOf(latestReview);
        const manager = userById.get(String(checkIn.managerId || "").trim());
        const employee = userById.get(String(checkIn.employeeId || "").trim());
        const goal = goalById.get(String(checkIn.goalId || "").trim());
        const managerCycleRating = managerRatingByCycle.get(
          `${String(checkIn.managerId || "").trim()}|${String(goal?.cycleId || "").trim()}`
        );

        return {
          checkInId: checkIn.$id,
          goalId: checkIn.goalId,
          goalTitle: goal?.title || checkIn.goalId,
          managerId: checkIn.managerId,
          managerName: manager?.name || checkIn.managerId,
          employeeId: checkIn.employeeId,
          employeeName: employee?.name || checkIn.employeeId,
          scheduledAt: checkIn.scheduledAt,
          completedAt: checkIn.$updatedAt,
          status: checkIn.status,
          managerNotes: checkIn.managerNotes || "",
          transcriptText: checkIn.transcriptText || "",
          isFinalCheckIn: Boolean(checkIn.isFinalCheckIn),
          managerRating: checkIn.managerRating,
          managerCycleId: goal?.cycleId || "",
          hrManagerRating: managerCycleRating
            ? {
                rating: Number(managerCycleRating.rating || 0),
                ratingLabel: managerCycleRating.ratingLabel || "",
                comments: managerCycleRating.comments || "",
                ratedAt: managerCycleRating.ratedAt,
                hrId: managerCycleRating.hrId,
              }
            : null,
          reviewStatus,
          latestReview: latestReview
            ? {
                decision: latestReview.decision,
                comments: latestReview.comments || "",
                decidedAt: latestReview.decidedAt,
                hrId: latestReview.hrId,
              }
            : null,
        };
      })
      .filter((item) => {
        if (statusFilter === "all") return true;
        return item.reviewStatus === statusFilter;
      });

    return Response.json({
      data: rows,
      meta: {
        checkInApprovalsCollectionAvailable: approvalsResult.available,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const { profile } = await requireAuth(request);
    requireRole(profile, ["hr"]);
    return Response.json(
      { error: "Forbidden: HR can supervise only and cannot approve check-ins." },
      { status: 403 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

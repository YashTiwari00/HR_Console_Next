import { appwriteConfig } from "@/lib/appwrite";
import { ID, Query, databaseId } from "@/lib/appwriteServer";
import { parseRatingInput } from "@/lib/ratings";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { listUsersByIds } from "@/lib/teamAccess";

const VALID_DECISIONS = ["approved", "rejected", "needs_changes"];

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

    const [checkInsResult, goalsResult, approvalsResult, managerCycleRatings] = await Promise.all([
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
    for (const checkIn of checkInsResult.documents) {
      userIds.add(String(checkIn.managerId || "").trim());
      userIds.add(String(checkIn.employeeId || "").trim());
    }

    const users = await listUsersByIds(databases, Array.from(userIds).filter(Boolean));
    const userById = new Map(users.map((item) => [item.$id, item]));

    const rows = checkInsResult.documents
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
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    const body = await request.json();
    const checkInId = String(body.checkInId || "").trim();
    const decision = String(body.decision || "").trim();
    const comments = String(body.comments || "").trim();
    const parsedManagerRating = parseRatingInput(
      body.managerRatingLabel || body.managerRating || body.hrManagerRating
    );

    if (!checkInId || !decision) {
      return Response.json({ error: "checkInId and decision are required." }, { status: 400 });
    }

    if (!VALID_DECISIONS.includes(decision)) {
      return Response.json({ error: "Invalid decision." }, { status: 400 });
    }

    let checkIn;
    try {
      checkIn = await databases.getDocument(databaseId, appwriteConfig.checkInsCollectionId, checkInId);
    } catch {
      return Response.json({ error: "Check-in not found." }, { status: 404 });
    }

    let goal = null;
    try {
      goal = await databases.getDocument(
        databaseId,
        appwriteConfig.goalsCollectionId,
        String(checkIn.goalId || "").trim()
      );
    } catch {
      goal = null;
    }

    if (checkIn.status !== "completed") {
      return Response.json({ error: "Only completed check-ins can be reviewed by HR." }, { status: 400 });
    }

    let managerProfile = null;
    try {
      managerProfile = await databases.getDocument(
        databaseId,
        appwriteConfig.usersCollectionId,
        String(checkIn.managerId || "").trim()
      );
    } catch {
      managerProfile = null;
    }

    const assignedHrId = String(managerProfile?.hrId || "").trim();
    if (managerProfile?.role === "manager" && assignedHrId && assignedHrId !== profile.$id) {
      return Response.json(
        { error: "Forbidden: this manager is assigned to a different HR owner." },
        { status: 403 }
      );
    }

    try {
      if (goal && Number.isInteger(parsedManagerRating.value)) {
        try {
          const existingManagerRating = await databases.listDocuments(
            databaseId,
            appwriteConfig.managerCycleRatingsCollectionId,
            [
              Query.equal("managerId", String(checkIn.managerId || "").trim()),
              Query.equal("cycleId", String(goal.cycleId || "").trim()),
              Query.limit(1),
            ]
          );

          const existingRow = existingManagerRating.documents[0];
          if (existingRow) {
            await databases.updateDocument(
              databaseId,
              appwriteConfig.managerCycleRatingsCollectionId,
              existingRow.$id,
              {
                hrId: profile.$id,
                rating: parsedManagerRating.value,
                ratingLabel: parsedManagerRating.label,
                comments,
                ratedAt: new Date().toISOString(),
              }
            );
          } else {
            await databases.createDocument(
              databaseId,
              appwriteConfig.managerCycleRatingsCollectionId,
              ID.unique(),
              {
                managerId: String(checkIn.managerId || "").trim(),
                hrId: profile.$id,
                cycleId: String(goal.cycleId || "").trim(),
                rating: parsedManagerRating.value,
                ratingLabel: parsedManagerRating.label,
                comments,
                ratedAt: new Date().toISOString(),
              }
            );
          }
        } catch {
          // manager_cycle_ratings collection can be introduced after deployment.
        }
      }

      const approval = await databases.createDocument(
        databaseId,
        appwriteConfig.checkInApprovalsCollectionId,
        ID.unique(),
        {
          checkInId,
          managerId: String(checkIn.managerId || "").trim(),
          hrId: profile.$id,
          decision,
          comments,
          decidedAt: new Date().toISOString(),
        }
      );

      return Response.json({ data: approval }, { status: 201 });
    } catch (error) {
      if (isMissingCollectionError(error)) {
        return Response.json(
          {
            error:
              "checkin_approvals collection is missing. Create collection id checkin_approvals with attributes: checkInId, managerId, hrId, decision, comments, decidedAt.",
          },
          { status: 501 }
        );
      }

      throw error;
    }
  } catch (error) {
    return errorResponse(error);
  }
}

import { appwriteConfig } from "@/lib/appwrite";
import { MATRIX_REVIEW_ASSIGNMENT_STATUS } from "@/lib/appwriteSchema";
import {
  computeMatrixBlend,
  isMissingCollectionError,
  listAssignments,
  listFeedback,
} from "@/lib/matrixReviews";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertManagerCanAccessEmployee } from "@/lib/teamAccess";

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "hr"]);

    const { searchParams } = new URL(request.url);
    const employeeId = String(searchParams.get("employeeId") || "").trim();
    const cycleId = String(searchParams.get("cycleId") || "").trim();
    const goalId = String(searchParams.get("goalId") || "").trim();

    if (!employeeId) {
      return Response.json({ error: "employeeId is required." }, { status: 400 });
    }

    const profileId = String(profile.$id || "").trim();
    const role = String(profile.role || "").trim();

    if (role === "employee" && employeeId !== profileId) {
      return Response.json({ error: "Forbidden for requested employee." }, { status: 403 });
    }

    if (role === "manager") {
      await assertManagerCanAccessEmployee(databases, profileId, employeeId);
    }

    let assignments;
    let feedbackRows;

    try {
      [assignments, feedbackRows] = await Promise.all([
        listAssignments(databases, {
          employeeId,
          cycleId,
          goalId,
          status: MATRIX_REVIEW_ASSIGNMENT_STATUS.ACTIVE,
        }),
        listFeedback(databases, {
          employeeId,
          cycleId,
          goalId,
        }),
      ]);
    } catch (error) {
      if (
        isMissingCollectionError(error, appwriteConfig.matrixReviewerAssignmentsCollectionId) ||
        isMissingCollectionError(error, appwriteConfig.matrixReviewerFeedbackCollectionId)
      ) {
        return Response.json(
          { error: "Matrix reviewer collections are not available. Run schema apply first." },
          { status: 409 }
        );
      }
      throw error;
    }

    const blend = computeMatrixBlend(feedbackRows, assignments.map((row) => ({ ...row, $id: row.$id })));

    const respondedAssignmentIds = new Set(
      feedbackRows
        .map((row) => String(row.assignmentId || "").trim())
        .filter(Boolean)
    );

    const pendingCount = assignments.filter(
      (row) => !respondedAssignmentIds.has(String(row.$id || "").trim())
    ).length;

    return Response.json({
      data: {
        employeeId,
        cycleId: cycleId || undefined,
        goalId: goalId || undefined,
        reviewerCount: Number(blend.reviewerCount || 0),
        responseCount: Number(blend.responseCount || 0),
        influenceWeightTotal: Number(blend.influenceWeightTotal || 0),
        weightedRating:
          blend.weightedRating === null || blend.weightedRating === undefined
            ? null
            : Number(blend.weightedRating),
        keySignals: Array.isArray(blend.keySignals) ? blend.keySignals : [],
        assignmentCount: assignments.length,
        pendingCount,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

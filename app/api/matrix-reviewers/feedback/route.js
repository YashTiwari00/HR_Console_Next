import { appwriteConfig } from "@/lib/appwrite";
import { databaseId } from "@/lib/appwriteServer";
import { createCompat, isMissingCollectionError, listFeedback } from "@/lib/matrixReviews";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertManagerCanAccessEmployee } from "@/lib/teamAccess";

function toSuggestedRating(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number.parseInt(String(value), 10);
  if (Number.isNaN(numeric) || numeric < 1 || numeric > 5) return null;
  return numeric;
}

function toConfidence(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "low" || normalized === "high") return normalized;
  return "medium";
}

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "hr"]);

    const { searchParams } = new URL(request.url);
    const assignmentId = String(searchParams.get("assignmentId") || "").trim();
    const employeeId = String(searchParams.get("employeeId") || "").trim();
    const reviewerId = String(searchParams.get("reviewerId") || "").trim();
    const cycleId = String(searchParams.get("cycleId") || "").trim();
    const goalId = String(searchParams.get("goalId") || "").trim();

    const role = String(profile.role || "").trim();
    if (role === "employee") {
      if (reviewerId && reviewerId !== profile.$id) {
        return Response.json({ error: "Forbidden for requested reviewer." }, { status: 403 });
      }
      if (employeeId && employeeId !== profile.$id) {
        return Response.json({ error: "Forbidden for requested employee." }, { status: 403 });
      }
    }

    if (role === "manager" && employeeId) {
      await assertManagerCanAccessEmployee(databases, profile.$id, employeeId);
    }

    let rows;
    try {
      rows = await listFeedback(databases, {
        assignmentId,
        employeeId: employeeId || "",
        reviewerId: reviewerId || (role === "employee" ? profile.$id : ""),
        cycleId,
        goalId,
      });
    } catch (error) {
      if (isMissingCollectionError(error, appwriteConfig.matrixReviewerFeedbackCollectionId)) {
        return Response.json(
          { error: "matrix_reviewer_feedback collection is not available. Run schema apply first." },
          { status: 409 }
        );
      }
      throw error;
    }

    return Response.json({
      data: rows.map((row) => ({
        id: row.$id,
        assignmentId: row.assignmentId,
        employeeId: row.employeeId,
        reviewerId: row.reviewerId,
        goalId: row.goalId || null,
        cycleId: row.cycleId,
        feedbackText: row.feedbackText,
        suggestedRating: row.suggestedRating ?? null,
        confidence: row.confidence || "medium",
        createdAt: row.createdAt || row.$createdAt,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "hr"]);

    const body = await request.json();
    const assignmentId = String(body?.assignmentId || "").trim();
    const employeeId = String(body?.employeeId || "").trim();
    const goalId = String(body?.goalId || "").trim();
    const cycleId = String(body?.cycleId || "").trim();
    const feedbackText = String(body?.feedbackText || "").trim();
    const suggestedRating = toSuggestedRating(body?.suggestedRating);
    const confidence = toConfidence(body?.confidence);

    if (!assignmentId || !employeeId || !cycleId || !feedbackText) {
      return Response.json(
        { error: "assignmentId, employeeId, cycleId and feedbackText are required." },
        { status: 400 }
      );
    }

    let assignment;
    try {
      assignment = await databases.getDocument(
        databaseId,
        appwriteConfig.matrixReviewerAssignmentsCollectionId,
        assignmentId
      );
    } catch (error) {
      if (isMissingCollectionError(error, appwriteConfig.matrixReviewerAssignmentsCollectionId)) {
        return Response.json(
          { error: "matrix_reviewer_assignments collection is not available. Run schema apply first." },
          { status: 409 }
        );
      }
      throw error;
    }

    if (String(assignment.employeeId || "").trim() !== employeeId) {
      return Response.json({ error: "assignmentId and employeeId mismatch." }, { status: 400 });
    }

    if (String(assignment.cycleId || "").trim() !== cycleId) {
      return Response.json({ error: "assignmentId and cycleId mismatch." }, { status: 400 });
    }

    if (String(assignment.reviewerId || "").trim() !== String(profile.$id || "").trim()) {
      return Response.json({ error: "Only assigned reviewer can submit matrix feedback." }, { status: 403 });
    }

    const role = String(profile.role || "").trim();
    if (role === "manager") {
      await assertManagerCanAccessEmployee(databases, String(assignment.primaryManagerId || "").trim(), employeeId);
    }

    let duplicate;
    try {
      duplicate = await listFeedback(databases, {
        assignmentId,
        reviewerId: String(profile.$id || "").trim(),
        goalId,
      });
    } catch (error) {
      if (isMissingCollectionError(error, appwriteConfig.matrixReviewerFeedbackCollectionId)) {
        return Response.json(
          { error: "matrix_reviewer_feedback collection is not available. Run schema apply first." },
          { status: 409 }
        );
      }
      throw error;
    }

    if (duplicate.length > 0) {
      return Response.json({ error: "Matrix feedback already submitted for this assignment context." }, { status: 409 });
    }

    let created;
    try {
      created = await createCompat(databases, appwriteConfig.matrixReviewerFeedbackCollectionId, {
        assignmentId,
        employeeId,
        reviewerId: String(profile.$id || "").trim(),
        goalId: goalId || null,
        cycleId,
        feedbackText,
        suggestedRating,
        confidence,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      if (isMissingCollectionError(error, appwriteConfig.matrixReviewerFeedbackCollectionId)) {
        return Response.json(
          { error: "matrix_reviewer_feedback collection is not available. Run schema apply first." },
          { status: 409 }
        );
      }
      throw error;
    }

    return Response.json(
      {
        data: {
          id: created.$id,
          assignmentId: created.assignmentId,
          employeeId: created.employeeId,
          reviewerId: created.reviewerId,
          goalId: created.goalId || null,
          cycleId: created.cycleId,
          feedbackText: created.feedbackText,
          suggestedRating: created.suggestedRating ?? null,
          confidence: created.confidence || "medium",
          createdAt: created.createdAt || created.$createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

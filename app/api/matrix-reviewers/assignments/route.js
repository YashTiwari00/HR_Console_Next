import { appwriteConfig } from "@/lib/appwrite";
import { MATRIX_REVIEW_ASSIGNMENT_STATUS } from "@/lib/appwriteSchema";
import { databaseId } from "@/lib/appwriteServer";
import {
  createCompat,
  isMissingCollectionError,
  listAssignments,
  normalizeWeight,
} from "@/lib/matrixReviews";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertManagerCanAccessEmployee } from "@/lib/teamAccess";

function toStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === MATRIX_REVIEW_ASSIGNMENT_STATUS.INACTIVE) {
    return MATRIX_REVIEW_ASSIGNMENT_STATUS.INACTIVE;
  }
  return MATRIX_REVIEW_ASSIGNMENT_STATUS.ACTIVE;
}

async function assertReviewerExists(databases, reviewerId) {
  const reviewer = await databases.getDocument(databaseId, appwriteConfig.usersCollectionId, reviewerId);
  const role = String(reviewer?.role || "").trim();
  if (role !== "employee" && role !== "manager" && role !== "hr") {
    const error = new Error("reviewerId must belong to employee, manager, or hr profile.");
    error.statusCode = 400;
    throw error;
  }
}

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "hr"]);

    const { searchParams } = new URL(request.url);
    const employeeId = String(searchParams.get("employeeId") || "").trim();
    const reviewerId = String(searchParams.get("reviewerId") || "").trim();
    const cycleId = String(searchParams.get("cycleId") || "").trim();
    const goalId = String(searchParams.get("goalId") || "").trim();

    const role = String(profile.role || "").trim();
    const profileId = String(profile.$id || "").trim();

    if (role === "employee") {
      if (employeeId && employeeId !== profileId) {
        return Response.json({ error: "Forbidden for requested employee." }, { status: 403 });
      }

      if (reviewerId && reviewerId !== profileId) {
        return Response.json({ error: "Forbidden for requested reviewer." }, { status: 403 });
      }
    }

    if (role === "manager") {
      if (employeeId) {
        await assertManagerCanAccessEmployee(databases, profile.$id, employeeId);
      }

      if (reviewerId && reviewerId !== profile.$id) {
        return Response.json({ error: "Managers can only query assignments for themselves as reviewer." }, { status: 403 });
      }
    }

    const filters = {
      employeeId: employeeId || (role === "employee" && !reviewerId ? profileId : ""),
      reviewerId: reviewerId || (role === "manager" ? profile.$id : ""),
      cycleId,
      goalId,
    };

    let rows;
    try {
      rows = await listAssignments(databases, filters);
    } catch (error) {
      if (isMissingCollectionError(error, appwriteConfig.matrixReviewerAssignmentsCollectionId)) {
        return Response.json(
          { error: "matrix_reviewer_assignments collection is not available. Run schema apply first." },
          { status: 409 }
        );
      }
      throw error;
    }

    return Response.json({
      data: rows.map((row) => ({
        id: row.$id,
        employeeId: row.employeeId,
        primaryManagerId: row.primaryManagerId,
        reviewerId: row.reviewerId,
        goalId: row.goalId || null,
        cycleId: row.cycleId,
        influenceWeight: Number(row.influenceWeight || 0),
        status: row.status || MATRIX_REVIEW_ASSIGNMENT_STATUS.ACTIVE,
        assignedBy: row.assignedBy,
        assignedAt: row.assignedAt || row.$createdAt,
        notes: row.notes || "",
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["manager", "hr"]);

    const body = await request.json();
    const employeeId = String(body?.employeeId || "").trim();
    const reviewerId = String(body?.reviewerId || "").trim();
    const cycleId = String(body?.cycleId || "").trim();
    const goalId = String(body?.goalId || "").trim();
    const notes = String(body?.notes || "").trim();
    const influenceWeight = normalizeWeight(body?.influenceWeight);
    const status = toStatus(body?.status);

    if (!employeeId || !reviewerId || !cycleId || !influenceWeight) {
      return Response.json(
        { error: "employeeId, reviewerId, cycleId and influenceWeight are required." },
        { status: 400 }
      );
    }

    if (employeeId === reviewerId) {
      return Response.json({ error: "reviewerId cannot equal employeeId." }, { status: 400 });
    }

    const role = String(profile.role || "").trim();
    if (role === "manager") {
      await assertManagerCanAccessEmployee(databases, profile.$id, employeeId);
    }

    await assertReviewerExists(databases, reviewerId);

    let existing;
    try {
      existing = await listAssignments(databases, {
        employeeId,
        reviewerId,
        cycleId,
        goalId,
        status: MATRIX_REVIEW_ASSIGNMENT_STATUS.ACTIVE,
      });
    } catch (error) {
      if (isMissingCollectionError(error, appwriteConfig.matrixReviewerAssignmentsCollectionId)) {
        return Response.json(
          { error: "matrix_reviewer_assignments collection is not available. Run schema apply first." },
          { status: 409 }
        );
      }
      throw error;
    }

    if (existing.length > 0) {
      return Response.json(
        { error: "Active assignment already exists for this employee/reviewer context." },
        { status: 409 }
      );
    }

    let created;
    try {
      created = await createCompat(databases, appwriteConfig.matrixReviewerAssignmentsCollectionId, {
        employeeId,
        primaryManagerId: role === "manager" ? String(profile.$id || "").trim() : String(body?.primaryManagerId || "").trim() || String(profile.$id || "").trim(),
        reviewerId,
        goalId: goalId || null,
        cycleId,
        influenceWeight,
        status,
        assignedBy: String(profile.$id || "").trim(),
        assignedAt: new Date().toISOString(),
        notes,
      });
    } catch (error) {
      if (isMissingCollectionError(error, appwriteConfig.matrixReviewerAssignmentsCollectionId)) {
        return Response.json(
          { error: "matrix_reviewer_assignments collection is not available. Run schema apply first." },
          { status: 409 }
        );
      }
      throw error;
    }

    return Response.json(
      {
        data: {
          id: created.$id,
          employeeId: created.employeeId,
          primaryManagerId: created.primaryManagerId,
          reviewerId: created.reviewerId,
          goalId: created.goalId || null,
          cycleId: created.cycleId,
          influenceWeight: Number(created.influenceWeight || 0),
          status: created.status || MATRIX_REVIEW_ASSIGNMENT_STATUS.ACTIVE,
          assignedBy: created.assignedBy,
          assignedAt: created.assignedAt || created.$createdAt,
          notes: created.notes || "",
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

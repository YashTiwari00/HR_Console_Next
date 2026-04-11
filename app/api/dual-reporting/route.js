/**
 * /api/dual-reporting
 *
 * Manages employee → manager weighted assignments (dual-reporting).
 * Distinct from /api/manager-assignments which handles manager hierarchy.
 *
 * GET  ?employeeId=<id>                  - get assignments for an employee (manager/hr)
 * GET  ?managerId=<id>                   - get employee IDs under a manager (manager/hr)
 * POST  body:{employeeId, assignments}   - set/replace assignments for an employee (hr)
 * DELETE ?employeeId=<id>               - clear all assignments for an employee (hr)
 */

import { appwriteConfig } from "@/lib/appwrite";
import { databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import {
  getEmployeeManagerAssignments,
  getAssignedEmployeeIdsForManager,
  setEmployeeManagerAssignments,
} from "@/lib/dualReporting";

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["manager", "leadership", "hr"]);

    const { searchParams } = new URL(request.url);
    const employeeId = (searchParams.get("employeeId") || "").trim();
    const managerId = (searchParams.get("managerId") || "").trim();

    if (!employeeId && !managerId) {
      return Response.json(
        { error: "Provide employeeId or managerId as a query parameter." },
        { status: 400 }
      );
    }

    if (employeeId) {
      const assignments = await getEmployeeManagerAssignments(databases, employeeId);

      // Enrich with manager name/email
      const enriched = await Promise.all(
        assignments.map(async (a) => {
          let managerName = "";
          let managerEmail = "";
          try {
            const mgr = await databases.getDocument(
              databaseId,
              appwriteConfig.usersCollectionId,
              a.managerId
            );
            managerName = mgr.name || "";
            managerEmail = mgr.email || "";
          } catch {
            // Manager profile missing — still return the raw assignment
          }
          return {
            assignmentId: a.$id,
            employeeId: a.employeeId,
            managerId: a.managerId,
            managerName,
            managerEmail,
            weightPercent: a.weightPercent,
            isPrimary: a.isPrimary,
            assignedAt: a.assignedAt,
            notes: a.notes || null,
          };
        })
      );

      return Response.json({ data: enriched });
    }

    // managerId query
    const employeeIds = await getAssignedEmployeeIdsForManager(databases, managerId);
    return Response.json({ data: employeeIds });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    const body = await request.json();
    const employeeId = (body.employeeId || "").trim();
    const assignments = body.assignments;

    if (!employeeId) {
      return Response.json({ error: "employeeId is required." }, { status: 400 });
    }
    if (!Array.isArray(assignments) || assignments.length === 0) {
      return Response.json({ error: "assignments array is required." }, { status: 400 });
    }

    for (const a of assignments) {
      const weight = Number(a.weightPercent);
      if (!a.managerId || !Number.isInteger(weight) || weight < 1 || weight > 100) {
        return Response.json(
          { error: "Each assignment needs managerId (string) and weightPercent (integer 1–100)." },
          { status: 400 }
        );
      }
    }

    const created = await setEmployeeManagerAssignments(
      databases,
      employeeId,
      assignments,
      profile.$id
    );

    return Response.json({ data: created }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    const { searchParams } = new URL(request.url);
    const employeeId = (searchParams.get("employeeId") || "").trim();

    if (!employeeId) {
      return Response.json({ error: "employeeId is required." }, { status: 400 });
    }

    const existing = await getEmployeeManagerAssignments(databases, employeeId);
    await Promise.all(
      existing.map((doc) =>
        databases.deleteDocument(
          databaseId,
          appwriteConfig.managerAssignmentsCollectionId,
          doc.$id
        )
      )
    );

    return Response.json({ data: { deleted: existing.length } });
  } catch (error) {
    return errorResponse(error);
  }
}

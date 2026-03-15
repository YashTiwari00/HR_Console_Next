import { appwriteConfig } from "@/lib/appwrite";
import { databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { mapUserSummary } from "@/lib/teamAccess";

async function validateManager(databases, managerId) {
  const manager = await databases.getDocument(
    databaseId,
    appwriteConfig.usersCollectionId,
    managerId
  );

  if (manager.role !== "manager") {
    return { error: "target managerId must belong to a manager profile.", status: 400 };
  }

  return { manager };
}

async function applyAssignmentPatch(databases, employee, managerId, hrUserId) {
  const nextVersion = Number(employee.assignmentVersion || 0) + 1;

  const fullPatch = {
    managerId,
    managerAssignedAt: managerId ? new Date().toISOString() : null,
    managerAssignedBy: managerId ? hrUserId : "",
    assignmentVersion: nextVersion,
  };

  try {
    return await databases.updateDocument(
      databaseId,
      appwriteConfig.usersCollectionId,
      employee.$id,
      fullPatch
    );
  } catch (error) {
    if (String(error?.message || "").toLowerCase().includes("unknown attribute")) {
      return databases.updateDocument(
        databaseId,
        appwriteConfig.usersCollectionId,
        employee.$id,
        { managerId }
      );
    }

    throw error;
  }
}

export async function PUT(request, context) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    const params = await context.params;
    const employeeId = (params.employeeId || "").trim();

    if (!employeeId) {
      return Response.json({ error: "employeeId is required in path." }, { status: 400 });
    }

    const body = await request.json();
    const managerId = (body.managerId || "").trim();

    if (!managerId) {
      return Response.json({ error: "managerId is required." }, { status: 400 });
    }

    if (employeeId === managerId) {
      return Response.json(
        { error: "employee cannot be assigned as their own manager." },
        { status: 400 }
      );
    }

    const employee = await databases.getDocument(
      databaseId,
      appwriteConfig.usersCollectionId,
      employeeId
    );

    if (employee.role !== "employee") {
      return Response.json(
        { error: "target employeeId must belong to an employee profile." },
        { status: 400 }
      );
    }

    const managerValidation = await validateManager(databases, managerId);
    if (managerValidation.error) {
      return Response.json({ error: managerValidation.error }, { status: managerValidation.status });
    }

    const updated = await applyAssignmentPatch(databases, employee, managerId, profile.$id);
    return Response.json({ data: mapUserSummary(updated) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request, context) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    const params = await context.params;
    const employeeId = (params.employeeId || "").trim();

    if (!employeeId) {
      return Response.json({ error: "employeeId is required in path." }, { status: 400 });
    }

    const employee = await databases.getDocument(
      databaseId,
      appwriteConfig.usersCollectionId,
      employeeId
    );

    if (employee.role !== "employee") {
      return Response.json(
        { error: "target employeeId must belong to an employee profile." },
        { status: 400 }
      );
    }

    const updated = await applyAssignmentPatch(databases, employee, "", profile.$id);
    return Response.json({ data: mapUserSummary(updated) });
  } catch (error) {
    return errorResponse(error);
  }
}

import { appwriteConfig } from "@/lib/appwrite";
import { databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { mapManagerAssignmentSummary } from "@/lib/teamAccess";

async function validateManager(databases, managerId) {
  if (!managerId) {
    return { error: "managerId is required in path.", status: 400 };
  }

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

async function validateHr(databases, hrId) {
  if (!hrId) {
    return { error: "hrId is required.", status: 400 };
  }

  const hr = await databases.getDocument(databaseId, appwriteConfig.usersCollectionId, hrId);

  if (hr.role !== "hr") {
    return { error: "target hrId must belong to an hr profile.", status: 400 };
  }

  return { hr };
}

async function applyHrAssignmentPatch(databases, manager, hrId, actorId) {
  const nextVersion = Number(manager.hrAssignmentVersion || 0) + 1;

  const fullPatch = {
    hrId,
    hrAssignedAt: hrId ? new Date().toISOString() : null,
    hrAssignedBy: actorId,
    hrAssignmentVersion: nextVersion,
  };

  try {
    return await databases.updateDocument(
      databaseId,
      appwriteConfig.usersCollectionId,
      manager.$id,
      fullPatch
    );
  } catch (error) {
    if (String(error?.message || "").toLowerCase().includes("unknown attribute")) {
      return databases.updateDocument(
        databaseId,
        appwriteConfig.usersCollectionId,
        manager.$id,
        { hrId }
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
    const managerId = String(params.managerId || "").trim();

    const managerValidation = await validateManager(databases, managerId);
    if (managerValidation.error) {
      return Response.json({ error: managerValidation.error }, { status: managerValidation.status });
    }

    const body = await request.json();
    const hrId = String(body.hrId || "").trim();

    if (hrId === managerId) {
      return Response.json({ error: "manager and hr cannot be the same user." }, { status: 400 });
    }

    const hrValidation = await validateHr(databases, hrId);
    if (hrValidation.error) {
      return Response.json({ error: hrValidation.error }, { status: hrValidation.status });
    }

    const updated = await applyHrAssignmentPatch(databases, managerValidation.manager, hrId, profile.$id);

    return Response.json({
      data: mapManagerAssignmentSummary(updated, {
        hrProfile: hrValidation.hr,
      }),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request, context) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    const params = await context.params;
    const managerId = String(params.managerId || "").trim();

    const managerValidation = await validateManager(databases, managerId);
    if (managerValidation.error) {
      return Response.json({ error: managerValidation.error }, { status: managerValidation.status });
    }

    const updated = await applyHrAssignmentPatch(databases, managerValidation.manager, "", profile.$id);

    return Response.json({
      data: mapManagerAssignmentSummary(updated),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

import { appwriteConfig } from "@/lib/appwrite";
import { databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { listDescendantManagerIds, mapManagerAssignmentSummary } from "@/lib/teamAccess";

async function validateManager(databases, managerId) {
  if (!managerId) {
    return { error: "managerId is required in path.", status: 400 };
  }

  const manager = await databases.getDocument(
    databaseId,
    appwriteConfig.usersCollectionId,
    managerId
  );

  if (!["manager", "leadership"].includes(String(manager.role || "").trim())) {
    return { error: "target managerId must belong to a manager profile.", status: 400 };
  }

  return { manager };
}

async function validateParentManager(databases, parentManagerId) {
  if (!parentManagerId) {
    return { error: "parentManagerId is required.", status: 400 };
  }

  const parentManager = await databases.getDocument(databaseId, appwriteConfig.usersCollectionId, parentManagerId);

  if (!["manager", "leadership"].includes(String(parentManager.role || "").trim())) {
    return { error: "target parentManagerId must belong to a manager or leadership profile.", status: 400 };
  }

  return { parentManager };
}

async function applyParentAssignmentPatch(databases, manager, parentManagerId, actorId) {
  const nextVersion = Number(manager.assignmentVersion || 0) + 1;

  const fullPatch = {
    managerId: parentManagerId,
    managerAssignedAt: parentManagerId ? new Date().toISOString() : null,
    managerAssignedBy: actorId,
    assignmentVersion: nextVersion,
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
        { managerId: parentManagerId }
      );
    }

    throw error;
  }
}

export async function PUT(request, context) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["leadership"]);

    const params = await context.params;
    const managerId = String(params.managerId || "").trim();

    const managerValidation = await validateManager(databases, managerId);
    if (managerValidation.error) {
      return Response.json({ error: managerValidation.error }, { status: managerValidation.status });
    }

    const body = await request.json();
    const parentManagerId = String(body.parentManagerId || body.hrId || "").trim();

    if (parentManagerId === managerId) {
      return Response.json({ error: "manager cannot report to self." }, { status: 400 });
    }

    const parentValidation = await validateParentManager(databases, parentManagerId);
    if (parentValidation.error) {
      return Response.json({ error: parentValidation.error }, { status: parentValidation.status });
    }

    const descendantIds = await listDescendantManagerIds(databases, managerId);
    if (descendantIds.includes(parentManagerId)) {
      return Response.json(
        { error: "Invalid hierarchy: parent manager cannot be a descendant of manager." },
        { status: 400 }
      );
    }

    const updated = await applyParentAssignmentPatch(
      databases,
      managerValidation.manager,
      parentManagerId,
      profile.$id
    );

    return Response.json({
      data: mapManagerAssignmentSummary(updated, {
        parentManagerProfile: parentValidation.parentManager,
      }),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request, context) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["leadership"]);

    const params = await context.params;
    const managerId = String(params.managerId || "").trim();

    const managerValidation = await validateManager(databases, managerId);
    if (managerValidation.error) {
      return Response.json({ error: managerValidation.error }, { status: managerValidation.status });
    }

    const updated = await applyParentAssignmentPatch(databases, managerValidation.manager, "", profile.$id);

    return Response.json({
      data: mapManagerAssignmentSummary(updated),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

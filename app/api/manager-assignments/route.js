import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import {
  listDescendantManagerIds,
  listUsersByIds,
  mapManagerAssignmentSummary,
  mapUserSummary,
} from "@/lib/teamAccess";

async function validateManagerAndParent(databases, managerId, parentManagerId) {
  if (!managerId || !parentManagerId) {
    return { error: "managerId and parentManagerId are required.", status: 400 };
  }

  if (managerId === parentManagerId) {
    return { error: "manager cannot report to self.", status: 400 };
  }

  const [manager, parentManager] = await Promise.all([
    databases.getDocument(databaseId, appwriteConfig.usersCollectionId, managerId),
    databases.getDocument(databaseId, appwriteConfig.usersCollectionId, parentManagerId),
  ]);

  if (!["manager", "leadership"].includes(String(manager.role || "").trim())) {
    return { error: "target managerId must belong to a manager profile.", status: 400 };
  }

  if (!["manager", "leadership"].includes(String(parentManager.role || "").trim())) {
    return { error: "target parentManagerId must belong to a manager or leadership profile.", status: 400 };
  }

  const descendantIds = await listDescendantManagerIds(databases, managerId);
  if (descendantIds.includes(parentManagerId)) {
    return { error: "Invalid hierarchy: parent manager cannot be a descendant of manager.", status: 400 };
  }

  return { manager, parentManager };
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

function toBoolean(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["leadership"]);

    const { searchParams } = new URL(request.url);
    const selectedParentManagerId = (searchParams.get("parentManagerId") || "").trim();
    const onlyUnassigned = toBoolean(searchParams.get("unassigned"));

    const managersResult = await databases.listDocuments(
      databaseId,
      appwriteConfig.usersCollectionId,
      [Query.equal("role", ["manager", "leadership"]), Query.orderAsc("name"), Query.limit(200)]
    );

    let managers = managersResult.documents;

    if (selectedParentManagerId) {
      managers = managers.filter((item) => String(item.managerId || "").trim() === selectedParentManagerId);
    }

    if (onlyUnassigned) {
      managers = managers.filter((item) => !String(item.managerId || "").trim());
    }

    const parentManagerIds = Array.from(
      new Set(managers.map((item) => String(item.managerId || "").trim()).filter(Boolean))
    );

    const assignedByIds = Array.from(
      new Set(managers.map((item) => String(item.managerAssignedBy || "").trim()).filter(Boolean))
    );

    const [managerPool, assignedByUsers] = await Promise.all([
      databases.listDocuments(databaseId, appwriteConfig.usersCollectionId, [
        Query.equal("role", ["manager", "leadership"]),
        Query.orderAsc("name"),
        Query.limit(200),
      ]),
      listUsersByIds(databases, assignedByIds),
    ]);

    const parentManagerById = new Map(managerPool.documents.map((item) => [item.$id, item]));
    const assignedByById = new Map(assignedByUsers.map((item) => [item.$id, item]));

    if (parentManagerIds.length > 0) {
      const missingParentIds = parentManagerIds.filter((id) => !parentManagerById.has(id));
      if (missingParentIds.length > 0) {
        const missingParentProfiles = await listUsersByIds(databases, missingParentIds);
        missingParentProfiles
          .filter((item) => ["manager", "leadership"].includes(String(item?.role || "").trim()))
          .forEach((item) => parentManagerById.set(item.$id, item));
      }
    }

    const rows = managers.map((manager) =>
      mapManagerAssignmentSummary(manager, {
        parentManagerProfile: parentManagerById.get(String(manager.managerId || "").trim()),
        assignedByProfile: assignedByById.get(String(manager.managerAssignedBy || "").trim()),
      })
    );

    const unassignedManagers = managers.filter((item) => !String(item.managerId || "").trim()).length;

    return Response.json({
      data: rows,
      meta: {
        totalManagers: managers.length,
        unassignedManagers,
        managerUsers: managerPool.documents.map(mapUserSummary),
        hrUsers: managerPool.documents.map(mapUserSummary),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["leadership"]);

    const body = await request.json();
    const managerId = (body.managerId || "").trim();
    const parentManagerId = (body.parentManagerId || body.hrId || "").trim();

    const validated = await validateManagerAndParent(databases, managerId, parentManagerId);
    if (validated.error) {
      return Response.json({ error: validated.error }, { status: validated.status });
    }

    if (String(validated.manager.managerId || "").trim()) {
      return Response.json(
        { error: "manager already has a parent manager assignment. Use PUT to reassign." },
        { status: 409 }
      );
    }

    const updated = await applyParentAssignmentPatch(databases, validated.manager, parentManagerId, profile.$id);
    return Response.json(
      {
        data: mapManagerAssignmentSummary(updated, {
          parentManagerProfile: validated.parentManager,
        }),
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

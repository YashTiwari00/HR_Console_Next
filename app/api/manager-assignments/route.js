import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { listUsersByIds, mapManagerAssignmentSummary, mapUserSummary } from "@/lib/teamAccess";

async function validateManagerAndHr(databases, managerId, hrId) {
  if (!managerId || !hrId) {
    return { error: "managerId and hrId are required.", status: 400 };
  }

  if (managerId === hrId) {
    return { error: "manager and hr cannot be the same user.", status: 400 };
  }

  const [manager, hr] = await Promise.all([
    databases.getDocument(databaseId, appwriteConfig.usersCollectionId, managerId),
    databases.getDocument(databaseId, appwriteConfig.usersCollectionId, hrId),
  ]);

  if (manager.role !== "manager") {
    return { error: "target managerId must belong to a manager profile.", status: 400 };
  }

  if (hr.role !== "hr") {
    return { error: "target hrId must belong to an hr profile.", status: 400 };
  }

  return { manager, hr };
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

function toBoolean(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    const { searchParams } = new URL(request.url);
    const selectedHrId = (searchParams.get("hrId") || "").trim();
    const onlyUnassigned = toBoolean(searchParams.get("unassigned"));

    const managersResult = await databases.listDocuments(
      databaseId,
      appwriteConfig.usersCollectionId,
      [Query.equal("role", "manager"), Query.orderAsc("name"), Query.limit(200)]
    );

    let managers = managersResult.documents;

    if (selectedHrId) {
      managers = managers.filter((item) => String(item.hrId || "").trim() === selectedHrId);
    }

    if (onlyUnassigned) {
      managers = managers.filter((item) => !String(item.hrId || "").trim());
    }

    const hrIds = Array.from(
      new Set(managers.map((item) => String(item.hrId || "").trim()).filter(Boolean))
    );

    const assignedByIds = Array.from(
      new Set(managers.map((item) => String(item.hrAssignedBy || "").trim()).filter(Boolean))
    );

    const [hrsResult, assignedByUsers] = await Promise.all([
      databases.listDocuments(databaseId, appwriteConfig.usersCollectionId, [
        Query.equal("role", "hr"),
        Query.orderAsc("name"),
        Query.limit(200),
      ]),
      listUsersByIds(databases, assignedByIds),
    ]);

    const hrById = new Map(hrsResult.documents.map((item) => [item.$id, item]));
    const assignedByById = new Map(assignedByUsers.map((item) => [item.$id, item]));

    // Ensure hr metadata can be resolved even when filter excludes the HR list.
    if (hrIds.length > 0) {
      const missingHrIds = hrIds.filter((id) => !hrById.has(id));
      if (missingHrIds.length > 0) {
        const missingHrProfiles = await listUsersByIds(databases, missingHrIds);
        missingHrProfiles
          .filter((item) => item.role === "hr")
          .forEach((item) => hrById.set(item.$id, item));
      }
    }

    const rows = managers.map((manager) =>
      mapManagerAssignmentSummary(manager, {
        hrProfile: hrById.get(String(manager.hrId || "").trim()),
        assignedByProfile: assignedByById.get(String(manager.hrAssignedBy || "").trim()),
      })
    );

    const unassignedManagers = managers.filter((item) => !String(item.hrId || "").trim()).length;

    return Response.json({
      data: rows,
      meta: {
        totalManagers: managers.length,
        unassignedManagers,
        hrUsers: hrsResult.documents.map(mapUserSummary),
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
    const managerId = (body.managerId || "").trim();
    const hrId = (body.hrId || "").trim();

    const validated = await validateManagerAndHr(databases, managerId, hrId);
    if (validated.error) {
      return Response.json({ error: validated.error }, { status: validated.status });
    }

    if (String(validated.manager.hrId || "").trim()) {
      return Response.json(
        { error: "manager already has an hr assignment. Use PUT to reassign." },
        { status: 409 }
      );
    }

    const updated = await applyHrAssignmentPatch(databases, validated.manager, hrId, profile.$id);
    return Response.json(
      {
        data: mapManagerAssignmentSummary(updated, {
          hrProfile: validated.hr,
        }),
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

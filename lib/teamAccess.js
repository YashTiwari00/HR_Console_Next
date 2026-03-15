import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";

const MAX_QUERY_IDS = 100;

function uniqueIds(ids) {
  return Array.from(new Set(ids.filter(Boolean)));
}

export async function listUsersByIds(databases, ids) {
  const unique = uniqueIds(ids);
  if (unique.length === 0) return [];

  const chunks = [];
  for (let i = 0; i < unique.length; i += MAX_QUERY_IDS) {
    chunks.push(unique.slice(i, i + MAX_QUERY_IDS));
  }

  const results = await Promise.all(
    chunks.map((chunk) =>
      databases.listDocuments(databaseId, appwriteConfig.usersCollectionId, [
        Query.equal("$id", chunk),
        Query.limit(MAX_QUERY_IDS),
      ])
    )
  );

  const merged = [];
  const seen = new Set();

  for (const result of results) {
    for (const doc of result.documents) {
      if (!seen.has(doc.$id)) {
        seen.add(doc.$id);
        merged.push(doc);
      }
    }
  }

  return merged;
}

export async function listAssignedEmployeeIdsForManager(databases, managerId) {
  if (!managerId) return [];

  const employees = await databases.listDocuments(
    databaseId,
    appwriteConfig.usersCollectionId,
    [
      Query.equal("role", "employee"),
      Query.equal("managerId", managerId),
      Query.limit(200),
    ]
  );

  return uniqueIds(employees.documents.map((item) => item.$id));
}

export async function listFallbackEmployeeIdsFromGoals(databases, managerId) {
  if (!managerId) return [];

  const goals = await databases.listDocuments(
    databaseId,
    appwriteConfig.goalsCollectionId,
    [Query.equal("managerId", managerId), Query.limit(200)]
  );

  return uniqueIds(goals.documents.map((item) => item.employeeId));
}

export async function getManagerTeamEmployeeIds(databases, managerId, options) {
  const includeFallback = options?.includeFallback ?? true;

  const assigned = await listAssignedEmployeeIdsForManager(databases, managerId);
  if (!includeFallback) {
    return assigned;
  }

  const fallback = await listFallbackEmployeeIdsFromGoals(databases, managerId);
  return uniqueIds([...assigned, ...fallback]);
}

export async function assertManagerCanAccessEmployee(databases, managerId, employeeId) {
  if (!employeeId) return;
  if (employeeId === managerId) return;

  const teamIds = await getManagerTeamEmployeeIds(databases, managerId, {
    includeFallback: true,
  });

  if (!teamIds.includes(employeeId)) {
    const error = new Error("Forbidden for requested employee.");
    error.statusCode = 403;
    throw error;
  }
}

export async function listManagersByHrId(databases, hrId) {
  const queries = [Query.equal("role", "manager"), Query.limit(200)];
  if (hrId) {
    queries.push(Query.equal("hrId", hrId));
  }

  const managers = await databases.listDocuments(
    databaseId,
    appwriteConfig.usersCollectionId,
    queries
  );

  return managers.documents;
}

export async function assertHrCanAccessManagerAssignment(databases, hrId, managerId, options) {
  const allowUnassigned = options?.allowUnassigned ?? true;

  const manager = await databases.getDocument(
    databaseId,
    appwriteConfig.usersCollectionId,
    managerId
  );

  if (manager.role !== "manager") {
    const error = new Error("target managerId must belong to a manager profile.");
    error.statusCode = 400;
    throw error;
  }

  const assignedHrId = String(manager.hrId || "").trim();
  if (!assignedHrId && allowUnassigned) {
    return manager;
  }

  if (assignedHrId && assignedHrId !== hrId) {
    const error = new Error("Forbidden for requested manager.");
    error.statusCode = 403;
    throw error;
  }

  return manager;
}

export function mapManagerAssignmentSummary(manager, context) {
  return {
    managerId: manager.$id,
    managerName: manager.name || "",
    managerEmail: manager.email || "",
    department: manager.department || "",
    hrId: manager.hrId || "",
    hrName: context?.hrProfile?.name || "",
    hrEmail: context?.hrProfile?.email || "",
    hrAssignedAt: manager.hrAssignedAt || null,
    hrAssignedBy: manager.hrAssignedBy || "",
    hrAssignmentVersion: Number(manager.hrAssignmentVersion || 0),
  };
}

export function mapUserSummary(profile) {
  return {
    $id: profile.$id,
    name: profile.name || "",
    email: profile.email || "",
    role: profile.role || "",
    department: profile.department || "",
    managerId: profile.managerId || "",
    managerAssignedAt: profile.managerAssignedAt || null,
    managerAssignedBy: profile.managerAssignedBy || "",
    assignmentVersion: Number(profile.assignmentVersion || 0),
    hrId: profile.hrId || "",
    hrAssignedAt: profile.hrAssignedAt || null,
    hrAssignedBy: profile.hrAssignedBy || "",
    hrAssignmentVersion: Number(profile.hrAssignmentVersion || 0),
  };
}

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
  };
}

import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";

const MAX_QUERY_IDS = 100;
const MAX_PAGE_SIZE = 200;

function uniqueIds(ids) {
  return Array.from(new Set(ids.filter(Boolean)));
}

export function getProfileRegion(profile) {
  return String(profile?.region || "").trim();
}

export function assertProfileRegion(profile) {
  const region = getProfileRegion(profile);
  if (!region) {
    const error = new Error("Region is not configured for this user profile.");
    error.statusCode = 403;
    throw error;
  }

  return region;
}

export function isSameRegion(profile, region) {
  const profileRegion = getProfileRegion(profile);
  const targetRegion = String(region || "").trim();
  return Boolean(profileRegion) && Boolean(targetRegion) && profileRegion === targetRegion;
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

  // Legacy: employees with managerId set on their user profile
  const legacyResult = await databases.listDocuments(
    databaseId,
    appwriteConfig.usersCollectionId,
    [
      Query.equal("role", "employee"),
      Query.equal("managerId", managerId),
      Query.limit(200),
    ]
  );
  const legacyIds = legacyResult.documents.map((item) => item.$id);

  // Dual-reporting: employees assigned via manager_assignments collection
  let dualIds = [];
  try {
    const dualResult = await databases.listDocuments(
      databaseId,
      appwriteConfig.managerAssignmentsCollectionId,
      [Query.equal("managerId", managerId), Query.limit(200)]
    );
    dualIds = (dualResult.documents || [])
      .map((doc) => String(doc.employeeId || "").trim())
      .filter(Boolean);
  } catch {
    // Collection may not exist yet (pre-migration) — safe to ignore
  }

  return uniqueIds([...legacyIds, ...dualIds]);
}

async function listUsersByManagerId(databases, managerId) {
  if (!managerId) return [];

  const result = await databases.listDocuments(
    databaseId,
    appwriteConfig.usersCollectionId,
    [
      Query.equal("managerId", managerId),
      Query.limit(MAX_PAGE_SIZE),
    ]
  );

  return result.documents || [];
}

export async function listDescendantManagerIds(databases, managerId) {
  if (!managerId) return [];

  const queue = [managerId];
  const visited = new Set([managerId]);
  const descendants = [];

  while (queue.length > 0) {
    const current = queue.shift();
    const children = await listUsersByManagerId(databases, current);

    for (const row of children) {
      const role = String(row?.role || "").trim().toLowerCase();
      const rowId = String(row?.$id || "").trim();
      if (!rowId) continue;

      if ((role === "manager" || role === "leadership") && !visited.has(rowId)) {
        visited.add(rowId);
        descendants.push(rowId);
        queue.push(rowId);
      }
    }
  }

  return uniqueIds(descendants);
}

async function listEmployeeIdsForManagerIds(databases, managerIds) {
  const ids = uniqueIds(managerIds);
  if (ids.length === 0) return [];

  const chunks = [];
  for (let i = 0; i < ids.length; i += MAX_QUERY_IDS) {
    chunks.push(ids.slice(i, i + MAX_QUERY_IDS));
  }

  // Legacy: employees with managerId on user profile
  const legacyResponses = await Promise.all(
    chunks.map((chunk) =>
      databases.listDocuments(databaseId, appwriteConfig.usersCollectionId, [
        Query.equal("role", "employee"),
        Query.equal("managerId", chunk),
        Query.limit(MAX_PAGE_SIZE),
      ])
    )
  );
  const legacyIds = legacyResponses.flatMap(
    (response) => (response.documents || []).map((item) => String(item?.$id || "").trim())
  );

  // Dual-reporting: employees assigned via manager_assignments
  let dualIds = [];
  try {
    const dualResponses = await Promise.all(
      chunks.map((chunk) =>
        databases.listDocuments(databaseId, appwriteConfig.managerAssignmentsCollectionId, [
          Query.equal("managerId", chunk),
          Query.limit(MAX_PAGE_SIZE),
        ])
      )
    );
    dualIds = dualResponses.flatMap(
      (response) => (response.documents || []).map((doc) => String(doc.employeeId || "").trim())
    );
  } catch {
    // Collection may not exist yet (pre-migration) — safe to ignore
  }

  return uniqueIds([...legacyIds, ...dualIds]);
}

export async function listFallbackEmployeeIdsFromGoals(databases, managerIdOrIds) {
  const managerIds = Array.isArray(managerIdOrIds)
    ? uniqueIds(managerIdOrIds)
    : uniqueIds([managerIdOrIds]);

  if (managerIds.length === 0) return [];

  const chunks = [];
  for (let i = 0; i < managerIds.length; i += MAX_QUERY_IDS) {
    chunks.push(managerIds.slice(i, i + MAX_QUERY_IDS));
  }

  const responses = await Promise.all(
    chunks.map((chunk) =>
      databases.listDocuments(databaseId, appwriteConfig.goalsCollectionId, [
        Query.equal("managerId", chunk),
        Query.limit(MAX_PAGE_SIZE),
      ])
    )
  );

  return uniqueIds(
    responses.flatMap((response) => (response.documents || []).map((item) => String(item?.employeeId || "").trim()))
  );
}

export async function getManagerTeamEmployeeIds(databases, managerId, options) {
  const includeFallback = options?.includeFallback ?? true;

  const descendantManagerIds = await listDescendantManagerIds(databases, managerId);
  const managerIdsForScope = uniqueIds([managerId, ...descendantManagerIds]);
  const assigned = await listEmployeeIdsForManagerIds(databases, managerIdsForScope);
  if (!includeFallback) {
    return assigned;
  }

  const fallback = await listFallbackEmployeeIdsFromGoals(databases, managerIdsForScope);
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
    parentManagerId: manager.managerId || "",
    parentManagerName: context?.parentManagerProfile?.name || "",
    parentManagerEmail: context?.parentManagerProfile?.email || "",
    managerAssignedAt: manager.managerAssignedAt || null,
    managerAssignedBy: manager.managerAssignedBy || "",
    assignmentVersion: Number(manager.assignmentVersion || 0),
    assignedByName: context?.assignedByProfile?.name || "",
    assignedByEmail: context?.assignedByProfile?.email || "",
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
    region: profile.region || "",
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

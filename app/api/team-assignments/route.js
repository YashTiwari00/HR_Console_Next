import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { mapUserSummary } from "@/lib/teamAccess";

async function validateAssignmentSubjects(databases, employeeId, managerId) {
  if (!employeeId || !managerId) {
    return { error: "employeeId and managerId are required.", status: 400 };
  }

  if (employeeId === managerId) {
    return { error: "employee cannot be assigned as their own manager.", status: 400 };
  }

  const [employee, manager] = await Promise.all([
    databases.getDocument(databaseId, appwriteConfig.usersCollectionId, employeeId),
    databases.getDocument(databaseId, appwriteConfig.usersCollectionId, managerId),
  ]);

  if (employee.role !== "employee") {
    return { error: "target employeeId must belong to an employee profile.", status: 400 };
  }

  if (manager.role !== "manager") {
    return { error: "target managerId must belong to a manager profile.", status: 400 };
  }

  return { employee, manager };
}

async function patchEmployeeManager(databases, employeeId, managerId, hrUserId, nextVersion) {
  const fullPatch = {
    managerId,
    managerAssignedAt: new Date().toISOString(),
    managerAssignedBy: hrUserId,
    assignmentVersion: nextVersion,
  };

  try {
    return await databases.updateDocument(
      databaseId,
      appwriteConfig.usersCollectionId,
      employeeId,
      fullPatch
    );
  } catch (error) {
    if (String(error?.message || "").toLowerCase().includes("unknown attribute")) {
      return databases.updateDocument(
        databaseId,
        appwriteConfig.usersCollectionId,
        employeeId,
        { managerId }
      );
    }

    throw error;
  }
}

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    const { searchParams } = new URL(request.url);
    const managerId = (searchParams.get("managerId") || "").trim();

    const queries = [Query.equal("role", "employee"), Query.limit(200)];
    if (managerId) {
      queries.push(Query.equal("managerId", managerId));
    }

    const employees = await databases.listDocuments(
      databaseId,
      appwriteConfig.usersCollectionId,
      queries
    );

    return Response.json({ data: employees.documents.map(mapUserSummary) });
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
    const managerId = (body.managerId || "").trim();

    const validated = await validateAssignmentSubjects(databases, employeeId, managerId);
    if (validated.error) {
      return Response.json({ error: validated.error }, { status: validated.status });
    }

    const currentVersion = Number(validated.employee.assignmentVersion || 0);
    const updated = await patchEmployeeManager(
      databases,
      employeeId,
      managerId,
      profile.$id,
      currentVersion + 1
    );

    return Response.json({ data: mapUserSummary(updated) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

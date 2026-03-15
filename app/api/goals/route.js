import { appwriteConfig } from "@/lib/appwrite";
import { FRAMEWORK_TYPES, GOAL_STATUSES } from "@/lib/appwriteSchema";
import { ID, Query, databaseId } from "@/lib/appwriteServer";
import { normalizeCycleId } from "@/lib/cycle";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertManagerCanAccessEmployee } from "@/lib/teamAccess";

const VALID_FRAMEWORKS = Object.values(FRAMEWORK_TYPES);

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function dedupeById(documents) {
  const seen = new Set();
  const merged = [];

  for (const document of documents) {
    if (!seen.has(document.$id)) {
      seen.add(document.$id);
      merged.push(document);
    }
  }

  return merged;
}

async function listManagerGoalsByScope(databases, profile, scope) {
  if (scope === "self") {
    const result = await databases.listDocuments(
      databaseId,
      appwriteConfig.goalsCollectionId,
      [
        Query.equal("employeeId", profile.$id),
        Query.orderDesc("$createdAt"),
        Query.limit(100),
      ]
    );

    return result.documents;
  }

  if (scope === "all") {
    const [selfResult, teamResult] = await Promise.all([
      databases.listDocuments(databaseId, appwriteConfig.goalsCollectionId, [
        Query.equal("employeeId", profile.$id),
        Query.orderDesc("$createdAt"),
        Query.limit(100),
      ]),
      databases.listDocuments(databaseId, appwriteConfig.goalsCollectionId, [
        Query.equal("managerId", profile.$id),
        Query.orderDesc("$createdAt"),
        Query.limit(100),
      ]),
    ]);

    return dedupeById([...selfResult.documents, ...teamResult.documents]);
  }

  const teamResult = await databases.listDocuments(
    databaseId,
    appwriteConfig.goalsCollectionId,
    [
      Query.equal("managerId", profile.$id),
      Query.orderDesc("$createdAt"),
      Query.limit(100),
    ]
  );

  return teamResult.documents;
}

async function resolveManagerApproverId(databases, profile) {
  if (profile.managerId) {
    return String(profile.managerId).trim();
  }

  const hrProfiles = await databases.listDocuments(
    databaseId,
    appwriteConfig.usersCollectionId,
    [Query.equal("role", "hr"), Query.orderAsc("$createdAt"), Query.limit(1)]
  );

  return hrProfiles.documents[0]?.$id || "";
}

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "hr"]);

    const { searchParams } = new URL(request.url);
    const cycleId = searchParams.get("cycleId");
    const status = searchParams.get("status");
    const employeeId = (searchParams.get("employeeId") || "").trim();

    const scope = (searchParams.get("scope") || "team").trim();

    let documents = [];

    if (profile.role === "employee") {
      if (employeeId && employeeId !== profile.$id) {
        return Response.json({ error: "Forbidden for requested employee." }, { status: 403 });
      }

      const result = await databases.listDocuments(
        databaseId,
        appwriteConfig.goalsCollectionId,
        [
          Query.equal("employeeId", profile.$id),
          Query.orderDesc("$createdAt"),
          Query.limit(100),
        ]
      );
      documents = result.documents;
    } else if (profile.role === "manager") {
      await assertManagerCanAccessEmployee(databases, profile.$id, employeeId);
      documents = await listManagerGoalsByScope(databases, profile, scope);
    } else {
      const result = await databases.listDocuments(
        databaseId,
        appwriteConfig.goalsCollectionId,
        [Query.orderDesc("$createdAt"), Query.limit(100)]
      );
      documents = result.documents;
    }

    if (cycleId) {
      documents = documents.filter((item) => item.cycleId === cycleId);
    }

    if (status) {
      documents = documents.filter((item) => item.status === status);
    }

    if (employeeId) {
      documents = documents.filter((item) => item.employeeId === employeeId);
    }

    return Response.json({ data: documents });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager"]);

    const body = await request.json();
    const title = (body.title || "").trim();
    const description = (body.description || "").trim();
    const cycleIdInput = (body.cycleId || "").trim();
    const cycleId = normalizeCycleId(cycleIdInput);
    const frameworkType = (body.frameworkType || "").trim();
    const managerIdInput = (body.managerId || "").trim();
    const managerId = profile.role === "manager"
      ? managerIdInput || (await resolveManagerApproverId(databases, profile))
      : managerIdInput || String(profile.managerId || "").trim();
    const dueDate = body.dueDate || null;
    const lineageRef = body.lineageRef || "";
    const aiSuggested = Boolean(body.aiSuggested);
    const weightage = toInt(body.weightage, 0);

    if (!title || !description || !frameworkType) {
      return Response.json(
        { error: "title, description and frameworkType are required." },
        { status: 400 }
      );
    }

    if (!managerId) {
      return Response.json(
        {
          error:
            profile.role === "manager"
              ? "managerId is missing. Provide HR approver ID or configure manager profile approver mapping."
              : "managerId is missing. Set it in profile or provide it in request.",
        },
        { status: 400 }
      );
    }

    if (!VALID_FRAMEWORKS.includes(frameworkType)) {
      return Response.json({ error: "Invalid frameworkType." }, { status: 400 });
    }

    if (weightage < 1 || weightage > 100) {
      return Response.json({ error: "weightage must be between 1 and 100." }, { status: 400 });
    }

    const existingGoals = await databases.listDocuments(
      databaseId,
      appwriteConfig.goalsCollectionId,
      [
        Query.equal("employeeId", profile.$id),
        Query.equal("cycleId", cycleId),
        Query.limit(200),
      ]
    );

    const currentWeightage = existingGoals.documents.reduce(
      (sum, item) => sum + (Number(item.weightage) || 0),
      0
    );

    if (currentWeightage + weightage > 100) {
      return Response.json(
        {
          error:
            "Total goal weightage for this cycle cannot exceed 100. Reduce weightage or edit existing goals.",
        },
        { status: 400 }
      );
    }

    const goal = await databases.createDocument(
      databaseId,
      appwriteConfig.goalsCollectionId,
      ID.unique(),
      {
        employeeId: profile.$id,
        managerId,
        cycleId,
        frameworkType,
        title,
        description,
        weightage,
        status: GOAL_STATUSES.DRAFT,
        progressPercent: 0,
        dueDate,
        lineageRef,
        aiSuggested,
      }
    );

    return Response.json({ data: goal }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

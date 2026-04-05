import { appwriteConfig } from "@/lib/appwrite";
import { GOAL_LEVELS, GOAL_STATUSES } from "@/lib/appwriteSchema";
import { ID, Query, databaseId } from "@/lib/appwriteServer";
import { normalizeCycleId } from "@/lib/cycle";
import { assertFrameworkAllowed, getFrameworkPolicy } from "@/lib/frameworkPolicies";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertManagerCanAccessEmployee, getManagerTeamEmployeeIds } from "@/lib/teamAccess";

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function normalizeGoalLevel(value, fallback = GOAL_LEVELS.EMPLOYEE) {
  const normalized = String(value || "").trim().toLowerCase();
  const allowed = new Set(Object.values(GOAL_LEVELS));
  return allowed.has(normalized) ? normalized : fallback;
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

function isUnknownAttributeError(error) {
  return (
    error?.message &&
    String(error.message).toLowerCase().includes("unknown attribute")
  );
}

function isMissingRequiredAttributeError(error, attribute) {
  const message = String(error?.message || "").toLowerCase();
  const normalizedAttribute = String(attribute || "").trim().toLowerCase();

  if (!normalizedAttribute) return false;
  return message.includes("missing required attribute") && message.includes(normalizedAttribute);
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

  const teamEmployeeIds = await getManagerTeamEmployeeIds(databases, profile.$id, {
    includeFallback: true,
  });

  if (scope === "all") {
    const [selfResult, teamResult] = await Promise.all([
      databases.listDocuments(databaseId, appwriteConfig.goalsCollectionId, [
        Query.equal("employeeId", profile.$id),
        Query.orderDesc("$createdAt"),
        Query.limit(100),
      ]),
      teamEmployeeIds.length > 0
        ? databases.listDocuments(databaseId, appwriteConfig.goalsCollectionId, [
            Query.equal("employeeId", teamEmployeeIds),
            Query.orderDesc("$createdAt"),
            Query.limit(100),
          ])
        : Promise.resolve({ documents: [] }),
    ]);

    return dedupeById([...selfResult.documents, ...teamResult.documents]);
  }

  if (teamEmployeeIds.length === 0) return [];

  const teamResult = await databases.listDocuments(databaseId, appwriteConfig.goalsCollectionId, [
    Query.equal("employeeId", teamEmployeeIds),
    Query.orderDesc("$createdAt"),
    Query.limit(100),
  ]);

  return teamResult.documents;
}

async function resolveManagerApprover(databases, profile) {
  if (profile.managerId) {
    return { id: String(profile.managerId).trim(), source: "profile.managerId" };
  }

  return { id: "", source: "missing" };
}

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "leadership", "hr"]);

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
    } else if (profile.role === "manager" || profile.role === "leadership") {
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

    const shaped = documents.map((goal) => {
      const ratingVisibleToEmployee = Boolean(goal.ratingVisibleToEmployee);
      const isManagerSelfGoal =
        profile.role === "manager" && String(goal.employeeId || "").trim() === String(profile.$id || "").trim();

      if ((profile.role === "employee" && !ratingVisibleToEmployee) || isManagerSelfGoal) {
        return {
          ...goal,
          managerFinalRating: null,
          managerFinalRatingLabel: null,
          managerFinalRatedAt: null,
          managerFinalRatedBy: null,
        };
      }

      return goal;
    });

    return Response.json({ data: shaped });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "leadership"]);

    const body = await request.json();
    const title = (body.title || "").trim();
    const description = (body.description || "").trim();
    const cycleIdInput = (body.cycleId || "").trim();
    const cycleId = normalizeCycleId(cycleIdInput);
    const frameworkTypeInput = (body.frameworkType || "").trim();
    const managerIdInput = (body.managerId || "").trim();
    const managerApproverResolution = (profile.role === "manager" || profile.role === "leadership") && !managerIdInput
      ? await resolveManagerApprover(databases, profile)
      : null;
    const managerId = (profile.role === "manager" || profile.role === "leadership")
      ? managerIdInput || String(managerApproverResolution?.id || "").trim()
      : managerIdInput || String(profile.managerId || "").trim();
    const dueDate = body.dueDate || null;
    const lineageRef = body.lineageRef || "";
    const aiSuggested = Boolean(body.aiSuggested);
    const weightage = toInt(body.weightage, 0);
    const parentGoalId = String(body.parentGoalId || "").trim() || null;
    const goalLevelInput = body.goalLevel;
    const contributionPercent = toInt(body.contributionPercent, 100);
    const goalLevel = normalizeGoalLevel(goalLevelInput);

    if (!title || !description || !frameworkTypeInput) {
      return Response.json(
        { error: "title, description and frameworkType are required." },
        { status: 400 }
      );
    }

    if (!managerId) {
      return Response.json(
        {
          error:
            profile.role === "manager" || profile.role === "leadership"
              ? "managerId is missing. Assign an upper manager before creating manager goals."
              : "managerId is missing. Set it in profile or provide it in request.",
        },
        { status: 400 }
      );
    }

    const frameworkPolicy = await getFrameworkPolicy(databases);
    const frameworkType = assertFrameworkAllowed(frameworkTypeInput, frameworkPolicy);

    if (weightage < 1 || weightage > 100) {
      return Response.json({ error: "weightage must be between 1 and 100." }, { status: 400 });
    }

    if (typeof goalLevelInput !== "undefined" && !normalizeGoalLevel(goalLevelInput, "")) {
      return Response.json(
        { error: "goalLevel must be one of: business, manager, employee." },
        { status: 400 }
      );
    }

    if (contributionPercent < 0 || contributionPercent > 100) {
      return Response.json(
        { error: "contributionPercent must be between 0 and 100." },
        { status: 400 }
      );
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

    const baseGoalPayload = {
      employeeId: profile.$id,
      managerId,
      parentGoalId,
      goalLevel,
      contributionPercent,
      cycleId,
      frameworkType,
      title,
      description,
      weightage,
      status: GOAL_STATUSES.DRAFT,
      dueDate,
      lineageRef,
      aiSuggested,
    };

    let goal;

    try {
      // Prefer dual-write first for mixed environments where a legacy
      // `processPercent` attribute may still be required.
      goal = await databases.createDocument(
        databaseId,
        appwriteConfig.goalsCollectionId,
        ID.unique(),
        {
          ...baseGoalPayload,
          progressPercent: 0,
          processPercent: 0,
        }
      );
    } catch (error) {
      if (isUnknownAttributeError(error)) {
        try {
          // Modern schema path.
          goal = await databases.createDocument(
            databaseId,
            appwriteConfig.goalsCollectionId,
            ID.unique(),
            {
              ...baseGoalPayload,
              progressPercent: 0,
            }
          );
        } catch (secondError) {
          if (
            isUnknownAttributeError(secondError) ||
            isMissingRequiredAttributeError(secondError, "processPercent")
          ) {
            // Legacy schema path.
            goal = await databases.createDocument(
              databaseId,
              appwriteConfig.goalsCollectionId,
              ID.unique(),
              {
                ...baseGoalPayload,
                processPercent: 0,
              }
            );
          } else {
            throw secondError;
          }
        }
      } else {
        throw error;
      }
    }

    const warning =
      (profile.role === "manager" || profile.role === "leadership") &&
      managerApproverResolution &&
      managerApproverResolution.source !== "profile.managerId"
        ? managerApproverResolution.source === "missing"
          ? "No upper manager mapping found for manager goal approval."
          : "Using non-standard manager approver mapping source."
        : "";

    return Response.json(
      {
        data: goal,
        meta: warning ? { warning } : undefined,
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

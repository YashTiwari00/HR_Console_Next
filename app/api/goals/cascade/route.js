import { appwriteConfig } from "@/lib/appwrite";
import { GOAL_LEVELS } from "@/lib/appwriteSchema";
import { Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertManagerCanAccessEmployee } from "@/lib/teamAccess";
import {
  buildCascadeLineage,
  buildCascadePayload,
  createGoalDocumentCompat,
} from "@/app/api/goals/_lib/cascade";

function normalizeGoalLevel(value, fallback = GOAL_LEVELS.EMPLOYEE) {
  const normalized = String(value || "").trim().toLowerCase();
  const allowed = new Set(Object.values(GOAL_LEVELS));
  return allowed.has(normalized) ? normalized : fallback;
}

function nextGoalLevel(parentGoalLevel) {
  const normalized = normalizeGoalLevel(parentGoalLevel, GOAL_LEVELS.BUSINESS);
  if (normalized === GOAL_LEVELS.BUSINESS) return GOAL_LEVELS.MANAGER;
  if (normalized === GOAL_LEVELS.MANAGER) return GOAL_LEVELS.EMPLOYEE;
  return GOAL_LEVELS.EMPLOYEE;
}

function parseEmployeeIds(input) {
  if (!Array.isArray(input)) return [];

  const ids = input
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  return Array.from(new Set(ids));
}

function parseContributionValue(input) {
  const parsed = Number.parseInt(String(input ?? ""), 10);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

function computeEqualSplit(employeeIds) {
  const totalEmployees = employeeIds.length;
  if (totalEmployees === 0) return new Map();

  const base = Math.floor(100 / totalEmployees);
  const remainder = 100 % totalEmployees;
  const out = new Map();

  employeeIds.forEach((employeeId, index) => {
    out.set(employeeId, base + (index < remainder ? 1 : 0));
  });

  return out;
}

function parseCustomSplit(employeeIds, splitStrategy, body) {
  const employeeSet = new Set(employeeIds);
  const map = new Map();

  const strategyContributions = splitStrategy && typeof splitStrategy === "object"
    ? splitStrategy.contributions
    : null;

  const source = strategyContributions ?? body?.contributions ?? null;

  if (Array.isArray(source)) {
    for (const item of source) {
      const employeeId = String(item?.employeeId || "").trim();
      const contributionPercent = parseContributionValue(item?.contributionPercent);
      if (!employeeId || contributionPercent === null) continue;
      if (!employeeSet.has(employeeId)) continue;
      map.set(employeeId, contributionPercent);
    }

    return map;
  }

  if (source && typeof source === "object") {
    for (const [employeeIdRaw, contributionRaw] of Object.entries(source)) {
      const employeeId = String(employeeIdRaw || "").trim();
      const contributionPercent = parseContributionValue(contributionRaw);
      if (!employeeId || contributionPercent === null) continue;
      if (!employeeSet.has(employeeId)) continue;
      map.set(employeeId, contributionPercent);
    }
  }

  return map;
}

function resolveSplitMap(employeeIds, splitStrategy, body) {
  if (employeeIds.length === 0) {
    const error = new Error("employeeIds is required.");
    error.statusCode = 400;
    throw error;
  }

  const strategyType = (() => {
    if (typeof splitStrategy === "string") return splitStrategy.trim().toLowerCase();
    if (splitStrategy && typeof splitStrategy === "object") {
      return String(splitStrategy.type || "").trim().toLowerCase();
    }
    return "equal";
  })();

  if (strategyType === "equal" || !strategyType) {
    return computeEqualSplit(employeeIds);
  }

  if (strategyType === "custom") {
    const customMap = parseCustomSplit(employeeIds, splitStrategy, body);

    if (customMap.size !== employeeIds.length) {
      const error = new Error("custom splitStrategy must provide contributionPercent for every employeeId.");
      error.statusCode = 400;
      throw error;
    }

    return customMap;
  }

  const error = new Error("splitStrategy must be equal or custom.");
  error.statusCode = 400;
  throw error;
}

function validateContributionMap(splitMap) {
  const entries = Array.from(splitMap.entries());
  const total = entries.reduce((sum, [, value]) => sum + Number(value || 0), 0);

  if (entries.some(([, value]) => !Number.isInteger(value) || value < 1 || value > 100)) {
    const error = new Error("Each contributionPercent must be an integer between 1 and 100.");
    error.statusCode = 400;
    throw error;
  }

  if (total > 100) {
    const error = new Error("Total contributionPercent cannot exceed 100.");
    error.statusCode = 400;
    throw error;
  }

  return total;
}

async function assertEmployeeWeightageCap(databases, employeeId, cycleId, additionalWeightage) {
  const existingGoals = await databases.listDocuments(
    databaseId,
    appwriteConfig.goalsCollectionId,
    [
      Query.equal("employeeId", employeeId),
      Query.equal("cycleId", cycleId),
      Query.limit(200),
    ]
  );

  const currentWeightage = (existingGoals.documents || []).reduce(
    (sum, item) => sum + (Number(item.weightage) || 0),
    0
  );

  if (currentWeightage + additionalWeightage > 100) {
    const error = new Error(
      `Total goal weightage for employee ${employeeId} in cycle ${cycleId} cannot exceed 100.`
    );
    error.statusCode = 400;
    throw error;
  }
}

async function getExistingCascadeMap(databases, parentGoalId, employeeIds) {
  const out = new Map();

  await Promise.all(
    employeeIds.map(async (employeeId) => {
      const existing = await databases.listDocuments(
        databaseId,
        appwriteConfig.goalsCollectionId,
        [
          Query.equal("parentGoalId", parentGoalId),
          Query.equal("employeeId", employeeId),
          Query.limit(1),
        ]
      );

      const first = (existing.documents || [])[0] || null;
      if (first && first.$id) {
        out.set(employeeId, String(first.$id));
      }
    })
  );

  return out;
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["manager"]);

    const body = await request.json();
    const parentGoalId = String(body?.parentGoalId || "").trim();
    const employeeIds = parseEmployeeIds(body?.employeeIds);
    const splitStrategy = body?.splitStrategy;

    if (!parentGoalId) {
      return Response.json({ error: "parentGoalId is required." }, { status: 400 });
    }

    if (employeeIds.length === 0) {
      return Response.json({ error: "employeeIds is required." }, { status: 400 });
    }

    const parentGoal = await databases.getDocument(
      databaseId,
      appwriteConfig.goalsCollectionId,
      parentGoalId
    );

    if (String(parentGoal.managerId || "").trim() !== String(profile.$id || "").trim()) {
      return Response.json({ error: "Forbidden for this parent goal." }, { status: 403 });
    }

    await Promise.all(
      employeeIds.map((employeeId) =>
        assertManagerCanAccessEmployee(databases, String(profile.$id || "").trim(), employeeId)
      )
    );

    const splitMap = resolveSplitMap(employeeIds, splitStrategy, body);
    validateContributionMap(splitMap);

    const cycleId = String(parentGoal.cycleId || "").trim();
    const frameworkType = String(parentGoal.frameworkType || "").trim();
    const title = String(body?.title || parentGoal.title || "").trim();
    const description = String(body?.description || parentGoal.description || "").trim();
    const dueDate = body?.dueDate ?? parentGoal.dueDate ?? null;
    const lineageRef = buildCascadeLineage(parentGoal, body?.lineageRef);
    const goalLevel = normalizeGoalLevel(body?.goalLevel, nextGoalLevel(parentGoal.goalLevel));

    if (!cycleId || !frameworkType || !title || !description) {
      return Response.json(
        { error: "parent goal must include cycleId, frameworkType, title and description." },
        { status: 400 }
      );
    }

    const childRows = employeeIds.map((employeeId) => {
      const contributionPercent = Number(splitMap.get(employeeId) || 0);
      const calculatedWeightage = Math.max(
        1,
        Math.round((Number(parentGoal.weightage || 0) * contributionPercent) / 100)
      );

      return {
        employeeId,
        contributionPercent,
        weightage: calculatedWeightage,
      };
    });

    const existingByEmployee = await getExistingCascadeMap(databases, parentGoalId, employeeIds);
    if (existingByEmployee.size > 0) {
      const duplicateEmployeeIds = Array.from(existingByEmployee.keys());
      return Response.json(
        {
          error: "Cascade child goals already exist for some employees under this parent goal.",
          code: "cascade_duplicate_child",
          duplicateEmployeeIds,
        },
        { status: 409 }
      );
    }

    await Promise.all(
      childRows.map((row) =>
        assertEmployeeWeightageCap(databases, row.employeeId, cycleId, row.weightage)
      )
    );

    const created = [];

    try {
      for (const row of childRows) {
        const payload = buildCascadePayload({
          parentGoal,
          title,
          description,
          cycleId,
          frameworkType,
          managerId: String(profile.$id || "").trim(),
          employeeId: row.employeeId,
          weightage: row.weightage,
          dueDate,
          aiSuggested: body?.aiSuggested ?? true,
          lineageRef,
          optionalFields: {
            parentGoalId,
            cascadeSourceGoalId: parentGoalId,
            goalLevel,
            contributionPercent: row.contributionPercent,
            goalConversationId: body?.goalConversationId,
            conversationId: body?.conversationId,
          },
        });

        const child = await createGoalDocumentCompat(databases, payload);
        created.push(child);
      }
    } catch (error) {
      await Promise.allSettled(
        created.map((doc) =>
          databases.deleteDocument(
            databaseId,
            appwriteConfig.goalsCollectionId,
            String(doc?.$id || "")
          )
        )
      );
      throw error;
    }

    return Response.json(
      {
        data: created,
        meta: {
          parentGoalId,
          splitStrategy: typeof splitStrategy === "string" ? splitStrategy : splitStrategy?.type || "equal",
          totalContributionPercent: childRows.reduce(
            (sum, item) => sum + Number(item.contributionPercent || 0),
            0
          ),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

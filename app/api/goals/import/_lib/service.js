import { appwriteConfig } from "@/lib/appwrite";
import { IMPORT_JOB_STATUSES } from "@/lib/appwriteSchema";
import { ID, Query, databaseId } from "@/lib/appwriteServer";
import { normalizeCycleId } from "@/lib/cycle";
import { assertFrameworkAllowed, getFrameworkPolicy } from "@/lib/frameworkPolicies";
import { createGoalDocumentCompat } from "@/app/api/goals/_lib/cascade";
import { sendInAppAndQueueEmail } from "@/app/api/notifications/_lib/workflows";
import { assertManagerCanAccessEmployee } from "@/lib/teamAccess";

const TEMPLATE_COLUMNS = [
  "employeeId",
  "title",
  "description",
  "frameworkType",
  "weightage",
  "cycleId",
  "dueDate",
  "lineageRef",
  "aiSuggested",
  "managerId",
];

function toBoolean(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function toIsoOrNull(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

function toCycleIdWithFallback(input, fallbackCycleId) {
  const normalizedInput = String(input || "").trim().toUpperCase();
  if (/^Q[1-4]-\d{4}$/.test(normalizedInput)) {
    return normalizedInput;
  }

  const normalizedFallback = String(fallbackCycleId || "").trim().toUpperCase();
  if (/^Q[1-4]-\d{4}$/.test(normalizedFallback)) {
    return normalizedFallback;
  }

  return normalizeCycleId(normalizedInput, new Date());
}

function toIntOrNaN(value) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

function normalizeRow(row, fallbackCycleId, defaults = {}) {
  const defaultFrameworkType = String(defaults?.frameworkType || "").trim();
  const defaultManagerId = String(defaults?.managerId || "").trim();
  const defaultEmployeeId = String(defaults?.employeeId || "").trim();
  const defaultWeightage = toIntOrNaN(defaults?.weightage);

  const rowWeightage = toIntOrNaN(row?.weightage);

  return {
    employeeId: String(row?.employeeId || defaultEmployeeId || "").trim(),
    title: String(row?.title || "").trim(),
    description: String(row?.description || "").trim(),
    frameworkType: String(row?.frameworkType || defaultFrameworkType || "").trim(),
    weightage: Number.isInteger(rowWeightage)
      ? rowWeightage
      : Number.isInteger(defaultWeightage)
      ? defaultWeightage
      : Number.NaN,
    cycleId: toCycleIdWithFallback(row?.cycleId, fallbackCycleId),
    dueDate: toIsoOrNull(row?.dueDate || defaults?.dueDate),
    lineageRef: String(row?.lineageRef || "").trim(),
    aiSuggested: toBoolean(row?.aiSuggested),
    managerId: String(row?.managerId || defaultManagerId || "").trim(),
  };
}

function validateNormalizedRow(input, options = {}) {
  const requireEmployeeId = options?.requireEmployeeId !== false;
  const errors = [];

  if (requireEmployeeId && !input.employeeId) errors.push("employeeId is required");
  if (!input.title) errors.push("title is required");
  if (!input.description) errors.push("description is required");
  if (!input.frameworkType) errors.push("frameworkType is required");
  if (!input.cycleId) errors.push("cycleId is required");

  if (!Number.isInteger(input.weightage) || input.weightage < 1 || input.weightage > 100) {
    errors.push("weightage must be an integer between 1 and 100");
  }

  return errors;
}

async function getExistingCycleNames(databases, cycleIds) {
  const validNames = new Set();
  const uniqueCycleIds = Array.from(
    new Set((Array.isArray(cycleIds) ? cycleIds : []).map((item) => String(item || "").trim()).filter(Boolean))
  );

  for (const cycleId of uniqueCycleIds) {
    try {
      const result = await databases.listDocuments(databaseId, appwriteConfig.goalCyclesCollectionId, [
        Query.equal("name", cycleId),
        Query.limit(1),
      ]);

      if ((result.documents || []).length > 0) {
        validNames.add(cycleId);
      }
    } catch (error) {
      const err = new Error(
        String(error?.message || "Unable to validate cycleId against goal cycles.")
      );
      err.statusCode = Number(error?.statusCode || error?.code || 500);
      throw err;
    }
  }

  return validNames;
}

export function getImportTemplateCsv() {
  const sample = [
    "seed.employee.01-id,Improve customer retention by 8%,Deliver measurable retention outcomes for key segment,OKR,30,Q2-2026,2026-06-20T00:00:00.000Z,team-objective-1,true,",
    "seed.employee.01-id,Reduce defect leakage to production,Implement quality guardrails and release checklist,MBO,20,Q2-2026,2026-06-25T00:00:00.000Z,team-objective-1,false,",
  ];

  return `${TEMPLATE_COLUMNS.join(",")}\n${sample.join("\n")}`;
}

export function getTemplateColumns() {
  return [...TEMPLATE_COLUMNS];
}

export async function previewImportRows({ databases, profile, rows, fallbackCycleId, defaults }) {
  const role = String(profile?.role || "").trim();
  const profileId = String(profile?.$id || "").trim();
  const managerManualAssign = role === "manager" && Boolean(defaults?.manualAssign);
  const allowUnknownCycle = Boolean(defaults?.allowUnknownCycle);
  const policy = await getFrameworkPolicy(databases);

  const normalizedRows = (Array.isArray(rows) ? rows : []).map((row) =>
    normalizeRow(row, fallbackCycleId, defaults)
  );
  const existingCycleNames = await getExistingCycleNames(
    databases,
    normalizedRows.map((row) => row.cycleId)
  );

  const previewRows = [];

  for (let index = 0; index < normalizedRows.length; index += 1) {
    const row = normalizedRows[index];
    const errors = validateNormalizedRow(row, {
      requireEmployeeId: !managerManualAssign,
    });

    const shouldEnforceCycleExistence = !managerManualAssign && !allowUnknownCycle;
    if (shouldEnforceCycleExistence && row.cycleId && !existingCycleNames.has(row.cycleId)) {
      errors.push("cycleId is invalid");
    }

    if (row.frameworkType) {
      try {
        row.frameworkType = assertFrameworkAllowed(row.frameworkType, policy);
      } catch (error) {
        errors.push(String(error?.message || "frameworkType policy check failed"));
      }
    }

    if (role === "employee") {
      if (row.employeeId !== profileId) {
        errors.push("employees can import goals only for themselves");
      }

      if (!row.managerId && !profile?.managerId) {
        errors.push("managerId is required for employee imports");
      }
    }

    if (role === "manager") {
      if (row.employeeId) {
        try {
          await assertManagerCanAccessEmployee(databases, profileId, row.employeeId);
        } catch {
          errors.push("manager cannot import for requested employee");
        }
      }
    }

    if (role === "hr" && !row.managerId) {
      errors.push("managerId is required for HR imports");
    }

    previewRows.push({
      rowNumber: index + 1,
      normalized: row,
      valid: errors.length === 0,
      errors,
    });
  }

  return {
    policy,
    previewRows,
    totalRows: previewRows.length,
    validRows: previewRows.filter((item) => item.valid).length,
    invalidRows: previewRows.filter((item) => !item.valid).length,
  };
}

function managerIdForRow(profile, normalizedRow) {
  const role = String(profile?.role || "").trim();
  if (role === "manager") return String(profile?.$id || "").trim();
  if (role === "employee") return String(normalizedRow.managerId || profile?.managerId || "").trim();
  return String(normalizedRow.managerId || "").trim();
}

async function fetchExistingWeightageByEmployeeCycle(databases, employeeId, cycleId) {
  const rows = await databases.listDocuments(databaseId, appwriteConfig.goalsCollectionId, [
    Query.equal("employeeId", employeeId),
    Query.equal("cycleId", cycleId),
    Query.limit(200),
  ]);

  return (rows.documents || []).reduce((sum, item) => sum + (Number(item.weightage) || 0), 0);
}

export async function commitImportRows({ databases, profile, previewResult }) {
  const successes = [];
  const failures = [];
  const pendingWeightAddByKey = new Map();

  for (const rowResult of previewResult.previewRows) {
    if (!rowResult.valid) {
      failures.push({
        rowNumber: rowResult.rowNumber,
        reason: rowResult.errors.join("; "),
      });
      continue;
    }

    const row = rowResult.normalized;
    const managerId = managerIdForRow(profile, row);

    if (!managerId) {
      failures.push({ rowNumber: rowResult.rowNumber, reason: "managerId could not be resolved" });
      continue;
    }

    const weightKey = `${row.employeeId}::${row.cycleId}`;
    const alreadyPlanned = Number(pendingWeightAddByKey.get(weightKey) || 0);

    try {
      const existingWeight = await fetchExistingWeightageByEmployeeCycle(
        databases,
        row.employeeId,
        row.cycleId
      );

      if (existingWeight + alreadyPlanned + row.weightage > 100) {
        failures.push({
          rowNumber: rowResult.rowNumber,
          reason: "weightage cap exceeded for employee and cycle",
        });
        continue;
      }

      const created = await createGoalDocumentCompat(databases, {
        employeeId: row.employeeId,
        managerId,
        cycleId: row.cycleId,
        frameworkType: row.frameworkType,
        title: row.title,
        description: row.description,
        weightage: row.weightage,
        status: "draft",
        dueDate: row.dueDate,
        lineageRef: row.lineageRef,
        aiSuggested: Boolean(row.aiSuggested),
      });

      pendingWeightAddByKey.set(weightKey, alreadyPlanned + row.weightage);
      successes.push({ rowNumber: rowResult.rowNumber, goalId: created.$id });

      try {
        const goalId = String(created?.$id || "").trim();
        const goalTitle = String(created?.title || row.title || "Untitled Goal").trim();
        const managerName = String(profile?.name || profile?.email || "Your manager").trim();
        const dateKey = new Date().toISOString().slice(0, 10);

        await sendInAppAndQueueEmail(databases, {
          userId: String(row.employeeId || "").trim(),
          triggerType: "goal_added",
          title: "New goal assigned",
          message: `${managerName} assigned you a goal: "${goalTitle}".`,
          actionUrl: "/employee/goals",
          dedupeKey: `goal-added-import-${goalId}-${dateKey}`,
          metadata: {
            goalId,
            cycleId: String(row.cycleId || "").trim(),
            recipientRole: "employee",
            source: "bulk_import",
          },
        });
      } catch {
        // Notification failures should not block goal assignment.
      }
    } catch (error) {
      failures.push({
        rowNumber: rowResult.rowNumber,
        reason: String(error?.message || "goal creation failed"),
      });
    }
  }

  return {
    successes,
    failures,
    successRows: successes.length,
    failedRows: failures.length,
  };
}

function isUnknownAttributeError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("attribute not found in schema") || message.includes("unknown attribute");
}

function extractUnknownAttribute(error) {
  const message = String(error?.message || "");
  const match =
    message.match(/attribute not found in schema:\s*([a-zA-Z0-9_]+)/i) ||
    message.match(/unknown attribute:\s*"?([a-zA-Z0-9_]+)"?/i);
  return String(match?.[1] || "").trim();
}

async function createImportJobCompat(databases, payload) {
  let nextPayload = { ...payload };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await databases.createDocument(
        databaseId,
        appwriteConfig.importJobsCollectionId,
        ID.unique(),
        nextPayload
      );
    } catch (error) {
      if (!isUnknownAttributeError(error)) {
        throw error;
      }

      const unknown = extractUnknownAttribute(error);
      if (!unknown || !(unknown in nextPayload)) {
        throw error;
      }

      const rest = { ...nextPayload };
      delete rest[unknown];
      nextPayload = rest;
    }
  }

  throw new Error("Unable to create import job with compatibility fallback.");
}

export async function createImportJob({
  databases,
  profile,
  idempotencyKey,
  status,
  templateVersion,
  previewResult,
  commitResult,
  sourceType,
  sourceUrl,
}) {
  return createImportJobCompat(databases, {
    createdBy: String(profile?.$id || "").trim(),
    idempotencyKey,
    status,
    templateVersion: String(templateVersion || "v1"),
    totalRows: Number(previewResult?.totalRows || 0),
    validRows: Number(previewResult?.validRows || 0),
    successRows: Number(commitResult?.successRows || 0),
    failedRows: Number(commitResult?.failedRows || previewResult?.invalidRows || 0),
    reportJson: JSON.stringify({
      preview: {
        totalRows: previewResult?.totalRows || 0,
        validRows: previewResult?.validRows || 0,
        invalidRows: previewResult?.invalidRows || 0,
        rows: previewResult?.previewRows || [],
      },
      commit: commitResult || null,
    }),
    sourceType: String(sourceType || "").trim() || undefined,
    sourceUrl: String(sourceUrl || "").trim() || undefined,
    createdAt: new Date().toISOString(),
    committedAt: status === IMPORT_JOB_STATUSES.COMMITTED ? new Date().toISOString() : null,
  });
}

export async function findCommittedImportByIdempotency(databases, createdBy, idempotencyKey) {
  const rows = await databases.listDocuments(databaseId, appwriteConfig.importJobsCollectionId, [
    Query.equal("createdBy", String(createdBy || "").trim()),
    Query.equal("idempotencyKey", String(idempotencyKey || "").trim()),
    Query.equal("status", IMPORT_JOB_STATUSES.COMMITTED),
    Query.orderDesc("createdAt"),
    Query.limit(1),
  ]);

  return rows.documents[0] || null;
}

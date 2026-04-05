import { appwriteConfig } from "@/lib/appwrite";
import { CHECKIN_STATUSES, GOAL_STATUSES, IMPORT_JOB_STATUSES } from "@/lib/appwriteSchema";
import { ID, Query, databaseId } from "@/lib/appwriteServer";

const TEMPLATE_COLUMNS = [
  "goalId",
  "scheduledAt",
  "employeeNotes",
  "isFinalCheckIn",
  "managerRating",
  "attachmentFileIds",
  "attachmentFileNames",
];

function toBoolean(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function toIntegerOrNull(value) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function toIsoOrNull(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

function splitCsvOrArray(input) {
  if (Array.isArray(input)) {
    return input
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  return String(input || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeRow(row) {
  return {
    goalId: String(row?.goalId || "").trim(),
    scheduledAt: toIsoOrNull(row?.scheduledAt),
    employeeNotes: String(row?.employeeNotes || "").trim(),
    isFinalCheckIn: toBoolean(row?.isFinalCheckIn),
    managerRating: toIntegerOrNull(row?.managerRating),
    attachmentIds: splitCsvOrArray(row?.attachmentFileIds || row?.attachmentIds),
    attachmentFileNames: splitCsvOrArray(row?.attachmentFileNames),
  };
}

function validateNormalizedRow(row) {
  const errors = [];

  if (!row.goalId) {
    errors.push("goalId is required");
  }

  if (!row.scheduledAt) {
    errors.push("scheduledAt must be a valid date/time");
  }

  if (!row.employeeNotes || row.employeeNotes.length < 10) {
    errors.push("employeeNotes is required and must be at least 10 characters");
  }

  if (row.managerRating !== null && (row.managerRating < 1 || row.managerRating > 5)) {
    errors.push("managerRating must be between 1 and 5 when provided");
  }

  if (row.attachmentIds.length > 20) {
    errors.push("attachmentFileIds supports up to 20 files per row");
  }

  return errors;
}

async function fetchGoalSafe(databases, goalId) {
  try {
    return await databases.getDocument(databaseId, appwriteConfig.goalsCollectionId, goalId);
  } catch {
    return null;
  }
}

async function countGoalCheckIns(databases, goalId) {
  const existing = await databases.listDocuments(databaseId, appwriteConfig.checkInsCollectionId, [
    Query.equal("goalId", goalId),
    Query.limit(200),
  ]);

  return Number(existing.total || 0);
}

export function getImportTemplateCsv() {
  const sample = [
    "goal-id-001,2026-04-07T09:00:00.000Z,Reviewed Q2 milestone progress and blockers,false,,,evidence-1.pdf",
    "goal-id-002,2026-04-14T09:00:00.000Z,Final check-in for goal closure and rating discussion,true,4,\"file_abc123,file_def456\",",
  ];

  return `${TEMPLATE_COLUMNS.join(",")}\n${sample.join("\n")}`;
}

export function getTemplateColumns() {
  return [...TEMPLATE_COLUMNS];
}

export async function previewImportRows({ databases, profile, rows }) {
  const role = String(profile?.role || "").trim();
  const profileId = String(profile?.$id || "").trim();
  const normalizedRows = (Array.isArray(rows) ? rows : []).map((row) => normalizeRow(row));

  const previewRows = [];
  const pendingByGoal = new Map();

  for (let index = 0; index < normalizedRows.length; index += 1) {
    const row = normalizedRows[index];
    const errors = validateNormalizedRow(row);

    if (role !== "employee") {
      errors.push("only employees can upload bulk check-ins");
    }

    const goal = row.goalId ? await fetchGoalSafe(databases, row.goalId) : null;

    if (!goal) {
      errors.push("goalId does not exist");
    } else {
      const goalOwnerId = String(goal.employeeId || "").trim();

      if (goalOwnerId !== profileId) {
        errors.push("you can upload check-ins only for your own goals");
      }

      if (String(goal.status || "") !== GOAL_STATUSES.APPROVED) {
        errors.push("goal must be approved before check-ins can be uploaded");
      }

      const existingCount = await countGoalCheckIns(databases, row.goalId);
      const queuedCount = Number(pendingByGoal.get(row.goalId) || 0);

      if (existingCount + queuedCount >= 5) {
        errors.push("maximum 5 check-ins allowed for this goal cycle");
      }

      if (errors.length === 0) {
        pendingByGoal.set(row.goalId, queuedCount + 1);
      }
    }

    previewRows.push({
      rowNumber: index + 1,
      normalized: {
        ...row,
        managerRating: row.managerRating,
      },
      valid: errors.length === 0,
      errors,
    });
  }

  return {
    previewRows,
    totalRows: previewRows.length,
    validRows: previewRows.filter((row) => row.valid).length,
    invalidRows: previewRows.filter((row) => !row.valid).length,
  };
}

async function createCheckInCompat(databases, payload) {
  let nextPayload = { ...payload };

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await databases.createDocument(
        databaseId,
        appwriteConfig.checkInsCollectionId,
        ID.unique(),
        nextPayload
      );
    } catch (error) {
      const message = String(error?.message || "").toLowerCase();
      const unknownAttribute = message.includes("unknown attribute");

      if (!unknownAttribute) {
        throw error;
      }

      if ("attachmentIds" in nextPayload) {
        const fallback = { ...nextPayload };
        delete fallback.attachmentIds;
        nextPayload = fallback;
      } else {
        throw error;
      }
    }
  }

  throw new Error("Unable to create check-in with compatibility fallback.");
}

export async function commitImportRows({ databases, profile, previewResult }) {
  const successes = [];
  const failures = [];

  for (const rowResult of previewResult.previewRows) {
    if (!rowResult.valid) {
      failures.push({
        rowNumber: rowResult.rowNumber,
        reason: rowResult.errors.join("; "),
      });
      continue;
    }

    const row = rowResult.normalized;

    try {
      const goal = await databases.getDocument(databaseId, appwriteConfig.goalsCollectionId, row.goalId);
      const managerId = String(goal.managerId || "").trim();

      if (!managerId) {
        failures.push({ rowNumber: rowResult.rowNumber, reason: "managerId could not be resolved from goal" });
        continue;
      }

      const created = await createCheckInCompat(databases, {
        goalId: row.goalId,
        employeeId: String(profile.$id || "").trim(),
        managerId,
        scheduledAt: row.scheduledAt,
        status: CHECKIN_STATUSES.PLANNED,
        employeeNotes: row.employeeNotes,
        managerNotes: "",
        transcriptText: "",
        isFinalCheckIn: Boolean(row.isFinalCheckIn),
        ...(Array.isArray(row.attachmentIds) && row.attachmentIds.length > 0
          ? { attachmentIds: row.attachmentIds }
          : {}),
      });

      successes.push({ rowNumber: rowResult.rowNumber, checkInId: created.$id });
    } catch (error) {
      failures.push({
        rowNumber: rowResult.rowNumber,
        reason: String(error?.message || "check-in creation failed"),
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
}) {
  return createImportJobCompat(databases, {
    createdBy: String(profile?.$id || "").trim(),
    idempotencyKey,
    status,
    templateVersion: String(templateVersion || "checkin-v1"),
    totalRows: Number(previewResult?.totalRows || 0),
    validRows: Number(previewResult?.validRows || 0),
    successRows: Number(commitResult?.successRows || 0),
    failedRows: Number(commitResult?.failedRows || previewResult?.invalidRows || 0),
    reportJson: JSON.stringify({
      importType: "checkin",
      preview: {
        totalRows: previewResult?.totalRows || 0,
        validRows: previewResult?.validRows || 0,
        invalidRows: previewResult?.invalidRows || 0,
        rows: previewResult?.previewRows || [],
      },
      commit: commitResult || null,
    }),
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

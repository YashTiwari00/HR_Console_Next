import { NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/serverAuth";
import * as XLSX from "xlsx";
import { fetchGoogleSheetData } from "@/lib/import/googleSheets";
import { parseCsvToJson } from "@/lib/import/csvParser";
import { getTemplateColumns, previewImportRows } from "../_lib/service";

function toSafeString(value) {
  return String(value || "").trim();
}

function createHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function collectColumns(rows) {
  const columns = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== "object") continue;
    for (const key of Object.keys(row)) {
      const safeKey = toSafeString(key);
      if (safeKey) columns.add(safeKey);
    }
  }
  return Array.from(columns);
}

function parseExcelRows(file, buffer) {
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) {
    throw createHttpError(`Uploaded file ${toSafeString(file?.name) || "(unknown)"} has no sheets.`, 400);
  }

  const sheet = workbook.Sheets[firstSheet];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  return Array.isArray(rows) ? rows : [];
}

async function parseRowsFromFile(file) {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw createHttpError("file payload is invalid", 400);
  }

  const fileName = toSafeString(file.name).toLowerCase();
  if (fileName.endsWith(".csv")) {
    const text = await file.text().catch(() => "");
    return parseCsvToJson(text);
  }

  if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
    const buffer = await file.arrayBuffer();
    return parseExcelRows(file, buffer);
  }

  throw createHttpError("Unsupported file type. Use .csv, .xlsx, or .xls", 400);
}

function assertKnownColumns(rows) {
  const templateColumns = new Set(getTemplateColumns());
  const incomingColumns = collectColumns(rows);
  const invalidColumns = incomingColumns.filter((column) => !templateColumns.has(column));

  if (invalidColumns.length > 0) {
    const error = createHttpError(`Invalid columns: ${invalidColumns.join(", ")}`, 400);
    error.invalidColumns = invalidColumns;
    throw error;
  }
}

function mapGoogleSheetError(error) {
  const status = Number(error?.status || error?.statusCode || 500);
  const message = toSafeString(error?.message || "");

  if (status === 400 && /invalid google sheets url|docs\.google\.com\/spreadsheets|extract google sheet id/i.test(message)) {
    return createHttpError("Invalid Google Sheet URL.", 400);
  }

  if (/status\s*403|status\s*401|forbidden|unauthorized/i.test(message)) {
    return createHttpError("Google Sheet is private or inaccessible.", 403);
  }

  if (status === 400 && /contains no data rows/i.test(message)) {
    return createHttpError("Google Sheet has no rows.", 400);
  }

  return createHttpError(message || "Failed to fetch Google Sheet data.", status);
}

async function parseRequestPayload(request) {
  const contentType = toSafeString(request.headers.get("content-type")).toLowerCase();

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const cycleId = toSafeString(formData.get("cycleId"));
    const googleSheetUrl = toSafeString(formData.get("googleSheetUrl"));
    const defaults = {
      employeeId: toSafeString(formData.get("employeeId")),
      frameworkType: toSafeString(formData.get("frameworkType")),
      weightage: toSafeString(formData.get("weightage")),
      dueDate: toSafeString(formData.get("dueDate")),
      managerId: toSafeString(formData.get("managerId")),
      manualAssign: String(formData.get("manualAssign") || "").trim().toLowerCase() === "true",
      allowUnknownCycle: String(formData.get("allowUnknownCycle") || "").trim().toLowerCase() === "true",
    };
    const file = formData.get("file");

    if (googleSheetUrl) {
      try {
        const rows = await fetchGoogleSheetData(googleSheetUrl);
        return { rows, cycleId, defaults };
      } catch (error) {
        throw mapGoogleSheetError(error);
      }
    }

    if (file) {
      const rows = await parseRowsFromFile(file);
      return { rows, cycleId, defaults };
    }

    return { rows: [], cycleId, defaults };
  }

  const body = await request.json().catch(() => ({}));
  const cycleId = toSafeString(body?.cycleId);
  const googleSheetUrl = toSafeString(body?.googleSheetUrl);
  const defaults = {
    employeeId: toSafeString(body?.defaults?.employeeId || body?.employeeId),
    frameworkType: toSafeString(body?.defaults?.frameworkType || body?.frameworkType),
    weightage: toSafeString(body?.defaults?.weightage || body?.weightage),
    dueDate: toSafeString(body?.defaults?.dueDate || body?.dueDate),
    managerId: toSafeString(body?.defaults?.managerId || body?.managerId),
    manualAssign: Boolean(body?.defaults?.manualAssign),
    allowUnknownCycle: Boolean(body?.defaults?.allowUnknownCycle),
  };

  if (googleSheetUrl) {
    try {
      const rows = await fetchGoogleSheetData(googleSheetUrl);
      return { rows, cycleId, defaults };
    } catch (error) {
      throw mapGoogleSheetError(error);
    }
  }

  if (Array.isArray(body?.rows)) {
    return { rows: body.rows, cycleId, defaults };
  }

  return { rows: [], cycleId, defaults };
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "hr"]);

    const { rows, cycleId, defaults } = await parseRequestPayload(request);

    if (rows.length === 0) {
      return NextResponse.json({ error: "rows payload is required" }, { status: 400 });
    }

    assertKnownColumns(rows);

    const preview = await previewImportRows({
      databases,
      profile,
      rows,
      fallbackCycleId: cycleId,
      defaults,
    });

    return NextResponse.json(
      {
        ok: true,
        role: profile.role,
        policy: preview.policy,
        totalRows: preview.totalRows,
        validRows: preview.validRows,
        invalidRows: preview.invalidRows,
        rows: preview.previewRows,
      },
      { status: 200 }
    );
  } catch (error) {
    const status = Number(error?.status || error?.statusCode || 500);
    const message = String(error?.message || "Preview failed");
    const payload = error?.invalidColumns
      ? { error: message, invalidColumns: error.invalidColumns }
      : { error: message };
    return NextResponse.json(payload, { status });
  }
}

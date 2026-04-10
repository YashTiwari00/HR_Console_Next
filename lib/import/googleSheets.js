const GOOGLE_SHEETS_HOST = "docs.google.com";
const GOOGLE_SHEETS_PATH_PREFIX = "/spreadsheets";
const MAX_GOOGLE_SHEET_ROWS = 100;
const GOOGLE_SHEETS_FETCH_TIMEOUT_MS = 8000;

function createHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function splitCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function parseCsvToJson(csvText) {
  const safeText = String(csvText || "").replace(/^\uFEFF/, "").trim();
  if (!safeText) return [];

  const lines = safeText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const headers = splitCsvLine(lines[0]).map((header, index) => {
    const value = String(header || "").trim();
    return value || `column_${index + 1}`;
  });

  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const values = splitCsvLine(lines[i]);
    const row = {};
    let hasData = false;

    for (let j = 0; j < headers.length; j += 1) {
      const value = String(values[j] || "").trim();
      row[headers[j]] = value;
      if (value) {
        hasData = true;
      }
    }

    if (hasData) {
      rows.push(row);
    }
  }

  return rows;
}

export function extractSheetId(url) {
  const rawUrl = String(url || "").trim();
  if (!rawUrl) {
    throw createHttpError("Invalid Google Sheets URL.", 400);
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw createHttpError("Invalid Google Sheets URL.", 400);
  }

  const hostname = String(parsed.hostname || "").toLowerCase();
  const pathname = String(parsed.pathname || "");
  const protocol = String(parsed.protocol || "").toLowerCase();

  if (protocol !== "https:") {
    throw createHttpError("Invalid Google Sheet URL.", 400);
  }

  if (hostname !== GOOGLE_SHEETS_HOST || !pathname.startsWith(GOOGLE_SHEETS_PATH_PREFIX)) {
    throw createHttpError("Only docs.google.com/spreadsheets URLs are allowed.", 400);
  }

  const match = pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const sheetId = String(match?.[1] || "").trim();

  if (!sheetId) {
    throw createHttpError("Unable to extract Google Sheet ID from URL.", 400);
  }

  return sheetId;
}

export function buildCsvExportUrl(sheetId) {
  const safeSheetId = String(sheetId || "").trim();
  if (!safeSheetId) {
    throw createHttpError("Google Sheet ID is required.", 400);
  }

  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(safeSheetId)}/export?format=csv`;
}

export async function fetchGoogleSheetData(url) {
  const sheetId = extractSheetId(url);
  const csvUrl = buildCsvExportUrl(sheetId);
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, GOOGLE_SHEETS_FETCH_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(csvUrl, {
      method: "GET",
      headers: {
        Accept: "text/csv",
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw createHttpError("Google Sheet request timed out. Try again.", 504);
    }
    throw createHttpError("Unable to fetch Google Sheet data.", 502);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw createHttpError("Google Sheet is private or inaccessible.", 403);
    }
    throw createHttpError("Unable to fetch Google Sheet data.", 502);
  }

  const csvText = await response.text().catch(() => "");
  const rows = parseCsvToJson(csvText);

  if (!rows.length) {
    throw createHttpError("Google Sheet contains no data rows.", 400);
  }

  return rows.slice(0, MAX_GOOGLE_SHEET_ROWS);
}

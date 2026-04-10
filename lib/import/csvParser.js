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

export function parseCsvToJson(input) {
  const safeText = String(input || "").replace(/^\uFEFF/, "").trim();
  if (!safeText) {
    return [];
  }

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

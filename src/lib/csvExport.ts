export type CsvCell = string | number | boolean | null | undefined | Date;

export type CsvColumn<T> = {
  key: string;
  header: string;
  value: (row: T) => CsvCell;
};

function csvEscape(value: CsvCell): string {
  if (value instanceof Date) {
    return `"${value.toISOString()}"`;
  }

  const text = String(value ?? "");
  const escaped = text.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function buildCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const headerLine = columns.map((column) => csvEscape(column.header)).join(",");
  const dataLines = rows.map((row) => columns.map((column) => csvEscape(column.value(row))).join(","));
  return `${headerLine}\n${dataLines.join("\n")}\n`;
}

export function downloadCsvFile(csv: string, fileName: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

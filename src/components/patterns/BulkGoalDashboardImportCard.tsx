"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Stack } from "@/src/components/layout";
import { Alert, Button, Card, Dropdown, Input } from "@/src/components/ui";
import {
  commitBulkGoalsImport,
  createGoal,
  createGoalCascade,
  fetchGoalCycles,
  fetchMe,
  getCycleIdFromDate,
  previewBulkGoalsImport,
  type BulkGoalImportPreviewRow,
  type BulkGoalImportRowInput,
} from "@/app/employee/_lib/pmsClient";

interface DashboardBulkRow {
  title: string;
  description: string;
  weightage: number;
}

type UploadSourceType = "excel" | "google_sheet";

const frameworkOptions = [
  { value: "OKR", label: "OKR" },
  { value: "MBO", label: "MBO" },
  { value: "HYBRID", label: "HYBRID" },
];

function buildCycleOptions(referenceDate = new Date()) {
  const out: Array<{ value: string; label: string }> = [];
  const baseYear = referenceDate.getUTCFullYear();
  const baseQuarter = Math.floor(referenceDate.getUTCMonth() / 3) + 1;

  for (let offset = -2; offset <= 5; offset += 1) {
    const quarterIndex = baseQuarter - 1 + offset;
    const year = baseYear + Math.floor(quarterIndex / 4);
    const quarter = ((quarterIndex % 4) + 4) % 4 + 1;
    const value = `Q${quarter}-${year}`;
    out.push({ value, label: value });
  }

  return out;
}

export interface BulkGoalDashboardImportCardProps {
  title?: string;
  description?: string;
  onSaved?: () => Promise<void> | void;
  allowedSources?: UploadSourceType[];
  managerCascadeMode?: boolean;
}

interface CascadeCommitGroup {
  key: string;
  title: string;
  description: string;
  cycleId: string;
  frameworkType: string;
  dueDate: string | null;
  managerId: string;
  employees: Array<{
    employeeId: string;
    weightage: number;
  }>;
  defaultWeightage: number;
}

function normalizeContributionByWeight(
  entries: Array<{ employeeId: string; weightage: number }>
) {
  if (entries.length === 0) return [] as Array<{ employeeId: string; contributionPercent: number }>;

  const safeWeights = entries.map((entry) => ({
    employeeId: entry.employeeId,
    weightage: Number.isFinite(entry.weightage) && entry.weightage > 0 ? entry.weightage : 1,
  }));

  const total = safeWeights.reduce((sum, entry) => sum + entry.weightage, 0);
  if (total <= 0) {
    const equal = Math.floor(100 / safeWeights.length);
    const remainder = 100 % safeWeights.length;
    return safeWeights.map((entry, index) => ({
      employeeId: entry.employeeId,
      contributionPercent: equal + (index < remainder ? 1 : 0),
    }));
  }

  const normalized = safeWeights.map((entry) => ({
    employeeId: entry.employeeId,
    contributionPercent: Math.round((entry.weightage / total) * 100),
  }));
  const normalizedTotal = normalized.reduce((sum, entry) => sum + entry.contributionPercent, 0);

  if (normalizedTotal !== 100 && normalized.length > 0) {
    normalized[0].contributionPercent += 100 - normalizedTotal;
  }

  return normalized;
}

function buildCascadeGroups(rows: BulkGoalImportRowInput[]) {
  const groups = new Map<string, CascadeCommitGroup>();

  for (const row of rows) {
    const title = String(row?.title || "").trim();
    const description = String(row?.description || "").trim();
    const cycleId = String(row?.cycleId || "").trim();
    const frameworkType = String(row?.frameworkType || "").trim() || "OKR";
    const dueDate = row?.dueDate ? String(row.dueDate).trim() : "";
    const managerId = String(row?.managerId || "").trim();
    const employeeId = String(row?.employeeId || "").trim();
    const weightage = Number.parseInt(String(row?.weightage || "0"), 10);

    if (!title || !description || !cycleId) {
      continue;
    }

    const key = [title, description, cycleId, frameworkType, dueDate].join("||");
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        key,
        title,
        description,
        cycleId,
        frameworkType,
        dueDate: dueDate || null,
        managerId,
        defaultWeightage: Number.isInteger(weightage) && weightage > 0 ? weightage : 10,
        employees: employeeId
          ? [
              {
                employeeId,
                weightage: Number.isInteger(weightage) && weightage > 0 ? weightage : 10,
              },
            ]
          : [],
      });
      continue;
    }

    if (!Number.isInteger(existing.defaultWeightage) || existing.defaultWeightage <= 0) {
      existing.defaultWeightage = Number.isInteger(weightage) && weightage > 0 ? weightage : 10;
    }

    if (employeeId && !existing.employees.some((item) => item.employeeId === employeeId)) {
      existing.employees.push({
        employeeId,
        weightage: Number.isInteger(weightage) && weightage > 0 ? weightage : 10,
      });
    }
  }

  return Array.from(groups.values());
}

function readCell(row: Record<string, unknown>, keys: string[]) {
  const entries = Object.entries(row);
  for (const key of keys) {
    const found = entries.find(([rowKey]) => rowKey.trim().toLowerCase() === key.trim().toLowerCase());
    if (found && String(found[1] ?? "").trim()) {
      return String(found[1]).trim();
    }
  }
  return "";
}

function parseRows(rows: Record<string, unknown>[]) {
  return rows
    .map((row) => {
      const title = readCell(row, ["title", "goal title", "goal"]);
      const description = readCell(row, ["description", "goal description"]);
      const weightRaw = readCell(row, ["weight", "weightage", "%"]);
      const weightage = Number.parseInt(weightRaw || "0", 10);

      return {
        title,
        description,
        weightage: Number.isInteger(weightage) && weightage > 0 ? weightage : 10,
      } as DashboardBulkRow;
    })
    .filter((item) => item.title && item.description);
}

function isGoogleSheetUrl(url: string) {
  try {
    const parsed = new URL(String(url || "").trim());
    return parsed.hostname.toLowerCase() === "docs.google.com" && parsed.pathname.includes("/spreadsheets");
  } catch {
    return false;
  }
}

export default function BulkGoalDashboardImportCard({
  title = "Bulk Goal Import",
  description = "Upload Excel or use a Google Sheet link, then preview and commit goals.",
  onSaved,
  allowedSources = ["excel", "google_sheet"],
  managerCascadeMode = false,
}: BulkGoalDashboardImportCardProps) {
  const normalizedAllowedSources =
    allowedSources.length > 0 ? allowedSources : (["excel", "google_sheet"] as UploadSourceType[]);
  const defaultSourceType = normalizedAllowedSources.includes("excel")
    ? "excel"
    : normalizedAllowedSources[0];
  const [sourceType, setSourceType] = useState<UploadSourceType>(defaultSourceType);
  const [googleSheetUrl, setGoogleSheetUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileName, setSelectedFileName] = useState("");

  const [cycleId, setCycleId] = useState(getCycleIdFromDate());
  const [frameworkType, setFrameworkType] = useState("OKR");
  const [dueDate, setDueDate] = useState("");
  const [managerId, setManagerId] = useState("");

  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkCommitting, setBulkCommitting] = useState(false);
  const [cycleOptions, setCycleOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [bulkError, setBulkError] = useState("");
  const [bulkSuccess, setBulkSuccess] = useState("");
  const [previewRows, setPreviewRows] = useState<BulkGoalImportPreviewRow[]>([]);
  const [previewMeta, setPreviewMeta] = useState({ totalRows: 0, validRows: 0, invalidRows: 0 });
  const [commitRows, setCommitRows] = useState<BulkGoalImportRowInput[]>([]);

  const sheetUrlValid = useMemo(() => isGoogleSheetUrl(googleSheetUrl), [googleSheetUrl]);
  const fallbackCycleOptions = useMemo(() => buildCycleOptions(new Date()), []);

  useEffect(() => {
    let active = true;

    async function loadCycles() {
      try {
        const result = await fetchGoalCycles();
        if (!active) return;

        const options = (result.data || [])
          .map((cycle) => String(cycle?.name || "").trim())
          .filter(Boolean)
          .map((name) => ({ value: name, label: name }));

        if (options.length > 0) {
          setCycleOptions(options);
          setCycleId((prev) => {
            if (options.some((option) => option.value === prev)) return prev;
            return options[0].value;
          });
          return;
        }

        setCycleOptions(fallbackCycleOptions);
      } catch {
        if (!active) return;
        setCycleOptions(fallbackCycleOptions);
      }
    }

    loadCycles();

    return () => {
      active = false;
    };
  }, [fallbackCycleOptions]);

  async function resolveImportContext() {
    const profile = await fetchMe();

    const employeeId = String(profile?.$id || profile?.profile?.$id || "").trim();
    const resolvedManagerId = String(
      managerId || profile?.managerId || profile?.profile?.managerId || ""
    ).trim();

    if (!employeeId) {
      throw new Error("Unable to resolve current user for bulk import.");
    }

    if (!resolvedManagerId) {
      throw new Error("managerId is required for import. Enter Manager ID before preview.");
    }

    setManagerId(resolvedManagerId);
    return { employeeId, managerId: resolvedManagerId };
  }

  async function readWorkbook(file: File) {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: "array" });
    const firstSheet = workbook.SheetNames?.[0];
    if (!firstSheet) {
      throw new Error("Workbook has no sheets.");
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet], {
      defval: "",
    });

    return parseRows(rows);
  }

  function toImportRows(sourceRows: DashboardBulkRow[], employeeId: string, nextManagerId: string) {
    return sourceRows.map((row) => ({
      employeeId,
      title: row.title,
      description: row.description,
      frameworkType,
      weightage: row.weightage,
      cycleId,
      dueDate: dueDate || null,
      lineageRef: "",
      aiSuggested: true,
      managerId: nextManagerId,
    }));
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    setSelectedFileName(file?.name || "");
    setPreviewRows([]);
    setPreviewMeta({ totalRows: 0, validRows: 0, invalidRows: 0 });
    setCommitRows([]);
    setBulkError("");
    setBulkSuccess("");
    event.target.value = "";
  }

  async function handlePreview() {
    setBulkLoading(true);
    setBulkError("");
    setBulkSuccess("");
    setPreviewRows([]);
    setCommitRows([]);

    try {
      if (sourceType === "google_sheet") {
        if (!sheetUrlValid) {
          throw new Error("Enter a valid Google Sheet URL from docs.google.com/spreadsheets.");
        }

        const preview = await previewBulkGoalsImport({
          googleSheetUrl: googleSheetUrl.trim(),
          cycleId,
          defaults: {
            frameworkType,
            weightage: 10,
            dueDate: dueDate || undefined,
            managerId: managerId || undefined,
            manualAssign: managerCascadeMode,
          },
        });

        setPreviewRows(preview.rows || []);
        setPreviewMeta({
          totalRows: Number(preview.totalRows || 0),
          validRows: Number(preview.validRows || 0),
          invalidRows: Number(preview.invalidRows || 0),
        });
        setCommitRows((preview.rows || []).map((row) => row.normalized));
        setBulkSuccess(`Preview complete: ${preview.validRows} valid, ${preview.invalidRows} invalid.`);
        return;
      }

      if (!selectedFile) {
        throw new Error("Upload an Excel file before preview.");
      }

      const sourceRows = await readWorkbook(selectedFile);
      if (sourceRows.length === 0) {
        throw new Error("No valid goals found in uploaded file.");
      }

      const context = await resolveImportContext();
      const rows = toImportRows(sourceRows, context.employeeId, context.managerId);

      const preview = await previewBulkGoalsImport({ rows, cycleId });
      setPreviewRows(preview.rows || []);
      setPreviewMeta({
        totalRows: Number(preview.totalRows || 0),
        validRows: Number(preview.validRows || 0),
        invalidRows: Number(preview.invalidRows || 0),
      });
      setCommitRows((preview.rows || []).map((row) => row.normalized));
      setBulkSuccess(`Preview complete: ${preview.validRows} valid, ${preview.invalidRows} invalid.`);
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Failed to generate preview.");
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleCommit() {
    if (commitRows.length === 0) {
      setBulkError("Run preview before commit.");
      return;
    }

    setBulkCommitting(true);
    setBulkError("");
    setBulkSuccess("");

    try {
      if (managerCascadeMode && sourceType === "google_sheet") {
        const groups = buildCascadeGroups(commitRows);
        if (groups.length === 0) {
          throw new Error("No valid grouped goals found to cascade from Google Sheet rows.");
        }

        let parentGoalsCreated = 0;
        let groupsCascaded = 0;
        let manualDraftGroups = 0;

        for (const group of groups) {
          const contributions = normalizeContributionByWeight(group.employees);

          const parentWeightage = Math.max(
            1,
            Number.parseInt(
              String(
                group.employees[0]?.weightage ||
                  group.defaultWeightage ||
                  10
              ),
              10
            )
          );
          const created = await createGoal({
            title: group.title,
            description: group.description,
            cycleId: group.cycleId,
            frameworkType: group.frameworkType,
            managerId: group.managerId || managerId,
            weightage: parentWeightage,
            dueDate: group.dueDate,
            aiSuggested: true,
          });

          const parentGoalId = String(created?.data?.$id || created?.$id || "").trim();
          if (!parentGoalId) {
            throw new Error("Failed to resolve parent goal id for Google Sheet cascade group.");
          }

          parentGoalsCreated += 1;

          if (contributions.length === 0) {
            manualDraftGroups += 1;
            continue;
          }

          await createGoalCascade({
            parentGoalId,
            employeeIds: contributions.map((item) => item.employeeId),
            splitStrategy: {
              type: "custom",
              contributions,
            },
          });

          groupsCascaded += 1;
        }

        setBulkSuccess(
          `Commit complete: created ${parentGoalsCreated} manager draft goal(s), cascaded ${groupsCascaded} group(s), manual assignment needed for ${manualDraftGroups} goal(s).`
        );

        if (onSaved) {
          await onSaved();
        }

        return;
      }

      const idempotencyKey =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const result = await commitBulkGoalsImport({
        data: commitRows,
        cycleId,
        idempotencyKey,
        templateVersion: "v1",
        sourceType,
        sourceUrl: sourceType === "google_sheet" ? googleSheetUrl.trim() : undefined,
      });

      const successRows = Number(result?.summary?.successRows || 0);
      const failedRows = Number(result?.summary?.failedRows || 0);
      setBulkSuccess(`Commit complete: ${successRows} saved, ${failedRows} failed.`);

      if (onSaved) {
        await onSaved();
      }
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Failed to commit bulk goals.");
    } finally {
      setBulkCommitting(false);
    }
  }

  const previewRowsToShow = useMemo(() => previewRows.slice(0, 12), [previewRows]);

  return (
    <Card title={title} description={description}>
      <Stack gap="3">
        {bulkError && (
          <Alert variant="error" title="Bulk upload error" description={bulkError} onDismiss={() => setBulkError("")} />
        )}
        {bulkSuccess && (
          <Alert variant="success" title="Bulk upload" description={bulkSuccess} onDismiss={() => setBulkSuccess("")} />
        )}

        {normalizedAllowedSources.length > 1 && (
          <div className="inline-flex rounded-[var(--radius-sm)] border border-[var(--color-border)] p-1">
            {normalizedAllowedSources.includes("excel") && (
              <Button type="button" size="sm" variant={sourceType === "excel" ? undefined : "secondary"} onClick={() => setSourceType("excel")}>
                Upload Excel
              </Button>
            )}
            {normalizedAllowedSources.includes("google_sheet") && (
              <Button type="button" size="sm" variant={sourceType === "google_sheet" ? undefined : "secondary"} onClick={() => setSourceType("google_sheet")}>
                Google Sheet Link
              </Button>
            )}
          </div>
        )}

        {sourceType === "excel" ? (
          <Input
            type="file"
            label="Upload Excel (.xlsx, .xls)"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
          />
        ) : (
          <Input
            label="Google Sheet URL"
            placeholder="https://docs.google.com/spreadsheets/d/..."
            value={googleSheetUrl}
            onChange={(event) => setGoogleSheetUrl(event.target.value)}
          />
        )}

        {sourceType === "google_sheet" && googleSheetUrl && !sheetUrlValid && (
          <p className="caption text-[var(--color-danger,#b91c1c)]">
            URL must include docs.google.com/spreadsheets.
          </p>
        )}

        <div className="grid gap-2 md:grid-cols-4">
          <Dropdown
            label="Cycle ID"
            value={cycleId}
            onChange={(value) => setCycleId(value)}
            options={cycleOptions.length > 0 ? cycleOptions : fallbackCycleOptions}
          />
          <Dropdown
            label="Framework"
            value={frameworkType}
            onChange={(value) => setFrameworkType(value)}
            options={frameworkOptions}
          />
          <Input
            label="Manager ID"
            value={managerId}
            onChange={(event) => setManagerId(event.target.value)}
            helperText="Use your manager/approver ID for manager-as-employee routing."
          />
          <Input label="Due Date" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={handlePreview}
            loading={bulkLoading}
            disabled={bulkLoading || bulkCommitting}
          >
            {sourceType === "google_sheet" && bulkLoading ? "Fetching sheet..." : "Preview Import"}
          </Button>
          <Button
            type="button"
            onClick={handleCommit}
            loading={bulkCommitting}
            disabled={previewRows.length === 0 || bulkLoading || bulkCommitting}
          >
            Commit Goals
          </Button>
        </div>

        {sourceType === "excel" && <p className="caption">Expected columns: title, description, weight or weightage.</p>}
        {selectedFileName && sourceType === "excel" && <p className="caption">Selected file: {selectedFileName}</p>}

        {previewRows.length > 0 && (
          <div className="space-y-2">
            <p className="caption">
              Preview: {previewMeta.validRows} valid, {previewMeta.invalidRows} invalid, total {previewMeta.totalRows}.
            </p>
            <div className="overflow-auto rounded-[var(--radius-sm)] border border-[var(--color-border)]">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[var(--color-surface-muted)]">
                  <tr>
                    <th className="px-3 py-2">Row</th>
                    <th className="px-3 py-2">Title</th>
                    <th className="px-3 py-2">Employee</th>
                    <th className="px-3 py-2">Framework</th>
                    <th className="px-3 py-2">Weightage</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRowsToShow.map((row) => (
                    <tr key={row.rowNumber} className="border-t border-[var(--color-border)]">
                      <td className="px-3 py-2">{row.rowNumber}</td>
                      <td className="px-3 py-2">{row.normalized?.title || "-"}</td>
                      <td className="px-3 py-2">{row.normalized?.employeeId || "-"}</td>
                      <td className="px-3 py-2">{row.normalized?.frameworkType || "-"}</td>
                      <td className="px-3 py-2">{row.normalized?.weightage ?? "-"}</td>
                      <td className="px-3 py-2">{row.valid ? "Valid" : "Invalid"}</td>
                      <td className="px-3 py-2">{row.errors?.join("; ") || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {previewRows.length > 12 && <p className="caption">Showing first 12 rows only.</p>}
          </div>
        )}
      </Stack>
    </Card>
  );
}

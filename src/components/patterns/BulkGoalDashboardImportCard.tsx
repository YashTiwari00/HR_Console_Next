"use client";

import { ChangeEvent, useState } from "react";
import * as XLSX from "xlsx";
import { Stack } from "@/src/components/layout";
import { Alert, Button, Card, Input } from "@/src/components/ui";
import { getCycleIdFromDate, type BulkGoalAnalysisItem, type BulkGoalInput, createGoal, fetchMe, getBulkGoalAnalysis } from "@/app/employee/_lib/pmsClient";
import BulkGoalAiReviewPanel from "@/src/components/patterns/BulkGoalAiReviewPanel";
import type { GoalAiDraft } from "@/src/components/patterns/GoalAiComparisonCard";

interface DashboardBulkRow {
  title: string;
  description: string;
  weight: number;
}

export interface BulkGoalDashboardImportCardProps {
  title?: string;
  description?: string;
  onSaved?: () => Promise<void> | void;
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
      const weight = Number.parseInt(weightRaw || "0", 10);

      return {
        title,
        description,
        weight: Number.isInteger(weight) && weight > 0 ? weight : 10,
      } as DashboardBulkRow;
    })
    .filter((item) => item.title && item.description);
}

function buildDrafts(analysis: BulkGoalAnalysisItem[], sourceRows: DashboardBulkRow[]) {
  return analysis.map((item, index) => ({
    title: item.improvedTitle || sourceRows[index]?.title || "",
    description: item.improvedDescription || sourceRows[index]?.description || "",
    metrics: item.suggestedMetrics || "",
    weight: sourceRows[index]?.weight || 10,
    allocationSplitText: "",
  }));
}

export default function BulkGoalDashboardImportCard({
  title = "Bulk Goal Import",
  description = "Upload Excel goals and review AI improvements before saving.",
  onSaved,
}: BulkGoalDashboardImportCardProps) {
  const [cycleId, setCycleId] = useState(getCycleIdFromDate());
  const [frameworkType, setFrameworkType] = useState("OKR");
  const [dueDate, setDueDate] = useState("");
  const [managerId, setManagerId] = useState("");
  const [resolvedManagerLoaded, setResolvedManagerLoaded] = useState(false);

  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [bulkSuccess, setBulkSuccess] = useState("");
  const [bulkFallbackUsed, setBulkFallbackUsed] = useState(false);
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkSourceRows, setBulkSourceRows] = useState<DashboardBulkRow[]>([]);
  const [bulkAnalysis, setBulkAnalysis] = useState<BulkGoalAnalysisItem[]>([]);
  const [bulkDrafts, setBulkDrafts] = useState<GoalAiDraft[]>([]);

  async function resolveManagerId() {
    if (resolvedManagerLoaded) return;

    try {
      const profile = await fetchMe();
      const nextManagerId = String(profile?.profile?.managerId || "").trim();
      if (nextManagerId) {
        setManagerId(nextManagerId);
      }
    } catch {
      // Manual fallback stays available in UI.
    } finally {
      setResolvedManagerLoaded(true);
    }
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

  async function analyzeRows(sourceRows: DashboardBulkRow[]) {
    if (sourceRows.length === 0) {
      throw new Error("No valid goals found in uploaded file.");
    }

    if (sourceRows.length > 10) {
      throw new Error("Upload contains more than 10 goals. Please reduce rows to 10 or fewer.");
    }

    const inputGoals: BulkGoalInput[] = sourceRows.map((row) => ({
      title: row.title,
      description: row.description,
      weight: row.weight,
    }));

    const analysis = await getBulkGoalAnalysis({
      goals: inputGoals,
      role: "employee",
      cycleId,
    });

    setBulkAnalysis(analysis.goals);
    setBulkDrafts(buildDrafts(analysis.goals, sourceRows));
    setBulkFallbackUsed(analysis.fallbackUsed);
  }

  async function handleBulkFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    if (!file) return;

    setBulkFileName(file.name);
    setBulkError("");
    setBulkSuccess("");
    setBulkLoading(true);

    try {
      const sourceRows = await readWorkbook(file);
      setBulkSourceRows(sourceRows);
      await analyzeRows(sourceRows);
      setBulkSuccess("Bulk goals analyzed with AI.");
    } catch (err) {
      setBulkAnalysis([]);
      setBulkDrafts([]);
      setBulkFallbackUsed(false);
      setBulkError(err instanceof Error ? err.message : "Failed to process file.");
    } finally {
      setBulkLoading(false);
      event.target.value = "";
    }
  }

  function handleBulkDraftChange(index: number, draft: GoalAiDraft) {
    setBulkDrafts((prev) => prev.map((item, itemIndex) => (itemIndex === index ? draft : item)));
  }

  function handleApplyBulkSuggestion() {
    setBulkSuccess("Applied selected AI suggestion.");
  }

  function handleApplyAllBulkSuggestions() {
    if (bulkDrafts.length === 0) return;
    setBulkSuccess("Applied all AI suggestions.");
  }

  async function handleSaveBulkGoals() {
    if (bulkDrafts.length === 0) return;

    await resolveManagerId();

    const activeManagerId = String(managerId || "").trim();
    if (!activeManagerId) {
      setBulkError("managerId is missing for this profile. Enter it manually before saving.");
      return;
    }

    setBulkSaving(true);
    setBulkError("");
    setBulkSuccess("");

    try {
      let createdCount = 0;

      for (const draft of bulkDrafts) {
        await createGoal({
          title: draft.title,
          description: `${draft.description}${draft.metrics ? `\n\nMetric: ${draft.metrics}` : ""}`,
          cycleId,
          frameworkType,
          managerId: activeManagerId,
          weightage: draft.weight,
          dueDate: dueDate || null,
          aiSuggested: true,
        });
        createdCount += 1;
      }

      setBulkSuccess(`Created ${createdCount} goal(s) from bulk upload.`);
      if (onSaved) {
        await onSaved();
      }
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Failed to save bulk goals.");
    } finally {
      setBulkSaving(false);
    }
  }

  return (
    <Card title={title} description={description}>
      <Stack gap="3">
        {bulkError && (
          <Alert variant="error" title="Bulk upload error" description={bulkError} onDismiss={() => setBulkError("")} />
        )}
        {bulkSuccess && (
          <Alert variant="success" title="Bulk upload" description={bulkSuccess} onDismiss={() => setBulkSuccess("")} />
        )}

        <Input
          type="file"
          label="Upload Excel (.xlsx, .xls)"
          accept=".xlsx,.xls"
          onChange={handleBulkFileUpload}
        />

        <div className="grid gap-2 md:grid-cols-4">
          <Input label="Cycle ID" value={cycleId} onChange={(event) => setCycleId(event.target.value)} />
          <Input label="Framework" value={frameworkType} onChange={(event) => setFrameworkType(event.target.value)} />
          <Input label="Manager ID" value={managerId} onChange={(event) => setManagerId(event.target.value)} />
          <Input label="Due Date" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => analyzeRows(bulkSourceRows)}
            loading={bulkLoading}
            disabled={bulkSourceRows.length === 0}
          >
            Re-run AI Analysis
          </Button>
          <Button type="button" onClick={handleSaveBulkGoals} loading={bulkSaving} disabled={bulkDrafts.length === 0}>
            Save Goals
          </Button>
        </div>

        <p className="caption">Expected columns in first sheet: title, description, weight or weightage. Max 10 goals per upload.</p>
        {bulkFileName && <p className="caption">Uploaded file: {bulkFileName}</p>}

        <BulkGoalAiReviewPanel
          role="employee"
          items={bulkAnalysis}
          drafts={bulkDrafts}
          loading={bulkLoading}
          fallbackUsed={bulkFallbackUsed}
          error={bulkError}
          onDraftChange={handleBulkDraftChange}
          onApplySuggestion={handleApplyBulkSuggestion}
          onApplyAll={handleApplyAllBulkSuggestions}
          onDismissError={() => setBulkError("")}
        />
      </Stack>
    </Card>
  );
}

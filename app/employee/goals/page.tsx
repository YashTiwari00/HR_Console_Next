"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Container, Grid, Stack } from "@/src/components/layout";
import * as XLSX from "xlsx";
import {
  ExplainabilityDrawer,
  GoalLineageCard,
  GoalLineageView,
  PageHeader,
} from "@/src/components/patterns";
import { Alert, Badge, Button, Card, Dropdown, Input, Textarea, Tooltip } from "@/src/components/ui";
import { ContributionBadge } from "@/src/components/ui/ContributionBadge";
import { useAiMode } from "@/src/context/AiModeContext";
import {
  commitBulkGoalsImport,
  type BulkGoalImportPreviewRow,
  type BulkGoalImportRowInput,
  createGoal,
  fetchAiUsageSnapshot,
  fetchGoalFeedback,
  fetchGoalRatings,
  fetchGoals,
  fetchMe,
  getCycleIdFromDate,
  getGoalSuggestions,
  GoalItem,
  GoalRatingItem,
  GoalRatingsResponse,
  GoalSuggestion,
  goalStatusVariant,
  previewBulkGoalsImport,
  previewGoalsImport,
  submitGoal,
  updateGoal,
} from "@/app/employee/_lib/pmsClient";

type BulkUploadSource = "excel" | "google_sheet";

interface EmployeeBulkGoalRow {
  title: string;
  description: string;
  weightage: number;
}

const frameworkOptions = [
  { value: "OKR", label: "OKR" },
  { value: "MBO", label: "MBO" },
  { value: "HYBRID", label: "HYBRID" },
];

function getSuggestionSourceBadge(suggestion: GoalSuggestion | null): {
  label: string;
  variant: "default" | "success" | "danger" | "warning" | "info";
} {
  if (!suggestion) return { label: "AI Generated", variant: "info" };

  const sourceType = String(suggestion.source_type || "").trim().toLowerCase();

  if (sourceType === "hr") return { label: "Company Standard", variant: "success" };
  if (sourceType === "leadership") return { label: "Strategic", variant: "info" };
  if (sourceType === "system") return { label: "Generic", variant: "default" };
  if (sourceType === "manager") {
    return suggestion.approved
      ? { label: "Team Recommended", variant: "success" }
      : { label: "Pending Approval", variant: "warning" };
  }

  return { label: "AI Generated", variant: "info" };
}

function goalLifecycleBorderClass(status: string) {
  if (status === "submitted") return "border-l-[#f59e0b]";
  if (status === "approved") return "border-l-[#16a34a]";
  if (status === "needs_changes") return "border-l-[#dc2626]";
  return "border-l-[#9ca3af]";
}

function progressWidthClass(percent: number) {
  const normalized = Math.max(0, Math.min(100, percent));
  if (normalized >= 100) return "w-full";
  if (normalized >= 90) return "w-11/12";
  if (normalized >= 80) return "w-10/12";
  if (normalized >= 70) return "w-9/12";
  if (normalized >= 60) return "w-8/12";
  if (normalized >= 50) return "w-6/12";
  if (normalized >= 40) return "w-5/12";
  if (normalized >= 30) return "w-4/12";
  if (normalized >= 20) return "w-3/12";
  if (normalized >= 10) return "w-2/12";
  if (normalized > 0) return "w-1/12";
  return "w-0";
}

export default function EmployeeGoalsPage() {
  const aiMode = useAiMode();
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiSuggestion, setAiSuggestion] = useState<GoalSuggestion | null>(null);
  const [aiUsageRemaining, setAiUsageRemaining] = useState<number | null>(null);
  const [aiBudgetWarning, setAiBudgetWarning] = useState("");
  const [explainabilityOpen, setExplainabilityOpen] = useState(false);

  const [goalForm, setGoalForm] = useState({
    title: "",
    description: "",
    cycleId: getCycleIdFromDate(),
    frameworkType: "OKR",
    managerId: "",
    weightage: "20",
    dueDate: "",
  });

  const [, setManagerResolved] = useState(false);
  const [feedbackByGoal, setFeedbackByGoal] = useState<Record<string, string>>({});
  const [goalRatings, setGoalRatings] = useState<Record<string, GoalRatingsResponse>>({});
  const [loadingRatingsFor, setLoadingRatingsFor] = useState<Set<string>>(new Set());

  async function loadGoalRatings(goalId: string) {
    if (goalRatings[goalId] || loadingRatingsFor.has(goalId)) return;
    setLoadingRatingsFor((prev) => new Set(prev).add(goalId));
    try {
      const data = await fetchGoalRatings(goalId);
      if (data.ratings.length > 1) {
        setGoalRatings((prev) => ({ ...prev, [goalId]: data }));
      }
    } catch {
      // non-critical — silently skip
    } finally {
      setLoadingRatingsFor((prev) => { const next = new Set(prev); next.delete(goalId); return next; });
    }
  }
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    cycleId: "",
    frameworkType: "OKR",
    managerId: "",
    weightage: "20",
    dueDate: "",
  });
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [, setBulkError] = useState("");
  const [bulkSourceType, setBulkSourceType] = useState<BulkUploadSource>("excel");
  const [bulkGoogleSheetUrl, setBulkGoogleSheetUrl] = useState("");
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkEmployeeId, setBulkEmployeeId] = useState("");
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkPreviewRows, setBulkPreviewRows] = useState<BulkGoalImportPreviewRow[]>([]);
  const [bulkCommitRows, setBulkCommitRows] = useState<BulkGoalImportRowInput[]>([]);
  const [bulkPreviewMeta, setBulkPreviewMeta] = useState({ total: 0, valid: 0, invalid: 0 });
  const [lineageGoalId, setLineageGoalId] = useState<string | null>(null);

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

  function parseGoalRows(rows: Record<string, unknown>[]) {
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
        } as EmployeeBulkGoalRow;
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

  async function readGoalsFromWorkbook(file: File) {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: "array" });
    const firstSheet = workbook.SheetNames?.[0];
    if (!firstSheet) {
      throw new Error("Workbook has no sheets.");
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet], {
      defval: "",
    });

    return parseGoalRows(rows);
  }

  function toImportRows(sourceGoals: EmployeeBulkGoalRow[]) {
    const employeeId = String(bulkEmployeeId || "").trim();
    const managerId = String(goalForm.managerId || "").trim();

    if (!employeeId) {
      throw new Error("Unable to resolve your employee profile for bulk import.");
    }

    if (!managerId) {
      throw new Error("Manager ID is required for import. Update the Manager ID field and retry.");
    }

    return sourceGoals.map((row) => ({
      employeeId,
      title: row.title,
      description: row.description,
      frameworkType: goalForm.frameworkType,
      weightage: row.weightage,
      cycleId: goalForm.cycleId,
      dueDate: goalForm.dueDate || null,
      lineageRef: "",
      aiSuggested: true,
      managerId,
    }));
  }

  async function handleBulkFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    if (!file) return;

    setBulkFile(file);
    setBulkFileName(file.name);
    setBulkError("");
    setBulkPreviewRows([]);
    setBulkCommitRows([]);
    setBulkPreviewMeta({ total: 0, valid: 0, invalid: 0 });
    event.target.value = "";
  }

  async function handlePreviewBulkImport() {
    setBulkLoading(true);
    setBulkError("");
    setSuccess("");
    setBulkPreviewRows([]);
    setBulkCommitRows([]);
    setBulkPreviewMeta({ total: 0, valid: 0, invalid: 0 });

    try {
      const preview =
        bulkSourceType === "google_sheet"
          ? await (async () => {
              if (!isGoogleSheetUrl(bulkGoogleSheetUrl)) {
                throw new Error("Enter a valid Google Sheet URL from docs.google.com/spreadsheets.");
              }
              return previewGoalsImport({
                googleSheetUrl: bulkGoogleSheetUrl,
                cycleId: goalForm.cycleId,
              });
            })()
          : await (async () => {
              if (!bulkFile) {
                throw new Error("Upload an Excel file before preview.");
              }

              const sourceGoals = await readGoalsFromWorkbook(bulkFile);
              if (sourceGoals.length === 0) {
                throw new Error("No valid goals found in uploaded file.");
              }

              const rows = toImportRows(sourceGoals);
              return previewBulkGoalsImport({ rows, cycleId: goalForm.cycleId });
            })();

      setBulkPreviewRows(preview.rows || []);
      setBulkCommitRows((preview.rows || []).map((row) => row.normalized));
      setBulkPreviewMeta({
        total: Number(preview.totalRows || 0),
        valid: Number(preview.validRows || 0),
        invalid: Number(preview.invalidRows || 0),
      });
      setSuccess(`Preview complete: ${preview.validRows} valid, ${preview.invalidRows} invalid.`);
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Failed to preview bulk goals.");
    } finally {
      setBulkLoading(false);
    }
  }

  async function persistBulkGoals(submitCreatedGoals: boolean) {
    if (bulkCommitRows.length === 0) {
      setBulkError("Run preview before saving.");
      return;
    }

    if (submitCreatedGoals) {
      setBulkSubmitting(true);
    } else {
      setBulkSaving(true);
    }

    setBulkError("");

    try {
      const idempotencyKey =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const result = await commitBulkGoalsImport({
        data: bulkCommitRows,
        cycleId: goalForm.cycleId,
        idempotencyKey,
        templateVersion: "v1",
        sourceType: bulkSourceType,
        sourceUrl: bulkSourceType === "google_sheet" ? String(bulkGoogleSheetUrl || "").trim() : undefined,
      });

      const createdGoalIds = (result?.summary?.successes || [])
        .map((item) => String(item?.goalId || "").trim())
        .filter(Boolean);

      if (submitCreatedGoals) {
        for (const goalId of createdGoalIds) {
          await submitGoal(goalId);
        }
      }

      setSuccess(
        submitCreatedGoals
          ? `Created and submitted ${createdGoalIds.length} goals for approval.`
          : `Created ${createdGoalIds.length} draft goals from bulk import.`
      );
      await loadGoals();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Failed to save bulk goals.");
    } finally {
      setBulkSaving(false);
      setBulkSubmitting(false);
    }
  }

  const loadGoals = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [goalData, feedbackData] = await Promise.all([
        fetchGoals(),
        fetchGoalFeedback(),
      ]);

      setGoals(goalData);

      const nextFeedback = feedbackData.reduce<Record<string, string>>((acc, item) => {
        acc[item.goalId] = item.comments || "No manager comment provided.";
        return acc;
      }, {});

      setFeedbackByGoal(nextFeedback);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load goals.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGoals();
  }, [loadGoals]);

  useEffect(() => {
    let active = true;

    async function loadAiUsage() {
      try {
        const usage = await fetchAiUsageSnapshot(goalForm.cycleId);
        if (!active) return;

        const feature = usage.features.find((item) => item.featureType === "goal_suggestion");
        const remaining = typeof feature?.remaining === "number" ? feature.remaining : null;
        setAiUsageRemaining(remaining);

        if (remaining !== null && remaining <= 1) {
          setAiBudgetWarning(
            `AI goal suggestion budget is low (${remaining} remaining this cycle).`
          );
        } else {
          setAiBudgetWarning("");
        }
      } catch {
        if (!active) return;
        setAiUsageRemaining(null);
      }
    }

    loadAiUsage();

    return () => {
      active = false;
    };
  }, [goalForm.cycleId]);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        const data = await fetchMe();

        const managerId = data?.profile?.managerId;
        const profileId = String(data?.profile?.$id || data?.$id || "").trim();
        if (active && profileId) {
          setBulkEmployeeId(profileId);
        }
        if (active && managerId) {
          setGoalForm((prev) => ({ ...prev, managerId }));
          setManagerResolved(true);
        }
      } catch {
        // Keep manual manager input fallback if profile lookup fails.
      }
    }

    loadProfile();

    return () => {
      active = false;
    };
  }, []);

  const submittedCount = useMemo(
    () => goals.filter((goal) => goal.status === "submitted").length,
    [goals]
  );

  const cycleWeightage = useMemo(
    () =>
      goals
        .filter((goal) => goal.cycleId === goalForm.cycleId)
        .reduce((sum, goal) => sum + (Number(goal.weightage) || 0), 0),
    [goals, goalForm.cycleId]
  );

  const remainingWeightage = Math.max(0, 100 - cycleWeightage);
  const waitingPercent = goals.length > 0 ? Math.round((submittedCount / goals.length) * 100) : 0;
  const cycleWeightagePercent = Math.max(0, Math.min(100, Math.round(cycleWeightage)));

  async function handleCreateFromSuggestion() {
    if (!aiSuggestion) return;
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      await createGoal({
        title: aiSuggestion.title,
        description: aiSuggestion.description,
        cycleId: goalForm.cycleId,
        frameworkType: goalForm.frameworkType,
        managerId: goalForm.managerId,
        weightage: aiSuggestion.weightage || Number.parseInt(goalForm.weightage, 10),
        dueDate: goalForm.dueDate || null,
        aiSuggested: true,
      });

      setAiSuggestion(null);
      setSuccess("Goal created as draft from AI suggestion.");
      await loadGoals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create goal.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitGoal(goalId: string) {
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      await submitGoal(goalId);
      setSuccess("Goal submitted for manager approval.");
      await loadGoals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit goal.");
    } finally {
      setSubmitting(false);
    }
  }

  function startEditGoal(goal: GoalItem) {
    setEditingGoalId(goal.$id);
    setEditForm({
      title: goal.title,
      description: goal.description,
      cycleId: goal.cycleId,
      frameworkType: goal.frameworkType,
      managerId: goal.managerId,
      weightage: String(goal.weightage),
      dueDate: "",
    });
  }

  async function handleSaveGoalEdit(goalId: string) {
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      await updateGoal(goalId, {
        title: editForm.title,
        description: editForm.description,
        cycleId: editForm.cycleId,
        frameworkType: editForm.frameworkType,
        managerId: editForm.managerId,
        weightage: Number.parseInt(editForm.weightage, 10),
        dueDate: editForm.dueDate || null,
      });

      setSuccess("Goal updated.");
      setEditingGoalId(null);
      await loadGoals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update goal.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAiSuggest() {
    setAiLoading(true);
    setAiError("");

    try {
      const suggestions = await getGoalSuggestions({
        cycleId: goalForm.cycleId,
        frameworkType: goalForm.frameworkType,
        prompt: `${goalForm.title} ${goalForm.description}`.trim(),
      }, aiMode.mode);

      setAiSuggestion(suggestions[0] || null);
      if (!suggestions[0]) {
        setAiError("No suggestion returned. Try refining your prompt.");
      }

      try {
        const usage = await fetchAiUsageSnapshot(goalForm.cycleId);
        const feature = usage.features.find((item) => item.featureType === "goal_suggestion");
        const remaining = typeof feature?.remaining === "number" ? feature.remaining : null;
        setAiUsageRemaining(remaining);
        if (remaining !== null && remaining <= 1) {
          setAiBudgetWarning(
            `AI goal suggestion budget is low (${remaining} remaining this cycle).`
          );
        } else {
          setAiBudgetWarning("");
        }
      } catch {
        // Ignore usage refresh failures.
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Failed to generate suggestion.");
    } finally {
      setAiLoading(false);
    }
  }


  return (
    <Container maxWidth="xl">
      <Stack gap="6">
      <PageHeader
        title="Goals Workspace"
        subtitle="Upload your task document and let AI suggest goals for this cycle."
        actions={
          <Button size="sm" variant="secondary" onClick={loadGoals} disabled={loading || submitting}>
            Refresh
          </Button>
        }
      />

      {/* ── AI Goal Suggestions ──────────────────────────────────────── */}
      <div className="glass rounded-[var(--radius-lg)] p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <h3 className="heading-lg text-[var(--color-text)]">Suggest Goals with AI</h3>
            <p className="caption text-[var(--color-text-muted)] mt-1">
              Upload a tasks document or describe your responsibilities — AI will generate 4–5 measurable goals.
            </p>
          </div>
          <span className="caption text-[var(--color-text-muted)]">
            Remaining suggestions: {aiUsageRemaining === null ? "..." : aiUsageRemaining}
          </span>
        </div>

        <Stack gap="4">
          <Textarea
            label="Describe your tasks or paste a task list"
            value={goalForm.description}
            onChange={(event) => setGoalForm((prev) => ({ ...prev, description: event.target.value }))}
            rows={4}
            placeholder="e.g. I manage the onboarding pipeline, handle vendor negotiations, run weekly standups, own the Q2 product launch..."
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={handleAiSuggest}
              loading={aiLoading}
              disabled={!goalForm.description.trim()}
            >
              Generate Goal Suggestions
            </Button>
            {aiSuggestion && (
              <Button type="button" size="sm" variant="ghost" onClick={handleAiSuggest} loading={aiLoading}>
                Regenerate
              </Button>
            )}
          </div>

          {aiError && <p className="caption text-[var(--color-danger)]">{aiError}</p>}

          {aiSuggestion && (
            <div className="glass-subtle rounded-[var(--radius-md)] p-5 space-y-3" style={{ animation: "slideUp 0.25s ease-out both" }}>
              <div className="flex items-center gap-2">
                <p className="body-sm font-semibold text-[var(--color-text)]">AI Suggested Goal</p>
                <Badge variant={getSuggestionSourceBadge(aiSuggestion).variant}>
                  {getSuggestionSourceBadge(aiSuggestion).label}
                </Badge>
              </div>
              <div className="glass-subtle rounded-[var(--radius-sm)] p-4">
                <p className="body-sm font-medium text-[var(--color-text)]">{aiSuggestion.title}</p>
                <p className="caption text-[var(--color-text-muted)] mt-1">{aiSuggestion.description}</p>
                <div className="flex flex-wrap gap-3 mt-2">
                  <span className="caption text-[var(--color-text-muted)]">Weightage: {aiSuggestion.weightage}%</span>
                  {aiSuggestion.rationale && <span className="caption text-[var(--color-text-muted)]">Why: {aiSuggestion.rationale}</span>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" onClick={handleCreateFromSuggestion} loading={submitting}>
                  Accept &amp; Create Draft
                </Button>
                {aiSuggestion.explainability && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setExplainabilityOpen(true)}>
                    Why this suggestion?
                  </Button>
                )}
              </div>
            </div>
          )}
        </Stack>
      </div>

      {error && <Alert variant="error" title="Action failed" description={error} onDismiss={() => setError("")} />}
      {success && <Alert variant="success" title="Done" description={success} onDismiss={() => setSuccess("")} />}
      {aiError && <Alert variant="warning" title="AI suggestion issue" description={aiError} onDismiss={() => setAiError("")} />}
      {aiBudgetWarning && (
        <Alert variant="warning" title="AI Budget Warning" description={aiBudgetWarning} onDismiss={() => setAiBudgetWarning("")} />
      )}

      <Grid cols={1} colsLg={3} gap="6">
        <Stack gap="6" className="lg:col-span-2">
          <Card>
            <Stack gap="2">
              <Stack gap="1">
                <h3 className="heading-lg text-[var(--color-text)]">Import Goals</h3>
                <p className="caption">Upload an Excel file or paste a Google Sheet link to bulk-create goals. Preview before saving.</p>
              </Stack>

                <Stack gap="3">
                  <div className="inline-flex rounded-[var(--radius-sm)] bg-[var(--color-surface-muted)] p-[var(--space-1)]">
                    <Button
                      type="button"
                      size="sm"
                      variant={bulkSourceType === "excel" ? "secondary" : "ghost"}
                      onClick={() => setBulkSourceType("excel")}
                    >
                      Upload Excel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={bulkSourceType === "google_sheet" ? "secondary" : "ghost"}
                      onClick={() => setBulkSourceType("google_sheet")}
                    >
                      Google Sheet Link
                    </Button>
                  </div>

                  {bulkSourceType === "excel" ? (
                    <Input
                      key="employee-bulk-source-excel"
                      type="file"
                      label="Upload Excel (.xlsx, .xls)"
                      accept=".xlsx,.xls"
                      onChange={handleBulkFileUpload}
                    />
                  ) : (
                    <Input
                      key="employee-bulk-source-google-sheet"
                      label="Google Sheet URL"
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      value={bulkGoogleSheetUrl}
                      onChange={(event) => setBulkGoogleSheetUrl(event.target.value)}
                    />
                  )}

                  {bulkSourceType === "google_sheet" && bulkGoogleSheetUrl && !isGoogleSheetUrl(bulkGoogleSheetUrl) && (
                    <p className="caption text-[var(--color-danger,#b91c1c)]">URL must include docs.google.com/spreadsheets.</p>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={handlePreviewBulkImport}
                      loading={bulkLoading}
                      disabled={bulkLoading || bulkSaving || bulkSubmitting}
                    >
                      {bulkSourceType === "google_sheet" && bulkLoading ? "Fetching sheet..." : "Preview Import"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => persistBulkGoals(false)}
                      loading={bulkSaving}
                      disabled={bulkPreviewRows.length === 0 || bulkSubmitting || bulkLoading}
                    >
                      Save Goals
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => persistBulkGoals(true)}
                      loading={bulkSubmitting}
                      disabled={bulkPreviewRows.length === 0 || bulkSaving || bulkLoading}
                    >
                      Submit for Approval
                    </Button>
                  </div>
                  <p className="caption">
                    Excel expected columns: title, description, weight or weightage.
                  </p>
                  {bulkFileName && <p className="caption">Uploaded file: {bulkFileName}</p>}

                  {bulkPreviewRows.length > 0 && (
                    <Stack gap="2">
                      <p className="caption">
                        Preview: {bulkPreviewMeta.valid} valid, {bulkPreviewMeta.invalid} invalid, total {bulkPreviewMeta.total}.
                      </p>
                      <div className="overflow-auto rounded-[var(--radius-sm)] border border-[var(--color-border)]">
                        <table className="min-w-full text-left text-sm">
                          <thead className="bg-[var(--color-surface-muted)]">
                            <tr>
                              <th className="px-[var(--space-3)] py-[var(--space-2)]">Row</th>
                              <th className="px-[var(--space-3)] py-[var(--space-2)]">Title</th>
                              <th className="px-[var(--space-3)] py-[var(--space-2)]">Framework</th>
                              <th className="px-[var(--space-3)] py-[var(--space-2)]">Weightage</th>
                              <th className="px-[var(--space-3)] py-[var(--space-2)]">Status</th>
                              <th className="px-[var(--space-3)] py-[var(--space-2)]">Errors</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bulkPreviewRows.slice(0, 12).map((row) => (
                              <tr key={row.rowNumber} className="border-t border-[var(--color-border)]">
                                <td className="px-[var(--space-3)] py-[var(--space-2)]">{row.rowNumber}</td>
                                <td className="px-[var(--space-3)] py-[var(--space-2)]">{row.normalized?.title || "-"}</td>
                                <td className="px-[var(--space-3)] py-[var(--space-2)]">{row.normalized?.frameworkType || "-"}</td>
                                <td className="px-[var(--space-3)] py-[var(--space-2)]">{row.normalized?.weightage ?? "-"}</td>
                                <td className="px-[var(--space-3)] py-[var(--space-2)]">{row.valid ? "Valid" : "Invalid"}</td>
                                <td className="px-[var(--space-3)] py-[var(--space-2)]">{row.errors?.join("; ") || "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {bulkPreviewRows.length > 12 && <p className="caption">Showing first 12 rows only.</p>}
                    </Stack>
                  )}
                </Stack>
            </Stack>
          </Card>

          <Card title="Your Goal Journey" description="Track each goal through its lifecycle.">
        <Stack gap="2">
          {loading && <p className="caption">Loading goals...</p>}
          {!loading && goals.length === 0 && <p className="caption">No goals yet. Create your first goal.</p>}
          {goals.map((goal) => {
            // Lazily load ratings for closed/approved goals that have a final rating
            if (goal.managerFinalRating != null && !goalRatings[goal.$id]) {
              loadGoalRatings(goal.$id);
            }
            const ratingsData: GoalRatingsResponse | undefined = goalRatings[goal.$id];
            const progressPercent = Math.max(0, Math.min(100, Number(goal.progressPercent) || 0));
            return (
            <Card
              key={goal.$id}
              className={`border-l-4 ${goalLifecycleBorderClass(goal.status)} transition-[box-shadow,transform] duration-200 hover:shadow-[var(--shadow-sm)] hover:-translate-y-px`}
            >
              <Stack gap="3">
              <div className="flex items-start justify-between gap-3">
                <Stack gap="1">
                  <p className="heading-lg text-[var(--color-text)]">{goal.title}</p>
                  <p className="caption text-[var(--color-text-muted)]">{goal.description}</p>
                </Stack>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={goalStatusVariant(goal.status)}>{goal.status}</Badge>
                  {typeof goal.aopAligned === "boolean" && (
                    goal.aopAligned ? (
                      <Tooltip
                        content={`This goal aligns with company objective: ${goal.aopReference || "Alignment identified from AOP context."}`}
                        position="top"
                      >
                        <Badge variant="success">AOP Aligned</Badge>
                      </Tooltip>
                    ) : (
                      <Badge variant="default">Not aligned</Badge>
                    )
                  )}
                </div>
              </div>

              <div className="h-2 w-full overflow-hidden rounded-[var(--radius-sm)] bg-[var(--color-surface-muted)]">
                <div
                  className={`h-full bg-[var(--color-primary)] transition-[width] duration-300 ${progressWidthClass(progressPercent)}`}
                />
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <span className="caption">Framework: {goal.frameworkType}</span>
                <span className="caption">Weightage: {goal.weightage}%</span>
                <span className="caption">Progress: {progressPercent}%</span>
              </div>

              {editingGoalId === goal.$id ? (
                <Stack gap="2">
                  <Input
                    label="Title"
                    value={editForm.title}
                    onChange={(event) =>
                      setEditForm((prev) => ({ ...prev, title: event.target.value }))
                    }
                  />
                  <Textarea
                    label="Description"
                    value={editForm.description}
                    onChange={(event) =>
                      setEditForm((prev) => ({ ...prev, description: event.target.value }))
                    }
                  />
                  <Grid cols={1} colsMd={3} gap="2">
                    <Input
                      label="Cycle ID"
                      value={editForm.cycleId}
                      onChange={(event) =>
                        setEditForm((prev) => ({ ...prev, cycleId: event.target.value }))
                      }
                    />
                    <Dropdown
                      label="Framework"
                      value={editForm.frameworkType}
                      onChange={(frameworkType) =>
                        setEditForm((prev) => ({ ...prev, frameworkType }))
                      }
                      options={frameworkOptions}
                    />
                    <Input
                      label="Weightage"
                      type="number"
                      min={1}
                      max={100}
                      value={editForm.weightage}
                      onChange={(event) =>
                        setEditForm((prev) => ({ ...prev, weightage: event.target.value }))
                      }
                    />
                  </Grid>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleSaveGoalEdit(goal.$id)}
                      loading={submitting}
                    >
                      Save Changes
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingGoalId(null)}
                      disabled={submitting}
                    >
                      Cancel
                    </Button>
                  </div>
                </Stack>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    {(goal.status === "draft" || goal.status === "needs_changes") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => startEditGoal(goal)}
                        disabled={submitting}
                      >
                        Edit
                      </Button>
                    )}
                    {(goal.status === "draft" || goal.status === "needs_changes") && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleSubmitGoal(goal.$id)}
                        disabled={submitting}
                      >
                        Submit for Approval
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setLineageGoalId((prev) => (prev === goal.$id ? null : goal.$id))
                      }
                      disabled={submitting}
                    >
                      {lineageGoalId === goal.$id ? "Hide Lineage" : "Goal Lineage"}
                    </Button>
                  </div>

                  <div className="mt-[var(--space-3)] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-3)] py-[var(--space-2)]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <p className="caption font-medium">Contribution to Business Target</p>
                        <Tooltip
                          content="Shows how your goal connects to your team and company targets"
                          position="top"
                        >
                          <span
                            className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]"
                            aria-label="Contribution section help"
                          >
                            i
                          </span>
                        </Tooltip>
                      </div>

                      {(goal.status === "approved" || goal.status === "closed") && (
                        <ContributionBadge
                          badge={
                            typeof goal.contributionPercent === "number"
                              ? goal.contributionPercent >= 30
                                ? "High"
                                : goal.contributionPercent >= 15
                                  ? "Medium"
                                  : "Low"
                              : "Low"
                          }
                          contributionPercent={typeof goal.contributionPercent === "number" ? goal.contributionPercent : 0}
                          size="sm"
                          showPercent
                        />
                      )}
                    </div>

                    <div className="mt-[var(--space-2)]">
                      {(goal.status === "approved" || goal.status === "closed") ? (
                        <GoalLineageCard goalId={goal.$id} cycleId={goal.cycleId} compact />
                      ) : (
                        <Badge variant="default">Contribution visible after approval</Badge>
                      )}
                    </div>
                  </div>

                  {feedbackByGoal[goal.$id] && (
                    <div className="mt-[var(--space-3)] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-3)] py-[var(--space-2)]">
                      <p className="caption font-medium">Latest manager feedback</p>
                      <p className="caption mt-[var(--space-1)]">{feedbackByGoal[goal.$id]}</p>
                    </div>
                  )}

                  {goal.parentGoalId && (
                    <div className="mt-[var(--space-3)] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-3)] py-[var(--space-2)]">
                      <p className="caption font-medium">Derived from manager goal</p>
                      <p className="caption mt-[var(--space-1)]">Parent goal ID: {goal.parentGoalId}</p>
                      {typeof goal.contributionPercent === "number" && (
                        <p className="caption mt-[var(--space-1)]">Contribution: {goal.contributionPercent}%</p>
                      )}
                    </div>
                  )}

                  {lineageGoalId === goal.$id && (
                    <div className="mt-[var(--space-3)] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-[var(--space-3)] py-[var(--space-3)]">
                      <p className="caption font-medium">Goal Lineage</p>
                      <div className="mt-[var(--space-2)]">
                        <GoalLineageView goalId={goal.$id} embedded mode="chain" />
                      </div>
                    </div>
                  )}

                  {ratingsData && ratingsData.ratings.length > 1 && (
                    <div className="mt-[var(--space-3)] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-3)] py-[var(--space-2)]">
                      <p className="caption font-medium text-[var(--color-text)]">
                        Final Rating: {ratingsData.finalRatingLabel ?? "—"} ({ratingsData.finalRating ?? "—"})
                      </p>
                      <Stack gap="1" className="mt-[var(--space-2)]">
                        {(ratingsData.ratings as GoalRatingItem[]).map((r) => (
                          <div key={r.$id} className="flex items-center justify-between gap-2">
                            <p className="caption text-[var(--color-text-muted)]">
                              {r.managerName || r.managerId}
                            </p>
                            <p className="caption text-[var(--color-text)]">
                              {r.ratingLabel} ({r.rating}) × {r.weightPercent}%
                            </p>
                          </div>
                        ))}
                      </Stack>
                    </div>
                  )}
                </>
              )}
              </Stack>
            </Card>
            );
          })}
        </Stack>
          </Card>
        </Stack>

        <div className="lg:col-span-1">
          <Card title="Queue Snapshot" description="Contextual insights for this cycle.">
            <Stack gap="3">
              <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-[var(--space-3)] py-[var(--space-2)]">
                <p className="caption text-[var(--color-text-muted)]">Total goals</p>
                <p className="heading-lg text-[var(--color-text)]">{loading ? "..." : goals.length}</p>
              </div>

              <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-[var(--space-3)] py-[var(--space-2)]">
                <div className="flex items-center justify-between gap-2">
                  <p className="caption text-[var(--color-text-muted)]">Waiting for manager</p>
                  <p className="body-sm font-medium text-[var(--color-text)]">{loading ? "..." : submittedCount}</p>
                </div>
                <div className="mt-[var(--space-2)] h-2 w-full overflow-hidden rounded-[var(--radius-sm)] bg-[var(--color-surface)]">
                  <div
                    className={`h-full bg-[var(--color-warning,#f59e0b)] transition-[width] duration-300 ${progressWidthClass(loading ? 0 : waitingPercent)}`}
                  />
                </div>
              </div>

              <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-[var(--space-3)] py-[var(--space-2)]">
                <div className="flex items-center justify-between gap-2">
                  <p className="caption text-[var(--color-text-muted)]">Cycle weightage</p>
                  <p className="body-sm font-medium text-[var(--color-text)]">
                    {loading ? "..." : `${cycleWeightage}%`}
                  </p>
                </div>
                <div className="mt-[var(--space-2)] h-2 w-full overflow-hidden rounded-[var(--radius-sm)] bg-[var(--color-surface)]">
                  <div
                    className={`h-full bg-[var(--color-primary)] transition-[width] duration-300 ${progressWidthClass(loading ? 0 : cycleWeightagePercent)}`}
                  />
                </div>
                <p className="caption mt-[var(--space-2)]">Remaining: {loading ? "..." : `${remainingWeightage}%`}</p>
              </div>
            </Stack>
          </Card>
        </div>
      </Grid>

      <ExplainabilityDrawer
        open={explainabilityOpen}
        onClose={() => setExplainabilityOpen(false)}
        payload={aiSuggestion?.explainability || null}
        title="Goal Suggestion Explainability"
      />
      </Stack>
    </Container>
  );
}


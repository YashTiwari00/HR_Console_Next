"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import * as XLSX from "xlsx";
import { Grid, Stack } from "@/src/components/layout";
import {
  BulkGoalAiReviewPanel,
  GoalLineageView,
  type GoalAiDraft,
  PageHeader,
} from "@/src/components/patterns";
import { Alert, Badge, Button, Card, Dropdown, Input, Textarea } from "@/src/components/ui";
import {
  BulkGoalAnalysisItem,
  BulkGoalInput,
  createTeamGoal,
  fetchGoals,
  fetchMe,
  fetchTeamMembers,
  getCycleIdFromDate,
  getBulkGoalAnalysis,
  GoalItem,
  goalStatusVariant,
  TeamMemberItem,
  updateGoal,
} from "@/app/employee/_lib/pmsClient";

type TeamGoalItem = GoalItem & {
  employeeId?: string;
  $createdAt?: string;
};

interface TeamBulkGoalRow {
  employeeId: string;
  title: string;
  description: string;
  weight: number;
}

const frameworkOptions = [
  { value: "OKR", label: "OKR" },
  { value: "MBO", label: "MBO" },
  { value: "HYBRID", label: "HYBRID" },
];

function canEditGoalStatus(status: GoalItem["status"]) {
  return status === "draft" || status === "needs_changes";
}

export default function ManagerTeamGoalsPage() {
  const searchParams = useSearchParams();
  const linkedGoalId = (searchParams.get("goalId") || "").trim();

  const [teamMembers, setTeamMembers] = useState<TeamMemberItem[]>([]);
  const [teamGoals, setTeamGoals] = useState<TeamGoalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [lineageGoalId, setLineageGoalId] = useState("");
  const [bulkCycleId, setBulkCycleId] = useState(getCycleIdFromDate());
  const [bulkFrameworkType, setBulkFrameworkType] = useState("OKR");
  const [bulkDueDate, setBulkDueDate] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkFallbackUsed, setBulkFallbackUsed] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [bulkSourceRows, setBulkSourceRows] = useState<TeamBulkGoalRow[]>([]);
  const [bulkAnalysis, setBulkAnalysis] = useState<BulkGoalAnalysisItem[]>([]);
  const [bulkDrafts, setBulkDrafts] = useState<GoalAiDraft[]>([]);

  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    cycleId: "",
    frameworkType: "OKR",
    weightage: "20",
    dueDate: "",
  });

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [me, members, goals] = await Promise.all([
        fetchMe(),
        fetchTeamMembers(),
        fetchGoals("team"),
      ]);

      const profileId = String(me?.profile?.$id || "").trim();
      setTeamMembers(members);
      setTeamGoals(
        (goals as TeamGoalItem[])
          .filter((goal) => !profileId || goal.managerId === profileId)
          .sort((a, b) => new Date(b.$createdAt || 0).getTime() - new Date(a.$createdAt || 0).getTime())
      );

      const managedGoals = (goals as TeamGoalItem[])
        .filter((goal) => !profileId || goal.managerId === profileId)
        .sort((a, b) => new Date(b.$createdAt || 0).getTime() - new Date(a.$createdAt || 0).getTime());

      setLineageGoalId((prev) => {
        if (linkedGoalId && managedGoals.some((goal) => goal.$id === linkedGoalId)) {
          return linkedGoalId;
        }
        if (prev && managedGoals.some((goal) => goal.$id === prev)) return prev;
        return managedGoals[0]?.$id || "";
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load team goal workspace.");
    } finally {
      setLoading(false);
    }
  }, [linkedGoalId]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const teamMemberById = useMemo(() => {
    const map = new Map<string, TeamMemberItem>();
    teamMembers.forEach((member) => map.set(member.$id, member));
    return map;
  }, [teamMembers]);

  const lineageGoalOptions = useMemo(
    () =>
      teamGoals.map((goal) => {
        const employee = teamMemberById.get(String(goal.employeeId || ""));
        return {
          value: goal.$id,
          label: goal.title || goal.$id,
          description: employee?.name || String(goal.employeeId || ""),
        };
      }),
    [teamGoals, teamMemberById]
  );

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

  function parseTeamGoalRows(rows: Record<string, unknown>[]) {
    return rows
      .map((row) => {
        const employeeId = readCell(row, ["employeeId", "employee_id", "employee", "assignee"]);
        const title = readCell(row, ["title", "goal title", "goal"]);
        const description = readCell(row, ["description", "goal description"]);
        const weightRaw = readCell(row, ["weight", "weightage", "%"]);
        const weight = Number.parseInt(weightRaw || "0", 10);

        return {
          employeeId,
          title,
          description,
          weight: Number.isInteger(weight) && weight > 0 ? weight : 10,
        } as TeamBulkGoalRow;
      })
      .filter((item) => item.employeeId && item.title && item.description);
  }

  async function readTeamRowsFromWorkbook(file: File) {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: "array" });
    const firstSheet = workbook.SheetNames?.[0];
    if (!firstSheet) {
      throw new Error("Workbook has no sheets.");
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet], {
      defval: "",
    });

    return parseTeamGoalRows(rows);
  }

  function buildDrafts(analysis: BulkGoalAnalysisItem[], sourceRows: TeamBulkGoalRow[]) {
    return analysis.map((item, index) => ({
      title: item.improvedTitle || sourceRows[index]?.title || "",
      description: item.improvedDescription || sourceRows[index]?.description || "",
      metrics: item.suggestedMetrics || "",
      weight: sourceRows[index]?.weight || 10,
      allocationSplitText: Array.isArray(item.allocationSuggestions?.[0]?.split)
        ? item.allocationSuggestions[0].split.join("/")
        : "",
    }));
  }

  async function analyzeWorkbookRows(sourceRows: TeamBulkGoalRow[]) {
    if (sourceRows.length === 0) {
      throw new Error("No valid rows found. Required columns: employeeId, title, description, weight or weightage.");
    }

    if (sourceRows.length > 10) {
      throw new Error("Upload contains more than 10 goals. Please reduce rows to 10 or fewer.");
    }

    const allowedEmployeeIds = new Set(teamMembers.map((member) => String(member.$id || "").trim()));
    const invalidEmployeeRow = sourceRows.find((row) => !allowedEmployeeIds.has(String(row.employeeId || "").trim()));
    if (invalidEmployeeRow) {
      throw new Error(`employeeId ${invalidEmployeeRow.employeeId} is not part of your team scope.`);
    }

    const inputGoals: BulkGoalInput[] = sourceRows.map((row) => ({
      title: row.title,
      description: row.description,
      weight: row.weight,
    }));

    const analysis = await getBulkGoalAnalysis({
      goals: inputGoals,
      role: "manager",
      cycleId: bulkCycleId,
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
    setBulkLoading(true);

    try {
      const sourceRows = await readTeamRowsFromWorkbook(file);
      setBulkSourceRows(sourceRows);
      await analyzeWorkbookRows(sourceRows);
      setSuccess("Bulk team goals analyzed with AI.");
    } catch (err) {
      setBulkAnalysis([]);
      setBulkDrafts([]);
      setBulkFallbackUsed(false);
      setBulkError(err instanceof Error ? err.message : "Failed to process team upload.");
    } finally {
      setBulkLoading(false);
      event.target.value = "";
    }
  }

  function handleBulkDraftChange(index: number, draft: GoalAiDraft) {
    setBulkDrafts((prev) => prev.map((item, itemIndex) => (itemIndex === index ? draft : item)));
  }

  function handleApplyBulkSuggestion(index: number) {
    if (!bulkDrafts[index]) return;
    setSuccess(`Applied suggestion from row ${index + 1}.`);
  }

  function handleApplyAllBulkSuggestions() {
    if (bulkDrafts.length === 0) return;
    setSuccess("Applied all AI suggestions for team assignment.");
  }

  async function handleSaveBulkGoals() {
    if (bulkDrafts.length === 0 || bulkSourceRows.length === 0) return;

    setBulkSaving(true);
    setBulkError("");
    setSuccess("");

    try {
      let createdCount = 0;
      const failures: string[] = [];

      for (let index = 0; index < bulkDrafts.length; index += 1) {
        const draft = bulkDrafts[index];
        const source = bulkSourceRows[index];
        if (!source) continue;

        try {
          await createTeamGoal({
            employeeId: source.employeeId,
            title: draft.title,
            description: `${draft.description}${draft.metrics ? `\n\nMetric: ${draft.metrics}` : ""}`,
            cycleId: bulkCycleId,
            frameworkType: bulkFrameworkType,
            weightage: draft.weight,
            dueDate: bulkDueDate || null,
            aiSuggested: true,
          });
          createdCount += 1;
        } catch (err) {
          const reason = err instanceof Error ? err.message : "unknown error";
          failures.push(`Row ${index + 1} (${source.employeeId}): ${reason}`);
        }
      }

      if (failures.length > 0) {
        setBulkError(`Created ${createdCount} goal(s). Failures: ${failures.slice(0, 4).join(" | ")}`);
      } else {
        setSuccess(`Created ${createdCount} team draft goal(s) from bulk upload.`);
      }

      await loadPage();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Failed to save team bulk goals.");
    } finally {
      setBulkSaving(false);
    }
  }

  function startEdit(goal: TeamGoalItem) {
    setEditingGoalId(goal.$id);
    setEditForm({
      title: goal.title,
      description: goal.description,
      cycleId: goal.cycleId,
      frameworkType: goal.frameworkType,
      weightage: String(goal.weightage),
      dueDate: "",
    });
  }

  async function handleSaveEdit(goal: TeamGoalItem) {
    setSavingEdit(true);
    setError("");
    setSuccess("");

    try {
      await updateGoal(goal.$id, {
        title: editForm.title,
        description: editForm.description,
        cycleId: editForm.cycleId,
        frameworkType: editForm.frameworkType,
        managerId: goal.managerId,
        weightage: Number.parseInt(editForm.weightage, 10),
        dueDate: editForm.dueDate || null,
      });

      setSuccess("Team goal updated.");
      setEditingGoalId(null);
      await loadPage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update team goal.");
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <Stack gap="4">
      <PageHeader
        title="Team Goal Assignment"
        subtitle="Create goals for employees assigned to you and refine drafts before submission."
        actions={
          <Button variant="secondary" onClick={loadPage} disabled={loading || savingEdit}>
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="error" title="Action failed" description={error} onDismiss={() => setError("")} />}
      {success && (
        <Alert variant="success" title="Saved" description={success} onDismiss={() => setSuccess("")} />
      )}

      <Grid cols={1} colsLg={2} gap="3">
        <Card title="Bulk Team Goal Assignment" description="Upload an Excel file and assign team goals in bulk with AI review.">
          <Stack gap="3">
            <Input
              type="file"
              label="Upload Excel (.xlsx, .xls)"
              accept=".xlsx,.xls"
              onChange={handleBulkFileUpload}
            />
            <Grid cols={1} colsMd={3} gap="2">
              <Input
                label="Cycle ID"
                value={bulkCycleId}
                onChange={(event) => setBulkCycleId(event.target.value)}
              />
              <Dropdown
                label="Framework"
                value={bulkFrameworkType}
                options={frameworkOptions}
                onChange={(frameworkType) => setBulkFrameworkType(frameworkType)}
              />
              <Input
                label="Due Date"
                type="date"
                value={bulkDueDate}
                onChange={(event) => setBulkDueDate(event.target.value)}
              />
            </Grid>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => analyzeWorkbookRows(bulkSourceRows)}
                loading={bulkLoading}
                disabled={bulkSourceRows.length === 0}
              >
                Re-run AI Analysis
              </Button>
              <Button
                type="button"
                onClick={handleSaveBulkGoals}
                loading={bulkSaving}
                disabled={bulkDrafts.length === 0}
              >
                Save Team Goals
              </Button>
            </div>

            <p className="caption">
              Required columns in first sheet: employeeId, title, description, weight or weightage. Max 10 rows per upload.
            </p>
            {bulkFileName && <p className="caption">Uploaded file: {bulkFileName}</p>}

            <BulkGoalAiReviewPanel
              role="manager"
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

        <Card title="Team Goal Summary" description="Quick view of assignments managed by you.">
          <Stack gap="2">
            <p className="body-sm text-[var(--color-text)]">Assigned employees: {loading ? "..." : teamMembers.length}</p>
            <p className="body-sm text-[var(--color-text)]">Goals you manage: {loading ? "..." : teamGoals.length}</p>
            <p className="body-sm text-[var(--color-text)]">
              Draft / needs changes: {loading ? "..." : teamGoals.filter((goal) => canEditGoalStatus(goal.status)).length}
            </p>
            <p className="caption">Only goals in draft or needs_changes can be edited from this page.</p>
          </Stack>
        </Card>
      </Grid>

      <Card title="Managed Team Goals" description="Edit only draft or needs_changes goals.">
        <Stack gap="3">
          {loading && <p className="caption">Loading team goals...</p>}
          {!loading && teamGoals.length === 0 && <p className="caption">No team goals found yet.</p>}

          {teamGoals.map((goal) => {
            const employee = teamMemberById.get(String(goal.employeeId || ""));
            const editable = canEditGoalStatus(goal.status);
            const isEditing = editingGoalId === goal.$id;

            return (
              <div
                key={goal.$id}
                className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="body-sm font-medium text-[var(--color-text)]">{goal.title}</p>
                    <p className="caption mt-1">Employee: {employee?.name || goal.employeeId}</p>
                  </div>
                  <Badge variant={goalStatusVariant(goal.status)}>{goal.status}</Badge>
                </div>

                {!isEditing && (
                  <>
                    <p className="caption mt-2">{goal.description}</p>
                    <div className="mt-2 flex flex-wrap gap-3">
                      <span className="caption">Cycle: {goal.cycleId}</span>
                      <span className="caption">Framework: {goal.frameworkType}</span>
                      <span className="caption">Weightage: {goal.weightage}%</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => startEdit(goal)}
                        disabled={!editable || Boolean(editingGoalId)}
                      >
                        Edit Goal
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setLineageGoalId(goal.$id)}
                      >
                        View Lineage
                      </Button>
                      {!editable && <p className="caption self-center">Locked after submission.</p>}
                    </div>
                  </>
                )}

                {isEditing && (
                  <div className="mt-3 space-y-3">
                    <Input
                      label="Goal Title"
                      value={editForm.title}
                      onChange={(event) => setEditForm((prev) => ({ ...prev, title: event.target.value }))}
                      required
                    />
                    <Textarea
                      label="Description"
                      value={editForm.description}
                      onChange={(event) => setEditForm((prev) => ({ ...prev, description: event.target.value }))}
                      required
                    />
                    <Grid cols={1} colsMd={3} gap="2">
                      <Input
                        label="Cycle ID"
                        value={editForm.cycleId}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, cycleId: event.target.value }))}
                        required
                      />
                      <Dropdown
                        label="Framework"
                        value={editForm.frameworkType}
                        options={frameworkOptions}
                        onChange={(frameworkType) =>
                          setEditForm((prev) => ({ ...prev, frameworkType }))
                        }
                      />
                      <Input
                        label="Weightage"
                        type="number"
                        min={1}
                        max={100}
                        value={editForm.weightage}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, weightage: event.target.value }))}
                        required
                      />
                    </Grid>
                    <Input
                      label="Due Date"
                      type="date"
                      value={editForm.dueDate}
                      onChange={(event) => setEditForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" loading={savingEdit} onClick={() => handleSaveEdit(goal)}>
                        Save Changes
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setEditingGoalId(null)}
                        disabled={savingEdit}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </Stack>
      </Card>

      <Card
        title="Goal Lineage"
        description="Review parent chain and child goals for any managed goal."
      >
        <Stack gap="3">
          <Dropdown
            label="Goal"
            value={lineageGoalId}
            options={lineageGoalOptions}
            onChange={(value) => setLineageGoalId(value)}
            placeholder={loading ? "Loading goals..." : "Select a goal"}
            disabled={loading || lineageGoalOptions.length === 0}
          />

          {!loading && !lineageGoalId && (
            <p className="caption">Create or load goals to view lineage.</p>
          )}

          {lineageGoalId && <GoalLineageView goalId={lineageGoalId} />}
        </Stack>
      </Card>
    </Stack>
  );
}

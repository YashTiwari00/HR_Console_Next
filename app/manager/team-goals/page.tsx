"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import * as XLSX from "xlsx";
import { Grid, Stack } from "@/src/components/layout";
import {
  GoalLineageCard,
  GoalLineageView,
  PageHeader,
} from "@/src/components/patterns";
import { Alert, Badge, Button, Card, Dropdown, Input, Textarea, Tooltip } from "@/src/components/ui";
import {
  commitBulkGoalsImport,
  type BulkGoalImportPreviewRow,
  type BulkGoalImportRowInput,
  fetchGoalCycles,
  fetchGoals,
  fetchMe,
  fetchTeamMembers,
  getCycleIdFromDate,
  GoalItem,
  goalStatusVariant,
  previewGoalsImport,
  previewBulkGoalsImport,
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

type BulkImportSource = "excel" | "google_sheet";

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
  const [bulkCycleOptions, setBulkCycleOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [bulkSourceType, setBulkSourceType] = useState<BulkImportSource>("excel");
  const [bulkGoogleSheetUrl, setBulkGoogleSheetUrl] = useState("");
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [bulkPreviewRows, setBulkPreviewRows] = useState<BulkGoalImportPreviewRow[]>([]);
  const [bulkCommitRows, setBulkCommitRows] = useState<BulkGoalImportRowInput[]>([]);
  const [bulkPreviewMeta, setBulkPreviewMeta] = useState({ total: 0, valid: 0, invalid: 0 });
  const [currentUserId, setCurrentUserId] = useState("");

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
      setCurrentUserId(profileId);
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

  useEffect(() => {
    let active = true;

    async function loadCycleOptions() {
      try {
        const response = await fetchGoalCycles();
        if (!active) return;

        const options = (response.data || [])
          .map((item) => String(item?.name || "").trim())
          .filter(Boolean)
          .map((name) => ({ value: name, label: name }));

        if (options.length > 0) {
          setBulkCycleOptions(options);
          setBulkCycleId((prev) => {
            if (options.some((option) => option.value === prev)) return prev;
            return options[0].value;
          });
        }
      } catch {
        if (!active) return;
        setBulkCycleOptions([]);
      }
    }

    loadCycleOptions();

    return () => {
      active = false;
    };
  }, []);

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

  async function handlePreviewBulkGoals() {
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
                cycleId: bulkCycleId,
                defaults: {
                  frameworkType: bulkFrameworkType,
                  weightage: 10,
                  dueDate: bulkDueDate || undefined,
                  managerId: currentUserId || undefined,
                  manualAssign: true,
                },
              });
            })()
          : await (async () => {
              if (!bulkFile) {
                throw new Error("Upload an Excel file before preview.");
              }

              const sourceRows = await readTeamRowsFromWorkbook(bulkFile);
              if (sourceRows.length === 0) {
                throw new Error("No valid rows found. Required columns: employeeId, title, description, weight or weightage.");
              }

              const allowedEmployeeIds = new Set(teamMembers.map((member) => String(member.$id || "").trim()));
              const invalidEmployeeRow = sourceRows.find(
                (row) => row.employeeId && !allowedEmployeeIds.has(String(row.employeeId || "").trim())
              );
              if (invalidEmployeeRow) {
                throw new Error(`employeeId ${invalidEmployeeRow.employeeId} is not part of your team scope.`);
              }

              const rows: BulkGoalImportRowInput[] = sourceRows.map((row) => ({
                employeeId: row.employeeId,
                title: row.title,
                description: row.description,
                frameworkType: bulkFrameworkType,
                weightage: row.weight,
                cycleId: bulkCycleId,
                dueDate: bulkDueDate || null,
                lineageRef: "",
                aiSuggested: true,
                managerId: currentUserId || "",
              }));

              return previewBulkGoalsImport({
                rows,
                cycleId: bulkCycleId,
                defaults: {
                  frameworkType: bulkFrameworkType,
                  weightage: 10,
                  dueDate: bulkDueDate || undefined,
                  managerId: currentUserId || undefined,
                  manualAssign: true,
                },
              });
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
      setBulkError(err instanceof Error ? err.message : "Failed to preview team bulk goals.");
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleSaveBulkGoals() {
    if (bulkCommitRows.length === 0) {
      setBulkError("Run preview before saving.");
      return;
    }

    setBulkSaving(true);
    setBulkError("");
    setSuccess("");

    try {
      const rowsWithAssignedEmployees = bulkCommitRows.map((row) => ({
        ...row,
        employeeId: String(row?.employeeId || "").trim(),
      }));

      const missingAssignee = rowsWithAssignedEmployees.find((row) => !row.employeeId);
      if (missingAssignee) {
        throw new Error("Assign an employee for each row in preview before saving.");
      }

      const idempotencyKey =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const result = await commitBulkGoalsImport({
        data: rowsWithAssignedEmployees,
        cycleId: bulkCycleId,
        idempotencyKey,
        templateVersion: "v1",
        sourceType: bulkSourceType,
        sourceUrl: bulkSourceType === "google_sheet" ? String(bulkGoogleSheetUrl || "").trim() : undefined,
        defaults: {
          frameworkType: bulkFrameworkType,
          weightage: 10,
          dueDate: bulkDueDate || undefined,
          managerId: currentUserId || undefined,
          manualAssign: true,
        },
      });

      const successRows = Number(result?.summary?.successRows || 0);
      const failedRows = Number(result?.summary?.failedRows || 0);
      setSuccess(`Saved ${successRows} team goal(s). Failed: ${failedRows}.`);

      await loadPage();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Failed to save team bulk goals.");
    } finally {
      setBulkSaving(false);
    }
  }

  function handleAssignEmployee(rowNumber: number, employeeId: string) {
    const safeEmployeeId = String(employeeId || "").trim();

    setBulkPreviewRows((prev) =>
      prev.map((row) =>
        row.rowNumber === rowNumber
          ? {
              ...row,
              normalized: {
                ...row.normalized,
                employeeId: safeEmployeeId,
              },
            }
          : row
      )
    );

    setBulkCommitRows((prev) =>
      prev.map((row, index) =>
        index + 1 === rowNumber
          ? {
              ...row,
              employeeId: safeEmployeeId,
            }
          : row
      )
    );
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
        <Card title="Bulk Team Goal Assignment" description="Upload Excel or use a Google Sheet link, preview, then save in bulk.">
          <Stack gap="3">
            <div className="flex flex-wrap items-center gap-2">
              <a href="/api/goals/import/template" className="caption text-[var(--color-primary)] hover:underline">
                Download template
              </a>
              <span className="caption">Fill this format to speed up team goal uploads.</span>
            </div>
            <div className="inline-flex rounded-[var(--radius-sm)] border border-[var(--color-border)] p-1">
              <Button
                type="button"
                size="sm"
                variant={bulkSourceType === "excel" ? undefined : "secondary"}
                onClick={() => setBulkSourceType("excel")}
              >
                Upload Excel
              </Button>
              <Button
                type="button"
                size="sm"
                variant={bulkSourceType === "google_sheet" ? undefined : "secondary"}
                onClick={() => setBulkSourceType("google_sheet")}
              >
                Google Sheet Link
              </Button>
            </div>

            {bulkSourceType === "excel" ? (
              <Input
                key="bulk-source-excel"
                type="file"
                label="Upload Excel (.xlsx, .xls)"
                accept=".xlsx,.xls"
                onChange={handleBulkFileUpload}
              />
            ) : (
              <Input
                key="bulk-source-google-sheet"
                label="Google Sheet URL"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={bulkGoogleSheetUrl}
                onChange={(event) => setBulkGoogleSheetUrl(event.target.value)}
              />
            )}

            {bulkSourceType === "google_sheet" && bulkGoogleSheetUrl && !isGoogleSheetUrl(bulkGoogleSheetUrl) && (
              <p className="caption text-[var(--color-danger,#b91c1c)]">URL must include docs.google.com/spreadsheets.</p>
            )}

            <Grid cols={1} colsMd={3} gap="2">
              <Dropdown
                label="Cycle ID"
                value={bulkCycleId}
                options={bulkCycleOptions.length > 0 ? bulkCycleOptions : [{ value: bulkCycleId, label: bulkCycleId }]}
                onChange={(value) => setBulkCycleId(value)}
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
                onClick={handlePreviewBulkGoals}
                loading={bulkLoading}
                disabled={bulkLoading || bulkSaving}
              >
                {bulkSourceType === "google_sheet" && bulkLoading ? "Fetching sheet..." : "Preview Import"}
              </Button>
              <Button
                type="button"
                onClick={handleSaveBulkGoals}
                loading={bulkSaving}
                disabled={bulkPreviewRows.length === 0 || bulkLoading || bulkSaving}
              >
                Save Team Goals
              </Button>
            </div>

            <p className="caption">
              Excel expected columns: title, description, weight or weightage. Employee ID is optional and can be assigned in preview.
            </p>
            {bulkFileName && <p className="caption">Uploaded file: {bulkFileName}</p>}

            {bulkPreviewRows.length > 0 && (
              <div className="space-y-2">
                <p className="caption">
                  Preview: {bulkPreviewMeta.valid} valid, {bulkPreviewMeta.invalid} invalid, total {bulkPreviewMeta.total}.
                </p>
                <div className="overflow-auto rounded-[var(--radius-sm)] border border-[var(--color-border)]">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-[var(--color-surface-muted)]">
                      <tr>
                        <th className="px-3 py-2">Row</th>
                        <th className="px-3 py-2">Employee</th>
                        <th className="px-3 py-2">Title</th>
                        <th className="px-3 py-2">Weightage</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Errors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkPreviewRows.slice(0, 12).map((row) => (
                        <tr key={row.rowNumber} className="border-t border-[var(--color-border)]">
                          <td className="px-3 py-2">{row.rowNumber}</td>
                          <td className="px-3 py-2">
                            <Dropdown
                              options={teamMembers.map((member) => ({
                                value: String(member.$id || ""),
                                label: member.name || String(member.$id || ""),
                                description: String(member.$id || ""),
                              }))}
                              value={String(row.normalized?.employeeId || "")}
                              onChange={(value) => handleAssignEmployee(row.rowNumber, value)}
                              placeholder="Select employee"
                            />
                          </td>
                          <td className="px-3 py-2">{row.normalized?.title || "-"}</td>
                          <td className="px-3 py-2">{row.normalized?.weightage ?? "-"}</td>
                          <td className="px-3 py-2">{row.valid ? "Valid" : "Invalid"}</td>
                          <td className="px-3 py-2">{row.errors?.join("; ") || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {bulkPreviewRows.length > 12 && <p className="caption">Showing first 12 rows only.</p>}
              </div>
            )}
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
                        onClick={() =>
                          setLineageGoalId((prev) => (prev === goal.$id ? "" : goal.$id))
                        }
                      >
                        {lineageGoalId === goal.$id ? "Hide Team Contribution" : "View Team Contribution"}
                      </Button>
                      {!editable && <p className="caption self-center">Locked after submission.</p>}
                    </div>

                    {lineageGoalId === goal.$id && (
                      <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3">
                        <p className="caption font-medium">Team Contribution</p>
                        <p className="caption mt-1 text-[var(--color-text-muted)]">
                          How {goal.employeeId === currentUserId ? "your" : `${employee?.name || "this employee"}'s`} goal connects to business targets
                        </p>
                        <div className="mt-2">
                          <GoalLineageCard goalId={goal.$id} cycleId={goal.cycleId} compact={false} />
                        </div>
                      </div>
                    )}
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

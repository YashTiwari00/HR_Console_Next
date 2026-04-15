"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Card } from "@/src/components/ui";
import { buildCsv, dateStamp, downloadCsvFile } from "@/src/lib/csvExport";
import {
  fetchTeamMembers,
  fetchHrManagers,
  fetchDualReportingAssignments,
  setManagerAssignments,
  clearManagerAssignments,
  TeamMemberItem,
  HrManagerSummary,
  ManagerAssignment,
  AssignmentInput,
} from "@/app/employee/_lib/pmsClient";

interface DraftAssignment {
  managerId: string;
  weightPercent: number;
  notes: string;
}

const EMPTY_DRAFT: DraftAssignment = { managerId: "", weightPercent: 100, notes: "" };

export default function HrTeamAssignmentsPage() {
  const [employees, setEmployees] = useState<TeamMemberItem[]>([]);
  const [managers, setManagers] = useState<HrManagerSummary[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [currentAssignments, setCurrentAssignments] = useState<ManagerAssignment[]>([]);
  const [drafts, setDrafts] = useState<DraftAssignment[]>([{ ...EMPTY_DRAFT }]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const loadBase = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [empResult, mgrResult] = await Promise.all([
        fetchTeamMembers(undefined, { includeManagers: false }),
        fetchHrManagers(),
      ]);
      setEmployees(empResult);
      setManagers(mgrResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBase(); }, [loadBase]);

  async function handleSelectEmployee(empId: string) {
    setSelectedEmployeeId(empId);
    setCurrentAssignments([]);
    setDrafts([{ ...EMPTY_DRAFT }]);
    setSuccessMsg("");
    setError("");
    if (!empId) return;

    try {
      const assignments = await fetchDualReportingAssignments(empId);
      setCurrentAssignments(assignments);
      if (assignments.length > 0) {
        setDrafts(
          assignments.map((a) => ({
            managerId: a.managerId,
            weightPercent: a.weightPercent,
            notes: a.notes || "",
          }))
        );
      } else {
        setDrafts([{ ...EMPTY_DRAFT }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load assignments.");
    }
  }

  function addRow() {
    setDrafts((prev) => [...prev, { ...EMPTY_DRAFT, weightPercent: 0 }]);
  }

  function removeRow(index: number) {
    setDrafts((prev) => prev.filter((_, i) => i !== index));
  }

  function updateDraft(index: number, field: keyof DraftAssignment, value: string | number) {
    setDrafts((prev) =>
      prev.map((d, i) => (i === index ? { ...d, [field]: value } : d))
    );
  }

  const totalWeight = useMemo(
    () => drafts.reduce((sum, d) => sum + Number(d.weightPercent || 0), 0),
    [drafts]
  );

  const weightError = totalWeight !== 100 ? `Weights sum to ${totalWeight}% — must be exactly 100%.` : "";

  async function handleSave() {
    if (weightError) { setError(weightError); return; }
    if (!selectedEmployeeId) return;

    for (const d of drafts) {
      if (!d.managerId) { setError("All rows must have a manager selected."); return; }
    }

    setSaving(true);
    setError("");
    setSuccessMsg("");
    try {
      const assignments: AssignmentInput[] = drafts.map((d) => ({
        managerId: d.managerId,
        weightPercent: Number(d.weightPercent),
        notes: d.notes || undefined,
      }));
      const saved = await setManagerAssignments(selectedEmployeeId, assignments);
      setCurrentAssignments(saved as unknown as ManagerAssignment[]);
      // Re-fetch enriched assignments to get names
      const refreshed = await fetchDualReportingAssignments(selectedEmployeeId);
      setCurrentAssignments(refreshed);
      setSuccessMsg("Assignments saved successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save assignments.");
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    if (!selectedEmployeeId) return;
    setClearing(true);
    setError("");
    setSuccessMsg("");
    try {
      await clearManagerAssignments(selectedEmployeeId);
      setCurrentAssignments([]);
      setDrafts([{ ...EMPTY_DRAFT }]);
      setSuccessMsg("Assignments cleared. Employee reverts to single-manager mode.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear assignments.");
    } finally {
      setClearing(false);
    }
  }

  const selectedEmployee = employees.find((e) => e.$id === selectedEmployeeId);
  const dualReportingRows = useMemo(
    () => employees.filter((employee) => employee.managerId),
    [employees]
  );

  function handleExportDualReportingCsv() {
    const csv = buildCsv(dualReportingRows, [
      { key: "employeeName", header: "Employee Name", value: (row) => row.name || "" },
      { key: "employeeEmail", header: "Employee Email", value: (row) => row.email || "" },
      { key: "employeeId", header: "Employee ID", value: (row) => row.$id },
      { key: "department", header: "Department", value: (row) => row.department || "" },
      { key: "primaryManagerId", header: "Primary Manager ID", value: (row) => row.managerId || "" },
    ]);
    downloadCsvFile(csv, `hr-dual-reporting-${dateStamp()}.csv`);
  }

  return (
    <Stack gap="4">
      <PageHeader
        title="Dual Reporting Assignments"
        subtitle="Assign one or two managers to an employee with weighted responsibility. Weights must sum to 100%."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" onClick={handleExportDualReportingCsv} disabled={loading || dualReportingRows.length === 0}>
              Download CSV: Assignments
            </Button>
            <Button variant="secondary" onClick={loadBase} disabled={loading}>
              Refresh
            </Button>
          </div>
        }
      />

      {error && <Alert variant="error" title="Error" description={error} onDismiss={() => setError("")} />}
      {successMsg && <Alert variant="success" title="Saved" description={successMsg} onDismiss={() => setSuccessMsg("")} />}

      <Card title="Select Employee">
        <div className="flex flex-wrap items-center gap-3">
          <label className="caption text-[var(--color-text-muted)]" htmlFor="employee-select">
            Employee
          </label>
          <select
            id="employee-select"
            className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 body-sm text-[var(--color-text)] min-w-[260px]"
            value={selectedEmployeeId}
            onChange={(e) => handleSelectEmployee(e.target.value)}
            disabled={loading}
          >
            <option value="">— select an employee —</option>
            {employees.map((emp) => (
              <option key={emp.$id} value={emp.$id}>
                {emp.name || emp.email || emp.$id}
                {emp.department ? ` · ${emp.department}` : ""}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {selectedEmployee && (
        <>
          <Card
            title={`Current assignments for ${selectedEmployee.name || selectedEmployee.email}`}
            description={currentAssignments.length === 0 ? "No dual-reporting assignments yet — using legacy single managerId." : undefined}
          >
            {currentAssignments.length > 0 && (
              <div className="space-y-2">
                {currentAssignments.map((a) => (
                  <div
                    key={a.assignmentId}
                    className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2"
                  >
                    <div>
                      <p className="body-sm font-medium text-[var(--color-text)]">
                        {a.managerName || a.managerId}
                      </p>
                      <p className="caption text-[var(--color-text-muted)]">{a.managerEmail}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={a.isPrimary ? "success" : "info"}>
                        {a.weightPercent}%{a.isPrimary ? " · primary" : ""}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card
            title="Edit Assignments"
            description="Add rows for each manager. Weights must total exactly 100%."
          >
            <Stack gap="3">
              <div className="space-y-2">
                {drafts.map((draft, index) => (
                  <div key={index} className="grid grid-cols-[1fr_100px_1fr_auto] items-center gap-2">
                    <select
                      className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-2 body-sm text-[var(--color-text)]"
                      value={draft.managerId}
                      onChange={(e) => updateDraft(index, "managerId", e.target.value)}
                    >
                      <option value="">— manager —</option>
                      {managers.map((m) => (
                        <option key={m.managerId} value={m.managerId}>
                          {m.managerName || m.managerEmail || m.managerId}
                        </option>
                      ))}
                    </select>

                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        max={100}
                        className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-2 body-sm text-[var(--color-text)]"
                        value={draft.weightPercent}
                        onChange={(e) => updateDraft(index, "weightPercent", Number(e.target.value))}
                      />
                      <span className="caption text-[var(--color-text-muted)]">%</span>
                    </div>

                    <input
                      type="text"
                      placeholder="Notes (optional)"
                      className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-2 body-sm text-[var(--color-text)]"
                      value={draft.notes}
                      onChange={(e) => updateDraft(index, "notes", e.target.value)}
                    />

                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      onClick={() => removeRow(index)}
                      disabled={drafts.length === 1}
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Button type="button" variant="secondary" size="sm" onClick={addRow} disabled={drafts.length >= 5}>
                    + Add manager
                  </Button>
                  <span className={`caption ${weightError ? "text-[var(--color-danger)]" : "text-[var(--color-text-muted)]"}`}>
                    Total: {totalWeight}% {weightError ? "⚠" : "✓"}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={handleClear}
                    loading={clearing}
                    disabled={saving || currentAssignments.length === 0}
                  >
                    Clear all
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={handleSave}
                    loading={saving}
                    disabled={clearing || !!weightError}
                  >
                    Save assignments
                  </Button>
                </div>
              </div>
            </Stack>
          </Card>
        </>
      )}

      <Card title="All employees with dual reporting" description="Employees that currently have more than one manager assignment.">
        {loading && <p className="caption">Loading...</p>}
        {!loading && (
          <div className="space-y-2">
            {dualReportingRows
              .slice(0, 5)
              .map((e) => (
                <div
                  key={e.$id}
                  className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2"
                >
                  <div>
                    <p className="body-sm font-medium text-[var(--color-text)]">{e.name || e.email}</p>
                    <p className="caption text-[var(--color-text-muted)]">{e.department || "No department"}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => handleSelectEmployee(e.$id)}
                  >
                    Manage
                  </Button>
                </div>
              ))}
            {employees.length === 0 && <p className="caption">No employees found.</p>}
          </div>
        )}
      </Card>
    </Stack>
  );
}

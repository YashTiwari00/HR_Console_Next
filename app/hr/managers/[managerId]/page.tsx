"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Grid, Stack } from "@/src/components/layout";
import { DataTable, PageHeader } from "@/src/components/patterns";
import type { DataTableColumn } from "@/src/components/patterns";
import { Alert, Badge, Button, Card } from "@/src/components/ui";
import { buildCsv, dateStamp, downloadCsvFile } from "@/src/lib/csvExport";
import {
  checkInStatusVariant,
  fetchHrManagerDetail,
  formatDate,
  GoalItem,
  goalStatusVariant,
  HrManagerDetail,
} from "@/app/employee/_lib/pmsClient";

interface TeamEmployeeRow extends Record<string, unknown> {
  employeeId: string;
  name: string;
  email: string;
  goals: number;
  avgProgress: number;
  plannedCheckIns: number;
  completedCheckIns: number;
}

function averageProgress(goals: GoalItem[]) {
  if (goals.length === 0) return 0;
  const total = goals.reduce((sum, goal) => sum + (goal.progressPercent || 0), 0);
  return Math.round(total / goals.length);
}

export default function HrManagerDetailPage() {
  const params = useParams<{ managerId: string }>();
  const managerId = String(params?.managerId || "").trim();

  const [detail, setDetail] = useState<HrManagerDetail | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDetail = useCallback(async () => {
    if (!managerId) return;

    setLoading(true);
    setError("");

    try {
      const nextDetail = await fetchHrManagerDetail(managerId);
      setDetail(nextDetail);

      if (nextDetail.employees.length > 0) {
        setSelectedEmployeeId((prev) => {
          if (prev && nextDetail.employees.some((item) => item.employee.$id === prev)) {
            return prev;
          }

          return nextDetail.employees[0].employee.$id;
        });
      } else {
        setSelectedEmployeeId("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load manager details.");
    } finally {
      setLoading(false);
    }
  }, [managerId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const rows = useMemo<TeamEmployeeRow[]>(() => {
    if (!detail) return [];

    return detail.employees.map((item) => ({
      employeeId: item.employee.$id,
      name: item.employee.name || "Unnamed",
      email: item.employee.email || "",
      goals: item.goals.length,
      avgProgress: averageProgress(item.goals),
      plannedCheckIns: item.checkIns.filter((checkIn) => checkIn.status === "planned").length,
      completedCheckIns: item.checkIns.filter((checkIn) => checkIn.status === "completed").length,
    }));
  }, [detail]);

  const selectedEmployee = useMemo(() => {
    if (!detail || !selectedEmployeeId) return null;
    return detail.employees.find((item) => item.employee.$id === selectedEmployeeId) || null;
  }, [detail, selectedEmployeeId]);

  const columns = useMemo<DataTableColumn<TeamEmployeeRow>[]>(
    () => [
      {
        key: "name",
        header: "Employee",
        render: (_value: unknown, row: TeamEmployeeRow) => (
          <div>
            <p className="body-sm font-medium text-[var(--color-text)]">{row.name}</p>
            <p className="caption">{row.email}</p>
          </div>
        ),
      },
      { key: "goals", header: "Goals", align: "center" },
      {
        key: "avgProgress",
        header: "Avg Progress",
        align: "center",
        render: (_value: unknown, row: TeamEmployeeRow) => <span>{row.avgProgress}%</span>,
      },
      { key: "plannedCheckIns", header: "Planned", align: "center" },
      { key: "completedCheckIns", header: "Completed", align: "center" },
      {
        key: "employeeId",
        header: "Action",
        align: "right",
        render: (_value: unknown, row: TeamEmployeeRow) => (
          <Button
            type="button"
            size="sm"
            variant={row.employeeId === selectedEmployeeId ? "primary" : "secondary"}
            onClick={() => setSelectedEmployeeId(row.employeeId)}
          >
            {row.employeeId === selectedEmployeeId ? "Selected" : "View"}
          </Button>
        ),
      },
    ],
    [selectedEmployeeId]
  );

  function handleExportFullTeamCsv() {
    const csv = buildCsv(rows, [
      { key: "employeeId", header: "Employee ID", value: (row) => row.employeeId },
      { key: "name", header: "Name", value: (row) => row.name },
      { key: "email", header: "Email", value: (row) => row.email },
      { key: "goals", header: "Goals", value: (row) => row.goals },
      { key: "avgProgress", header: "Average Progress", value: (row) => row.avgProgress },
      { key: "plannedCheckIns", header: "Planned Check-ins", value: (row) => row.plannedCheckIns },
      { key: "completedCheckIns", header: "Completed Check-ins", value: (row) => row.completedCheckIns },
    ]);
    downloadCsvFile(csv, `hr-manager-${managerId || "unknown"}-team-${dateStamp()}.csv`);
  }

  function handleExportSelectedGoalsCsv() {
    const goals = selectedEmployee?.goals || [];
    const csv = buildCsv(goals, [
      { key: "goalId", header: "Goal ID", value: (row) => row.$id },
      { key: "title", header: "Title", value: (row) => row.title },
      { key: "description", header: "Description", value: (row) => row.description },
      { key: "cycleId", header: "Cycle", value: (row) => row.cycleId },
      { key: "status", header: "Status", value: (row) => row.status },
      { key: "weightage", header: "Weightage", value: (row) => row.weightage },
      { key: "progressPercent", header: "Progress Percent", value: (row) => row.progressPercent ?? 0 },
    ]);
    downloadCsvFile(csv, `hr-manager-${managerId || "unknown"}-selected-goals-${dateStamp()}.csv`);
  }

  function handleExportSelectedCheckInsCsv() {
    const checkIns = selectedEmployee?.checkIns || [];
    const csv = buildCsv(checkIns, [
      { key: "checkInId", header: "Check-in ID", value: (row) => row.$id },
      { key: "goalId", header: "Goal ID", value: (row) => row.goalId },
      { key: "employeeId", header: "Employee ID", value: (row) => row.employeeId },
      { key: "managerId", header: "Manager ID", value: (row) => row.managerId },
      { key: "status", header: "Status", value: (row) => row.status },
      { key: "scheduledAt", header: "Scheduled At", value: (row) => row.scheduledAt },
      { key: "completedAt", header: "Completed At", value: (row) => row.completedAt || "" },
      { key: "isFinal", header: "Final Check-in", value: (row) => row.isFinalCheckIn ? "yes" : "no" },
      { key: "managerRating", header: "Manager Rating", value: (row) => row.managerRating ?? "" },
      { key: "managerNotes", header: "Manager Notes", value: (row) => row.managerNotes || "" },
    ]);
    downloadCsvFile(csv, `hr-manager-${managerId || "unknown"}-selected-checkins-${dateStamp()}.csv`);
  }

  return (
    <Stack gap="4">
      <PageHeader
        title={detail ? `Manager Detail: ${detail.manager.name || "Manager"}` : "Manager Detail"}
        subtitle="Drill into team members, their goal progress, and manager-led check-in records."
        actions={
          <Button variant="secondary" onClick={loadDetail} disabled={loading}>
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="error" title="Unable to load" description={error} onDismiss={() => setError("")} />}

      <Grid cols={1} colsMd={4} gap="3">
        <Card title="Team Members">
          <p className="heading-xl">{loading ? "..." : detail?.summary.teamSize ?? 0}</p>
        </Card>
        <Card title="Team Goals">
          <p className="heading-xl">{loading ? "..." : detail?.summary.teamGoals ?? 0}</p>
        </Card>
        <Card title="Avg Team Progress">
          <p className="heading-xl">{loading ? "..." : `${detail?.summary.teamAverageProgress ?? 0}%`}</p>
        </Card>
        <Card title="Pending HR Check-ins">
          <p className="heading-xl">{loading ? "..." : detail?.summary.pendingCheckInApprovals ?? 0}</p>
        </Card>
      </Grid>

      <Card title="Full Team" description="All employees assigned to this manager including fallback mapping from existing goals.">
        <div className="mb-3 flex justify-end">
          <Button variant="secondary" size="sm" onClick={handleExportFullTeamCsv} disabled={loading || rows.length === 0}>
            Download CSV: Full Team
          </Button>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          loading={loading}
          rowKey={(row) => row.employeeId}
          emptyMessage="No employees are mapped to this manager yet."
        />
      </Card>

      <Grid cols={1} colsLg={2} gap="3">
        <Card title="Selected Employee Goals" description="Current goals with status and progress.">
          <Stack gap="2">
            <div className="flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExportSelectedGoalsCsv}
                disabled={loading || !selectedEmployee || selectedEmployee.goals.length === 0}
              >
                Download CSV: Goals
              </Button>
            </div>
            {!loading && !selectedEmployee && <p className="caption">Select an employee to view details.</p>}
            {selectedEmployee?.goals.map((goal) => (
              <div key={goal.$id} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="body-sm text-[var(--color-text)]">{goal.title}</p>
                  <Badge variant={goalStatusVariant(goal.status)}>{goal.status}</Badge>
                </div>
                <p className="caption mt-1">Progress: {goal.progressPercent || 0}%</p>
              </div>
            ))}
          </Stack>
        </Card>

        <Card title="Selected Employee Check-ins" description="Manager-led check-ins with status and cadence.">
          <Stack gap="2">
            <div className="flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExportSelectedCheckInsCsv}
                disabled={loading || !selectedEmployee || selectedEmployee.checkIns.length === 0}
              >
                Download CSV: Check-ins
              </Button>
            </div>
            {!loading && !selectedEmployee && <p className="caption">Select an employee to view details.</p>}
            {selectedEmployee?.checkIns.map((checkIn) => (
              <div key={checkIn.$id} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="body-sm text-[var(--color-text)]">{formatDate(checkIn.scheduledAt)}</p>
                  <Badge variant={checkInStatusVariant(checkIn.status)}>{checkIn.status}</Badge>
                </div>
                {checkIn.managerNotes && <p className="caption mt-1">Notes: {checkIn.managerNotes}</p>}
              </div>
            ))}
          </Stack>
        </Card>
      </Grid>
    </Stack>
  );
}

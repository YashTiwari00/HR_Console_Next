"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Grid, Stack } from "@/src/components/layout";
import { DataTable, PageHeader } from "@/src/components/patterns";
import type { DataTableColumn } from "@/src/components/patterns";
import { Alert, Badge, Button, Card } from "@/src/components/ui";
import {
  fetchGoals,
  fetchHrManagers,
  fetchProgressUpdates,
  fetchTeamMembers,
  GoalItem,
  HrManagerSummary,
  ProgressUpdateItem,
  TeamMemberItem,
} from "@/app/employee/_lib/pmsClient";

interface HrManagerRow extends Record<string, unknown> {
  managerId: string;
  managerName: string;
  managerEmail: string;
  teamSize: number;
  teamGoals: number;
  teamAverageProgress: number;
  pendingManagerGoalApprovals: number;
  pendingCheckInApprovals: number;
}

type OrgGoalItem = GoalItem & { employeeId?: string };
type HeatMapState = "on_track" | "behind" | "completed" | "no_update";
type HeatMapFilter = "all" | HeatMapState;

export default function HrDashboardPage() {
  const [rows, setRows] = useState<HrManagerSummary[]>([]);
  const [selectedManagerId, setSelectedManagerId] = useState("");
  const [orgGoals, setOrgGoals] = useState<OrgGoalItem[]>([]);
  const [orgUpdates, setOrgUpdates] = useState<ProgressUpdateItem[]>([]);
  const [orgMembers, setOrgMembers] = useState<TeamMemberItem[]>([]);
  const [ragFilter, setRagFilter] = useState<HeatMapFilter>("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [nextRows, nextGoals, nextUpdates, nextMembers] = await Promise.all([
        fetchHrManagers(),
        fetchGoals("all"),
        fetchProgressUpdates(undefined, "all"),
        fetchTeamMembers(undefined, { includeManagers: true }),
      ]);

      setRows(nextRows);
      setOrgGoals(nextGoals as OrgGoalItem[]);
      setOrgUpdates(nextUpdates);
      setOrgMembers(nextMembers);

      if (nextRows.length > 0) {
        setSelectedManagerId((prev) => {
          if (prev && nextRows.some((item) => item.managerId === prev)) {
            return prev;
          }

          return nextRows[0].managerId;
        });
      } else {
        setSelectedManagerId("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load HR dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const managerRows = useMemo<HrManagerRow[]>(
    () =>
      rows.map((item) => ({
        managerId: item.managerId,
        managerName: item.managerName,
        managerEmail: item.managerEmail,
        teamSize: item.teamSize,
        teamGoals: item.teamGoals,
        teamAverageProgress: item.teamAverageProgress,
        pendingManagerGoalApprovals: item.pendingManagerGoalApprovals,
        pendingCheckInApprovals: item.pendingCheckInApprovals,
      })),
    [rows]
  );

  const selectedManager = useMemo(
    () => rows.find((item) => item.managerId === selectedManagerId) || null,
    [rows, selectedManagerId]
  );

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, item) => {
          acc.managers += 1;
          acc.pendingGoalApprovals += item.pendingManagerGoalApprovals;
          acc.pendingCheckInApprovals += item.pendingCheckInApprovals;
          acc.teamGoals += item.teamGoals;
          return acc;
        },
        { managers: 0, pendingGoalApprovals: 0, pendingCheckInApprovals: 0, teamGoals: 0 }
      ),
    [rows]
  );

  const columns = useMemo<DataTableColumn<HrManagerRow>[]>(
    () => [
      {
        key: "managerName",
        header: "Manager",
        render: (_value: unknown, row: HrManagerRow) => (
          <div>
            <p className="body-sm font-medium text-[var(--color-text)]">{row.managerName}</p>
            <p className="caption">{row.managerEmail}</p>
          </div>
        ),
      },
      {
        key: "teamSize",
        header: "Team",
        align: "center",
      },
      {
        key: "teamAverageProgress",
        header: "Team Progress",
        align: "center",
        render: (_value: unknown, row: HrManagerRow) => <span>{row.teamAverageProgress}%</span>,
      },
      {
        key: "pendingManagerGoalApprovals",
        header: "Goals Pending",
        align: "center",
        render: (_value: unknown, row: HrManagerRow) => (
          <Badge variant={row.pendingManagerGoalApprovals > 0 ? "warning" : "success"}>
            {row.pendingManagerGoalApprovals}
          </Badge>
        ),
      },
      {
        key: "pendingCheckInApprovals",
        header: "Check-ins Pending",
        align: "center",
        render: (_value: unknown, row: HrManagerRow) => (
          <Badge variant={row.pendingCheckInApprovals > 0 ? "warning" : "success"}>
            {row.pendingCheckInApprovals}
          </Badge>
        ),
      },
      {
        key: "managerId",
        header: "Action",
        align: "right",
        render: (_value: unknown, row: HrManagerRow) => (
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant={row.managerId === selectedManagerId ? "primary" : "secondary"}
              onClick={() => setSelectedManagerId(row.managerId)}
            >
              {row.managerId === selectedManagerId ? "Expanded" : "Expand"}
            </Button>
            <Link
              href={`/hr/managers/${encodeURIComponent(row.managerId)}`}
              className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 body-sm font-medium text-[var(--color-text)] transition-colors duration-150 hover:bg-[var(--color-surface-muted)]"
            >
              Open
            </Link>
          </div>
        ),
      },
    ],
    [selectedManagerId]
  );

  const latestUpdateByGoalId = useMemo(() => {
    const map = new Map<string, ProgressUpdateItem>();

    orgUpdates.forEach((update) => {
      const current = map.get(update.goalId);
      if (!current || new Date(update.createdAt).getTime() > new Date(current.createdAt).getTime()) {
        map.set(update.goalId, update);
      }
    });

    return map;
  }, [orgUpdates]);

  const memberInfoById = useMemo(() => {
    const map = new Map<string, TeamMemberItem>();
    orgMembers.forEach((member) => map.set(member.$id, member));
    return map;
  }, [orgMembers]);

  const heatMapRows = useMemo(() => {
    const activeGoals = orgGoals.filter((goal) => goal.status !== "closed");
    const goalsForHeatMap = activeGoals.length > 0 ? activeGoals : orgGoals;

    const grouped = new Map<string, OrgGoalItem[]>();
    goalsForHeatMap.forEach((goal) => {
      const employeeKey = goal.employeeId || "unassigned";
      const list = grouped.get(employeeKey) || [];
      list.push(goal);
      grouped.set(employeeKey, list);
    });

    return Array.from(grouped.entries())
      .map(([employeeId, goals]) => {
        const employee = employeeId === "unassigned" ? undefined : memberInfoById.get(employeeId);
        return {
          employeeId,
          employeeName: employee?.name || (employeeId === "unassigned" ? "Unassigned" : employeeId),
          department: employee?.department || "Unassigned",
          role: employee?.role || "employee",
          goals: goals
            .slice()
            .sort((a, b) => a.title.localeCompare(b.title))
            .map((goal) => {
              const latest = latestUpdateByGoalId.get(goal.$id);
              const ragState: HeatMapState = latest?.ragStatus || "no_update";
              return {
                goalId: goal.$id,
                goalTitle: goal.title,
                progressPercent: goal.progressPercent || 0,
                ragState,
              };
            }),
        };
      })
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [latestUpdateByGoalId, memberInfoById, orgGoals]);

  const departmentOptions = useMemo(() => {
    const values = new Set<string>();
    heatMapRows.forEach((row) => {
      if (row.department && row.department !== "Unassigned") {
        values.add(row.department);
      }
    });
    return ["all", ...Array.from(values).sort((a, b) => a.localeCompare(b))];
  }, [heatMapRows]);

  const filteredHeatMapRows = useMemo(() => {
    return heatMapRows
      .filter((row) => (departmentFilter === "all" ? true : row.department === departmentFilter))
      .map((row) => {
        const goals = row.goals.filter((goal) => (ragFilter === "all" ? true : goal.ragState === ragFilter));
        return { ...row, goals };
      })
      .filter((row) => row.goals.length > 0);
  }, [departmentFilter, heatMapRows, ragFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<HeatMapState, number> = {
      on_track: 0,
      behind: 0,
      completed: 0,
      no_update: 0,
    };

    heatMapRows
      .filter((row) => (departmentFilter === "all" ? true : row.department === departmentFilter))
      .forEach((row) => {
        row.goals.forEach((goal) => {
          counts[goal.ragState] += 1;
        });
      });

    return counts;
  }, [departmentFilter, heatMapRows]);

  const heatMapCellClassByState: Record<HeatMapState, string> = {
    on_track: "bg-[var(--color-badge-success-bg)] border-[var(--color-badge-success-border)]",
    behind: "bg-[var(--color-badge-warning-bg)] border-[var(--color-badge-warning-border)]",
    completed: "bg-[var(--color-badge-info-bg)] border-[var(--color-badge-info-border)]",
    no_update: "bg-[var(--color-surface-muted)] border-[var(--color-border)]",
  };

  function formatRagLabel(state: HeatMapState) {
    if (state === "no_update") return "No update";
    return state.replace("_", " ");
  }

  function downloadOrgReport() {
    const memberById = new Map<string, TeamMemberItem>();
    orgMembers.forEach((m) => memberById.set(m.$id, m));

    // Sheet 1: Managers summary
    const managerRows = rows.map((m) => ({
      "Manager Name": m.managerName || "",
      "Manager Email": m.managerEmail || "",
      "Team Size": m.teamSize ?? 0,
      "Team Goals": m.teamGoals ?? 0,
      "Team Avg Progress %": m.teamAverageProgress ?? 0,
      "Pending Goal Approvals": m.pendingManagerGoalApprovals ?? 0,
      "Pending Check-in Approvals": m.pendingCheckInApprovals ?? 0,
      "Team Members": m.teamMembers.map((tm) => tm.name || tm.email || tm.$id).join(", "),
    }));

    // Sheet 2: All employees with their manager
    const employeeRows = orgMembers
      .filter((m) => m.role === "employee")
      .map((m) => {
        const manager = m.managerId ? memberById.get(m.managerId) : undefined;
        return {
          "Employee Name": m.name || "",
          "Employee Email": m.email || "",
          "Department": m.department || "",
          "Region": m.region || "",
          "Manager Name": manager?.name || m.managerId || "",
          "Manager Email": manager?.email || "",
        };
      });

    // Sheet 3: Goals with employee and manager info
    const goalRows = orgGoals.map((goal) => {
      const employee = goal.employeeId ? memberById.get(goal.employeeId) : undefined;
      const manager = employee?.managerId ? memberById.get(employee.managerId) : undefined;
      const latest = latestUpdateByGoalId.get(goal.$id);
      return {
        "Employee Name": employee?.name || goal.employeeId || "",
        "Employee Email": employee?.email || "",
        "Department": employee?.department || "",
        "Manager Name": manager?.name || employee?.managerId || "",
        "Manager Email": manager?.email || "",
        "Goal Title": goal.title || "",
        "Description": goal.description || "",
        "Status": goal.status || "",
        "Progress %": goal.progressPercent ?? 0,
        "Framework": goal.frameworkType || "",
        "Weightage": goal.weightage ?? "",
        "RAG Status": latest?.ragStatus?.replace("_", " ") || "no update",
        "Last Update": latest?.updateText || "",
        "Last Updated At": latest?.createdAt ? new Date(latest.createdAt).toLocaleString() : "",
      };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(managerRows.length ? managerRows : [{}]), "Managers");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(employeeRows.length ? employeeRows : [{}]), "Employees");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(goalRows.length ? goalRows : [{}]), "Goals");

    XLSX.writeFile(wb, `org-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <Stack gap="4">
      <PageHeader
        title="HR Dashboard"
        subtitle="Supervise organization-wide progress and manager cadence across all departments."
        actions={
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button variant="secondary" onClick={downloadOrgReport} disabled={loading}>
              Download Report
            </Button>
            <Button variant="secondary" onClick={loadDashboard} disabled={loading}>
              Refresh
            </Button>
          </div>
        }
      />

      {error && <Alert variant="error" title="Unable to load" description={error} onDismiss={() => setError("")} />}

      <Card
        title="Policy Management"
        description="Cycle auto-approval and related policy controls are now in the dedicated HR Settings page."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/hr/settings"
            className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 body-sm font-medium text-[var(--color-text)] transition-colors duration-150 hover:bg-[var(--color-surface-muted)]"
          >
            Open HR Settings
          </Link>
          <Badge variant="info">Auto-Approval Policies</Badge>
        </div>
      </Card>

      <Grid cols={1} colsMd={4} gap="3">
        <Card title="Managers Tracked" className="bg-[linear-gradient(160deg,var(--color-surface)_0%,var(--color-surface-muted)_100%)]">
          <p className="heading-xl">{loading ? "..." : totals.managers}</p>
        </Card>
        <Card title="Team Goals" className="bg-[linear-gradient(160deg,var(--color-surface)_0%,var(--color-surface-muted)_100%)]">
          <p className="heading-xl">{loading ? "..." : totals.teamGoals}</p>
        </Card>
        <Card title="Goals Pending" className="bg-[linear-gradient(160deg,var(--color-surface)_0%,var(--color-surface-muted)_100%)]">
          <p className="heading-xl">{loading ? "..." : totals.pendingGoalApprovals}</p>
        </Card>
        <Card title="Check-ins Pending" className="bg-[linear-gradient(160deg,var(--color-surface)_0%,var(--color-surface-muted)_100%)]">
          <p className="heading-xl">{loading ? "..." : totals.pendingCheckInApprovals}</p>
        </Card>
      </Grid>

      <Card title="Managers Overview" description="Expand a manager for quick team preview or open full drill-down.">
        <DataTable
          columns={columns}
          rows={managerRows}
          loading={loading}
          rowKey={(row) => row.managerId}
          emptyMessage="No managers available yet."
        />
      </Card>

      <Card title="Organization Progress Heat Map" description="Latest RAG state by employee and goal across all departments (including managers).">
        <Stack gap="3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setRagFilter("all")}
              className={
                ragFilter === "all"
                  ? "rounded-[var(--radius-sm)] border border-transparent bg-[var(--color-primary)] px-2 py-1 caption text-[var(--color-button-text)]"
                  : "rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 caption text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
              }
            >
              All ({statusCounts.on_track + statusCounts.behind + statusCounts.completed + statusCounts.no_update})
            </button>
            <button
              type="button"
              onClick={() => setRagFilter("behind")}
              className={
                ragFilter === "behind"
                  ? "rounded-[var(--radius-sm)] border border-[var(--color-badge-warning-border)] bg-[var(--color-badge-warning-bg)] px-2 py-1 caption text-[var(--color-text)]"
                  : "rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 caption text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
              }
            >
              Behind ({statusCounts.behind})
            </button>
            <button
              type="button"
              onClick={() => setRagFilter("on_track")}
              className={
                ragFilter === "on_track"
                  ? "rounded-[var(--radius-sm)] border border-[var(--color-badge-success-border)] bg-[var(--color-badge-success-bg)] px-2 py-1 caption text-[var(--color-text)]"
                  : "rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 caption text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
              }
            >
              On Track ({statusCounts.on_track})
            </button>
            <button
              type="button"
              onClick={() => setRagFilter("completed")}
              className={
                ragFilter === "completed"
                  ? "rounded-[var(--radius-sm)] border border-[var(--color-badge-info-border)] bg-[var(--color-badge-info-bg)] px-2 py-1 caption text-[var(--color-text)]"
                  : "rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 caption text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
              }
            >
              Completed ({statusCounts.completed})
            </button>
            <button
              type="button"
              onClick={() => setRagFilter("no_update")}
              className={
                ragFilter === "no_update"
                  ? "rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2 py-1 caption text-[var(--color-text-muted)]"
                  : "rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 caption text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
              }
            >
              No Update ({statusCounts.no_update})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="caption text-[var(--color-text-muted)]" htmlFor="hr-heatmap-rag-filter">
              Status
            </label>
            <select
              id="hr-heatmap-rag-filter"
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 body-sm text-[var(--color-text)]"
              value={ragFilter}
              onChange={(event) => setRagFilter(event.target.value as HeatMapFilter)}
            >
              <option value="all">All</option>
              <option value="on_track">On Track</option>
              <option value="behind">Behind</option>
              <option value="completed">Completed</option>
              <option value="no_update">No Update</option>
            </select>

            <label className="caption text-[var(--color-text-muted)]" htmlFor="hr-heatmap-department-filter">
              Department
            </label>
            <select
              id="hr-heatmap-department-filter"
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 body-sm text-[var(--color-text)]"
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
            >
              {departmentOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? "All Departments" : option}
                </option>
              ))}
            </select>
          </div>

          {!loading && heatMapRows.length === 0 && <p className="caption">No goals available yet for heat map view.</p>}

          {!loading && heatMapRows.length > 0 && filteredHeatMapRows.length === 0 && (
            <p className="caption">No goals match the selected filters.</p>
          )}

          {filteredHeatMapRows.length > 0 && (
            <div className="heatmap-scroll max-h-[26rem] overflow-auto pr-1">
              <div className="min-w-[680px] space-y-2">
                {filteredHeatMapRows.map((row) => (
                  <div
                    key={row.employeeId}
                    className="grid grid-cols-[240px_minmax(0,1fr)] items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] p-2"
                  >
                    <div>
                      <p className="body-sm font-medium text-[var(--color-text)]">{row.employeeName}</p>
                      <p className="caption text-[var(--color-text-muted)]">{row.department} • {row.role}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {row.goals.map((goal) => (
                        <div
                          key={goal.goalId}
                          title={`${goal.goalTitle} - ${formatRagLabel(goal.ragState)} - ${goal.progressPercent}%`}
                          className={`min-w-[132px] rounded-[var(--radius-sm)] border px-2 py-2 ${heatMapCellClassByState[goal.ragState]}`}
                        >
                          <p className="caption line-clamp-2 text-[var(--color-text)]">{goal.goalTitle}</p>
                          <p className="caption mt-1 capitalize text-[var(--color-text-muted)]">
                            {formatRagLabel(goal.ragState)} • {goal.progressPercent}%
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Stack>
      </Card>

      <Card title="Expanded Manager Snapshot" description="Quick preview of team members and supervision indicators.">
        <Stack gap="2">
          {!loading && !selectedManager && <p className="caption">Select a manager row to preview their team.</p>}

          {selectedManager && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="info">Manager: {selectedManager.managerName}</Badge>
                <Badge variant="default">Team: {selectedManager.teamSize}</Badge>
                <Badge variant="warning">Pending Goals: {selectedManager.pendingManagerGoalApprovals}</Badge>
                <Badge variant="warning">Pending Check-ins: {selectedManager.pendingCheckInApprovals}</Badge>
              </div>

              {selectedManager.teamMembers.length === 0 ? (
                <p className="caption">No team members mapped yet.</p>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  {selectedManager.teamMembers.map((member) => (
                    <div
                      key={member.$id}
                      className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2"
                    >
                      <p className="body-sm text-[var(--color-text)]">{member.name || member.email || member.$id}</p>
                      <p className="caption">{member.email || "No email"}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}

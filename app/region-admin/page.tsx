"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Grid, Stack } from "@/src/components/layout";
import { DataTable, PageHeader } from "@/src/components/patterns";
import type { DataTableColumn } from "@/src/components/patterns";
import { Alert, Badge, Button, Card } from "@/src/components/ui";
import {
  GoalItem,
  HrManagerSummary,
  ProgressUpdateItem,
  TeamMemberItem,
  fetchRegionAdminOverview,
} from "@/app/employee/_lib/pmsClient";

interface RegionManagerRow extends Record<string, unknown> {
  managerId: string;
  managerName: string;
  managerEmail: string;
  teamSize: number;
  teamGoals: number;
  teamAverageProgress: number;
  plannedCheckIns: number;
  completedCheckIns: number;
}

type OrgGoalItem = GoalItem & { employeeId?: string };
type HeatMapState = "on_track" | "behind" | "completed" | "no_update";
type HeatMapFilter = "all" | HeatMapState;

export default function RegionAdminDashboardPage() {
  const [region, setRegion] = useState("");
  const [rows, setRows] = useState<HrManagerSummary[]>([]);
  const [orgGoals, setOrgGoals] = useState<OrgGoalItem[]>([]);
  const [orgUpdates, setOrgUpdates] = useState<ProgressUpdateItem[]>([]);
  const [orgMembers, setOrgMembers] = useState<TeamMemberItem[]>([]);
  const [selectedManagerId, setSelectedManagerId] = useState("all");
  const [ragFilter, setRagFilter] = useState<HeatMapFilter>("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [cycleFilter, setCycleFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const overview = await fetchRegionAdminOverview();

      setRegion(overview.region || "Unassigned");
      setRows(overview.managers || []);
      setOrgGoals((overview.goals || []) as OrgGoalItem[]);
      setOrgUpdates(overview.progressUpdates || []);
      setOrgMembers(overview.members || []);

      setSelectedManagerId((prev) => {
        if (prev === "all") return "all";
        if ((overview.managers || []).some((item) => item.managerId === prev)) {
          return prev;
        }
        return "all";
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load region dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const managerRows = useMemo<RegionManagerRow[]>(
    () =>
      rows.map((item) => ({
        managerId: item.managerId,
        managerName: item.managerName,
        managerEmail: item.managerEmail,
        teamSize: item.teamSize,
        teamGoals: item.teamGoals,
        teamAverageProgress: item.teamAverageProgress,
        plannedCheckIns: item.plannedCheckIns,
        completedCheckIns: item.completedCheckIns,
      })),
    [rows]
  );

  const columns = useMemo<DataTableColumn<RegionManagerRow>[]>(
    () => [
      {
        key: "managerName",
        header: "Manager",
        render: (_value: unknown, row: RegionManagerRow) => (
          <div>
            <p className="body-sm font-medium text-[var(--color-text)]">{row.managerName}</p>
            <p className="caption">{row.managerEmail}</p>
          </div>
        ),
      },
      { key: "teamSize", header: "Team", align: "center" },
      { key: "teamGoals", header: "Goals", align: "center" },
      {
        key: "teamAverageProgress",
        header: "Avg Progress",
        align: "center",
        render: (_value: unknown, row: RegionManagerRow) => <span>{row.teamAverageProgress}%</span>,
      },
      { key: "plannedCheckIns", header: "Planned", align: "center" },
      { key: "completedCheckIns", header: "Completed", align: "center" },
    ],
    []
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

  const managerOptions = useMemo(() => {
    return [
      { value: "all", label: "All Managers" },
      ...rows.map((item) => ({ value: item.managerId, label: item.managerName })),
    ];
  }, [rows]);

  const cycleOptions = useMemo(() => {
    const cycles = Array.from(new Set(orgGoals.map((goal) => String(goal.cycleId || "").trim()).filter(Boolean)));
    return ["all", ...cycles.sort((a, b) => b.localeCompare(a))];
  }, [orgGoals]);

  const goalsAfterManagerCycle = useMemo(() => {
    return orgGoals.filter((goal) => {
      const managerMatch = selectedManagerId === "all" || String(goal.managerId || "").trim() === selectedManagerId;
      const cycleMatch = cycleFilter === "all" || String(goal.cycleId || "").trim() === cycleFilter;
      return managerMatch && cycleMatch;
    });
  }, [cycleFilter, orgGoals, selectedManagerId]);

  const heatMapRows = useMemo(() => {
    const activeGoals = goalsAfterManagerCycle.filter((goal) => goal.status !== "closed");
    const goalsForHeatMap = activeGoals.length > 0 ? activeGoals : goalsAfterManagerCycle;

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
  }, [goalsAfterManagerCycle, latestUpdateByGoalId, memberInfoById]);

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

  const totals = useMemo(() => {
    const allEmployees = orgMembers.filter((item) => item.role === "employee").length;
    const behindGoals = heatMapRows.reduce(
      (sum, row) => sum + row.goals.filter((goal) => goal.ragState === "behind").length,
      0
    );

    return {
      managers: rows.length,
      employees: allEmployees,
      goals: goalsAfterManagerCycle.length,
      behindGoals,
    };
  }, [goalsAfterManagerCycle.length, heatMapRows, orgMembers, rows.length]);

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

  return (
    <Stack gap="4">
      <PageHeader
        title="Region Dashboard"
        subtitle={`Track employees and managers in ${region || "your region"} with region-scoped, read-only analytics.`}
        actions={
          <Button variant="secondary" onClick={loadDashboard} disabled={loading}>
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="error" title="Unable to load" description={error} onDismiss={() => setError("")} />}

      <Grid cols={1} colsMd={4} gap="3">
        <Card title="Managers" className="bg-[linear-gradient(160deg,var(--color-surface)_0%,var(--color-surface-muted)_100%)]">
          <p className="heading-xl">{loading ? "..." : totals.managers}</p>
        </Card>
        <Card title="Employees" className="bg-[linear-gradient(160deg,var(--color-surface)_0%,var(--color-surface-muted)_100%)]">
          <p className="heading-xl">{loading ? "..." : totals.employees}</p>
        </Card>
        <Card title="Goals" className="bg-[linear-gradient(160deg,var(--color-surface)_0%,var(--color-surface-muted)_100%)]">
          <p className="heading-xl">{loading ? "..." : totals.goals}</p>
        </Card>
        <Card title="Behind Goals" className="bg-[linear-gradient(160deg,var(--color-surface)_0%,var(--color-surface-muted)_100%)]">
          <p className="heading-xl">{loading ? "..." : totals.behindGoals}</p>
        </Card>
      </Grid>

      <Card title="Manager Performance Overview" description="Regional manager team health with goal and check-in signals.">
        <DataTable
          columns={columns}
          rows={managerRows}
          loading={loading}
          rowKey={(row) => row.managerId}
          emptyMessage="No managers found for this region."
        />
      </Card>

      <Card title="Regional Progress Heat Map" description="Latest RAG state by employee and goal for your region.">
        <Stack gap="3">
          <div className="grid gap-2 md:grid-cols-4">
            <div>
              <label className="caption text-[var(--color-text-muted)]" htmlFor="region-manager-filter">
                Manager
              </label>
              <select
                id="region-manager-filter"
                className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 body-sm text-[var(--color-text)]"
                value={selectedManagerId}
                onChange={(event) => setSelectedManagerId(event.target.value)}
              >
                {managerOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="caption text-[var(--color-text-muted)]" htmlFor="region-cycle-filter">
                Cycle
              </label>
              <select
                id="region-cycle-filter"
                className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 body-sm text-[var(--color-text)]"
                value={cycleFilter}
                onChange={(event) => setCycleFilter(event.target.value)}
              >
                {cycleOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === "all" ? "All Cycles" : option}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="caption text-[var(--color-text-muted)]" htmlFor="region-status-filter">
                Status
              </label>
              <select
                id="region-status-filter"
                className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 body-sm text-[var(--color-text)]"
                value={ragFilter}
                onChange={(event) => setRagFilter(event.target.value as HeatMapFilter)}
              >
                <option value="all">All</option>
                <option value="on_track">On Track</option>
                <option value="behind">Behind</option>
                <option value="completed">Completed</option>
                <option value="no_update">No Update</option>
              </select>
            </div>

            <div>
              <label className="caption text-[var(--color-text-muted)]" htmlFor="region-department-filter">
                Department
              </label>
              <select
                id="region-department-filter"
                className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 body-sm text-[var(--color-text)]"
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
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="success">On Track: {statusCounts.on_track}</Badge>
            <Badge variant="warning">Behind: {statusCounts.behind}</Badge>
            <Badge variant="info">Completed: {statusCounts.completed}</Badge>
            <Badge variant="default">No Update: {statusCounts.no_update}</Badge>
          </div>

          {!loading && filteredHeatMapRows.length === 0 && (
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
    </Stack>
  );
}

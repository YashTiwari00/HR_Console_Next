"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { Grid, Stack } from "@/src/components/layout";
import { ExplainabilityDrawer, GoalLineageView, PageHeader, RatingDropWarningSection } from "@/src/components/patterns";
import { Alert, Badge, Button, Card } from "@/src/components/ui";
import {
  CheckInItem,
  DecisionInsightsData,
  fetchCheckIns,
  fetchDecisionInsights,
  fetchGoals,
  fetchProgressUpdates,
  fetchRatingDropInsights,
  fetchTeamMembers,
  formatDate,
  GoalItem,
  goalStatusVariant,
  ProgressUpdateItem,
  RatingDropInsightItem,
  TeamMemberItem,
} from "@/app/employee/_lib/pmsClient";

type TeamGoalItem = GoalItem & { employeeId?: string };
type HeatMapState = "on_track" | "behind" | "completed" | "no_update";
type HeatMapFilter = "all" | HeatMapState;

export default function ManagerPage() {
  const [teamGoals, setTeamGoals] = useState<TeamGoalItem[]>([]);
  const [teamCheckIns, setTeamCheckIns] = useState<CheckInItem[]>([]);
  const [teamUpdates, setTeamUpdates] = useState<ProgressUpdateItem[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMemberItem[]>([]);
  const [ratingDropInsights, setRatingDropInsights] = useState<RatingDropInsightItem[]>([]);
  const [ragFilter, setRagFilter] = useState<HeatMapFilter>("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [lineageGoalId, setLineageGoalId] = useState("");
  const [decisionInsights, setDecisionInsights] = useState<DecisionInsightsData | null>(null);
  const [decisionTargetLabel, setDecisionTargetLabel] = useState("");
  const [insightsExplainabilityOpen, setInsightsExplainabilityOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function riskBadgeVariant(level: DecisionInsightsData["overallRiskLevel"]) {
    if (level === "high") return "danger" as const;
    if (level === "medium") return "warning" as const;
    return "success" as const;
  }

  function pickInsightTarget(goals: TeamGoalItem[]) {
    const candidates = goals
      .filter((goal) => String(goal.employeeId || "").trim() && String(goal.cycleId || "").trim())
      .slice()
      .sort((a, b) => {
        const byContribution = (Number(b.contributionPercent) || 0) - (Number(a.contributionPercent) || 0);
        if (byContribution !== 0) return byContribution;
        return (Number(b.weightage) || 0) - (Number(a.weightage) || 0);
      });

    const first = candidates[0] || null;
    if (!first) return null;

    return {
      employeeId: String(first.employeeId || "").trim(),
      cycleId: String(first.cycleId || "").trim(),
      goalTitle: String(first.title || "").trim(),
    };
  }

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [nextTeamGoals, nextTeamCheckIns, nextTeamUpdates, nextTeamMembers, nextRatingDrops] = await Promise.all([
        fetchGoals("team"),
        fetchCheckIns("team"),
        fetchProgressUpdates(undefined, "team"),
        fetchTeamMembers(),
        fetchRatingDropInsights({ limit: 100 }),
      ]);

      setTeamGoals(nextTeamGoals as TeamGoalItem[]);
      setTeamCheckIns(nextTeamCheckIns);
      setTeamUpdates(nextTeamUpdates);
      setTeamMembers(nextTeamMembers);
      setRatingDropInsights(nextRatingDrops.rows || []);

      const target = pickInsightTarget(nextTeamGoals as TeamGoalItem[]);
      if (target?.employeeId && target?.cycleId) {
        const nextInsights = await fetchDecisionInsights({
          employeeId: target.employeeId,
          cycleId: target.cycleId,
        });
        setDecisionInsights(nextInsights);
        setDecisionTargetLabel(target.goalTitle || target.employeeId);
      } else {
        setDecisionInsights(null);
        setDecisionTargetLabel("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load manager dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const teamAvgProgress = useMemo(() => {
    if (teamGoals.length === 0) return 0;
    const total = teamGoals.reduce((sum, goal) => sum + (goal.progressPercent || 0), 0);
    return Math.round(total / teamGoals.length);
  }, [teamGoals]);

  const pendingGoalApprovals = useMemo(
    () => teamGoals.filter((goal) => goal.status === "submitted").length,
    [teamGoals]
  );

  const latestUpdateByGoalId = useMemo(() => {
    const map = new Map<string, ProgressUpdateItem>();

    teamUpdates.forEach((update) => {
      const current = map.get(update.goalId);
      if (!current || new Date(update.createdAt).getTime() > new Date(current.createdAt).getTime()) {
        map.set(update.goalId, update);
      }
    });

    return map;
  }, [teamUpdates]);

  const employeeInfoById = useMemo(() => {
    const map = new Map<string, TeamMemberItem>();
    teamMembers.forEach((member) => map.set(member.$id, member));
    return map;
  }, [teamMembers]);

  const heatMapRows = useMemo(() => {
    const activeGoals = teamGoals.filter((goal) => goal.status !== "closed");
    const goalsForHeatMap = activeGoals.length > 0 ? activeGoals : teamGoals;

    const grouped = new Map<string, TeamGoalItem[]>();
    goalsForHeatMap.forEach((goal) => {
      const employeeKey = goal.employeeId || "unassigned";
      const list = grouped.get(employeeKey) || [];
      list.push(goal);
      grouped.set(employeeKey, list);
    });

    return Array.from(grouped.entries())
      .map(([employeeId, goals]) => {
        const employee = employeeId === "unassigned" ? undefined : employeeInfoById.get(employeeId);
        return {
          employeeId,
          employeeName: employee?.name || (employeeId === "unassigned" ? "Unassigned Employee" : employeeId),
          department: employee?.department || "Unassigned",
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
  }, [employeeInfoById, latestUpdateByGoalId, teamGoals]);

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

  const topAtRiskGoals = useMemo(() => {
    const goalsWithState = teamGoals.map((goal) => {
      const latest = latestUpdateByGoalId.get(goal.$id);
      const ragState: HeatMapState = latest?.ragStatus || "no_update";
      const progress = Number(goal.progressPercent || 0);

      let riskScore = 0;
      if (ragState === "behind") riskScore += 100;
      else if (ragState === "no_update") riskScore += 65;
      else if (ragState === "on_track") riskScore += 30;
      else if (ragState === "completed") riskScore += 10;

      riskScore += Math.max(0, 100 - progress);

      return {
        goal,
        ragState,
        progress,
        riskScore,
      };
    });

    return goalsWithState
      .filter((item) => item.goal.status !== "closed")
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 3);
  }, [latestUpdateByGoalId, teamGoals]);

  useEffect(() => {
    if (lineageGoalId && topAtRiskGoals.some((item) => item.goal.$id === lineageGoalId)) {
      return;
    }

    setLineageGoalId(topAtRiskGoals[0]?.goal.$id || "");
  }, [lineageGoalId, topAtRiskGoals]);

  const heatMapLegend: Array<{ key: HeatMapState; label: string; className: string }> = [
    { key: "on_track", label: "On Track", className: "bg-[var(--color-badge-success-bg)] text-[var(--color-text)] border-[var(--color-badge-success-border)]" },
    { key: "behind", label: "Behind", className: "bg-[var(--color-badge-warning-bg)] text-[var(--color-text)] border-[var(--color-badge-warning-border)]" },
    { key: "completed", label: "Completed", className: "bg-[var(--color-badge-info-bg)] text-[var(--color-text)] border-[var(--color-badge-info-border)]" },
    { key: "no_update", label: "No Update", className: "bg-[var(--color-surface-muted)] text-[var(--color-text-muted)] border-[var(--color-border)]" },
  ];

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

  function downloadTeamReport() {
    const memberById = new Map<string, TeamMemberItem>();
    teamMembers.forEach((m) => memberById.set(m.$id, m));

    // Sheet 1: Employees
    const employeeRows = teamMembers.map((m) => ({
      "Name": m.name || "",
      "Email": m.email || "",
      "Role": m.role || "",
      "Department": m.department || "",
      "Region": m.region || "",
    }));

    // Sheet 2: Goals
    const goalRows = teamGoals.map((goal) => {
      const member = goal.employeeId ? memberById.get(goal.employeeId) : undefined;
      const latest = latestUpdateByGoalId.get(goal.$id);
      return {
        "Employee Name": member?.name || goal.employeeId || "",
        "Employee Email": member?.email || "",
        "Department": member?.department || "",
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

    // Sheet 3: Check-ins
    const checkInRows = teamCheckIns.map((ci) => {
      const member = ci.employeeId ? memberById.get(ci.employeeId) : undefined;
      return {
        "Employee Name": member?.name || ci.employeeId || "",
        "Employee Email": member?.email || "",
        "Scheduled At": ci.scheduledAt ? new Date(ci.scheduledAt).toLocaleString() : "",
        "Status": ci.status || "",
        "Employee Notes": ci.employeeNotes || "",
        "Manager Notes": ci.managerNotes || "",
        "Is Final Check-in": ci.isFinalCheckIn ? "Yes" : "No",
      };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(employeeRows.length ? employeeRows : [{}]), "Employees");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(goalRows.length ? goalRows : [{}]), "Goals");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(checkInRows.length ? checkInRows : [{}]), "Check-ins");

    XLSX.writeFile(wb, `team-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <Stack gap="4">
      <PageHeader
        title="Manager Dashboard"
        subtitle="Monitor team performance, unblock progress, and complete approvals."
        actions={
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button variant="secondary" onClick={downloadTeamReport} disabled={loading}>
              Download Report
            </Button>
            <Button variant="secondary" onClick={loadDashboard} disabled={loading}>
              Refresh
            </Button>
          </div>
        }
      />

      {error && <Alert variant="error" title="Unable to load" description={error} onDismiss={() => setError("")} />}

      <Grid cols={1} colsMd={3} gap="3">
        <Card title="Team Goals" className="bg-[linear-gradient(160deg,var(--color-surface)_0%,var(--color-surface-muted)_100%)]">
          <p className="heading-xl">{loading ? "..." : teamGoals.length}</p>
        </Card>
        <Card title="Team Average Progress" className="bg-[linear-gradient(160deg,var(--color-surface)_0%,var(--color-surface-muted)_100%)]">
          <p className="heading-xl">{loading ? "..." : `${teamAvgProgress}%`}</p>
        </Card>
        <Card title="Pending Goal Approvals" className="bg-[linear-gradient(160deg,var(--color-surface)_0%,var(--color-surface-muted)_100%)]">
          <p className="heading-xl">{loading ? "..." : pendingGoalApprovals}</p>
        </Card>
      </Grid>

      <Card title="AI Insights" description="Decision intelligence highlight from team performance signals.">
        {loading && <p className="caption">Loading AI insights...</p>}

        {!loading && !decisionInsights && (
          <p className="caption">AI insights are unavailable until team cycle data is available.</p>
        )}

        {!loading && decisionInsights && (
          <Stack gap="2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={riskBadgeVariant(decisionInsights.overallRiskLevel)}>
                Risk: {String(decisionInsights.overallRiskLevel || "low").toUpperCase()}
              </Badge>
              <p className="caption">Focus: {decisionTargetLabel || decisionInsights.employeeId}</p>
              {decisionInsights.explainability && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setInsightsExplainabilityOpen(true)}
                >
                  Why this suggestion?
                </Button>
              )}
            </div>
            <p className="body-sm text-[var(--color-text)]">{decisionInsights.topRecommendation}</p>
          </Stack>
        )}
      </Card>

      <RatingDropWarningSection
        title="Team insights"
        description="Rating-drop alerts that may need manager follow-up."
        items={ratingDropInsights}
        initialVisibleCount={3}
      />

      <ExplainabilityDrawer
        open={insightsExplainabilityOpen}
        onClose={() => setInsightsExplainabilityOpen(false)}
        payload={decisionInsights?.explainability || null}
        title="Why this suggestion?"
      />

      <Grid cols={1} colsLg={2} gap="3">
        <Card title="Feature Pages" description="Use dedicated pages for manager workflows.">
          <Stack gap="2">
            <Link className="body-sm rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-[var(--color-primary)] hover:bg-[var(--color-surface-muted)]" href="/manager/check-ins">
              Open Team Check-ins
            </Link>
            <Link className="body-sm rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-[var(--color-primary)] hover:bg-[var(--color-surface-muted)]" href="/manager/meetings">
              Open Meetings
            </Link>
            <Link className="body-sm rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-[var(--color-primary)] hover:bg-[var(--color-surface-muted)]" href="/manager/meeting-calendar">
              Open Meeting Calendar Dashboard
            </Link>
            <Link className="body-sm rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-[var(--color-primary)] hover:bg-[var(--color-surface-muted)]" href="/manager/team-analytics">
              Open Team Analytics
            </Link>
          </Stack>
        </Card>

        <Card title="Team Goal Status" description="Latest statuses across your direct team.">
          <Stack gap="2">
            {!loading && teamGoals.length === 0 && <p className="caption">No team goals yet.</p>}
            {teamGoals.slice(0, 6).map((goal) => (
              <div key={goal.$id} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="body-sm text-[var(--color-text)]">{goal.title}</p>
                  <Badge variant={goalStatusVariant(goal.status)}>{goal.status}</Badge>
                </div>
                {goal.employeeId && <p className="caption mt-1">Employee: {goal.employeeId}</p>}
              </div>
            ))}
          </Stack>
        </Card>

        <Card title="Team Upcoming Check-ins" description="Planned check-ins for your direct team.">
          <Stack gap="3">
            {!loading && teamCheckIns.length === 0 && <p className="caption">No team check-ins yet.</p>}
            {teamCheckIns.slice(0, 5).map((item) => (
              <div key={item.$id} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="body-sm text-[var(--color-text)]">{formatDate(item.scheduledAt)}</p>
                  <Badge variant={item.status === "completed" ? "success" : "info"}>{item.status}</Badge>
                </div>
                {item.employeeId && <p className="caption mt-1">Employee: {item.employeeId}</p>}
              </div>
            ))}
          </Stack>
        </Card>

        <Card title="Goal Lineage Snapshot" description="Top at-risk goals with full parent-child context.">
          <Stack gap="3">
            {!loading && topAtRiskGoals.length === 0 && <p className="caption">No active goals available yet.</p>}

            {topAtRiskGoals.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {topAtRiskGoals.map((item) => {
                  const employee = item.goal.employeeId ? employeeInfoById.get(item.goal.employeeId) : undefined;
                  const goalLink = `/manager/team-goals?goalId=${encodeURIComponent(item.goal.$id)}`;

                  return (
                    <div key={item.goal.$id} className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setLineageGoalId(item.goal.$id)}
                        className={
                          lineageGoalId === item.goal.$id
                            ? "rounded-[var(--radius-sm)] border border-transparent bg-[var(--color-primary)] px-2 py-1 caption text-[var(--color-button-text)]"
                            : "rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 caption text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
                        }
                        title={`${item.goal.title} • ${item.ragState.replace("_", " ")} • ${item.progress}%`}
                      >
                        {(employee?.name || item.goal.employeeId || "Team") + ": " + item.goal.title}
                      </button>
                      <Link
                        href={goalLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 caption text-[var(--color-primary)] hover:bg-[var(--color-surface-muted)]"
                        title="Open in team goals"
                      >
                        Open
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}

            {lineageGoalId && (
              <GoalLineageView
                goalId={lineageGoalId}
                embedded
                goalHrefBuilder={(goalId) => `/manager/team-goals?goalId=${encodeURIComponent(goalId)}`}
              />
            )}
          </Stack>
        </Card>
      </Grid>

      <Card title="Team Progress Heat Map" description="Latest RAG signal for each employee's current goals.">
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
            <label className="caption text-[var(--color-text-muted)]" htmlFor="heatmap-rag-filter">
              Status
            </label>
            <select
              id="heatmap-rag-filter"
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

            <label className="caption text-[var(--color-text-muted)]" htmlFor="heatmap-department-filter">
              Department
            </label>
            <select
              id="heatmap-department-filter"
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

          <div className="flex flex-wrap gap-2">
            {heatMapLegend.map((item) => (
              <span
                key={item.key}
                className={`inline-flex items-center rounded-[var(--radius-sm)] border px-2 py-1 caption ${item.className}`}
              >
                {item.label}
              </span>
            ))}
          </div>

          {!loading && heatMapRows.length === 0 && (
            <p className="caption">No team goals available yet for heat map view.</p>
          )}

          {!loading && heatMapRows.length > 0 && filteredHeatMapRows.length === 0 && (
            <p className="caption">No goals match the selected filters.</p>
          )}

          {filteredHeatMapRows.length > 0 && (
            <div className="overflow-x-auto">
              <div className="min-w-[620px] space-y-2">
                {filteredHeatMapRows.map((row) => (
                  <div
                    key={row.employeeId}
                    className="grid grid-cols-[220px_minmax(0,1fr)] items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] p-2"
                  >
                    <div>
                      <p className="body-sm font-medium text-[var(--color-text)]">{row.employeeName}</p>
                      <p className="caption text-[var(--color-text-muted)]">{row.department}</p>
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

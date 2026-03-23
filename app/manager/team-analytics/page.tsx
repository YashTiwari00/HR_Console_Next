"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Button, Card } from "@/src/components/ui";
import { fetchGoals, fetchTeamMembers, GoalItem, TeamMemberItem } from "@/app/employee/_lib/pmsClient";

type TeamGoalItem = GoalItem & { employeeId?: string };
type AnalyticsTimeFilter = "yearly" | "last_6_months" | "quarterly" | "cycle";

interface ParsedCycle {
  year: number;
  quarter: number;
  start: Date;
  end: Date;
}

function parseCycleId(cycleId?: string): ParsedCycle | null {
  if (!cycleId) return null;
  const match = /^Q([1-4])-(\d{4})$/i.exec(cycleId.trim());
  if (!match) return null;

  const quarter = Number(match[1]);
  const year = Number(match[2]);
  const startMonth = (quarter - 1) * 3;
  const start = new Date(year, startMonth, 1);
  const end = new Date(year, startMonth + 3, 0, 23, 59, 59, 999);

  return { year, quarter, start, end };
}

function matchesAnalyticsTimeFilter(cycleId: string | undefined, mode: AnalyticsTimeFilter, selectedCycle: string) {
  const parsed = parseCycleId(cycleId);
  if (!parsed) {
    return mode === "cycle" ? cycleId === selectedCycle : false;
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentQuarter = Math.floor(now.getMonth() / 3) + 1;

  if (mode === "yearly") {
    return parsed.year === currentYear;
  }

  if (mode === "quarterly") {
    return parsed.year === currentYear && parsed.quarter === currentQuarter;
  }

  if (mode === "last_6_months") {
    const threshold = new Date(now);
    threshold.setMonth(threshold.getMonth() - 6);
    return parsed.end >= threshold;
  }

  return cycleId === selectedCycle;
}

function sortCycleIds(a: string, b: string) {
  const pa = parseCycleId(a);
  const pb = parseCycleId(b);
  if (pa && pb) {
    if (pb.year !== pa.year) return pb.year - pa.year;
    return pb.quarter - pa.quarter;
  }
  return b.localeCompare(a);
}

export default function ManagerTeamAnalyticsPage() {
  const [teamGoals, setTeamGoals] = useState<TeamGoalItem[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMemberItem[]>([]);
  const [analyticsDepartmentFilter, setAnalyticsDepartmentFilter] = useState("all");
  const [analyticsTimeFilter, setAnalyticsTimeFilter] = useState<AnalyticsTimeFilter>("quarterly");
  const [selectedCycleId, setSelectedCycleId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [nextTeamGoals, nextTeamMembers] = await Promise.all([
        fetchGoals("team"),
        fetchTeamMembers(),
      ]);

      setTeamGoals(nextTeamGoals as TeamGoalItem[]);
      setTeamMembers(nextTeamMembers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load team analytics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const employeeInfoById = useMemo(() => {
    const map = new Map<string, TeamMemberItem>();
    teamMembers.forEach((member) => map.set(member.$id, member));
    return map;
  }, [teamMembers]);

  const analyticsDepartmentOptions = useMemo(() => {
    const values = new Set<string>();
    teamMembers.forEach((member) => {
      if (member.department) {
        values.add(member.department);
      }
    });
    return ["all", ...Array.from(values).sort((a, b) => a.localeCompare(b))];
  }, [teamMembers]);

  const cycleOptions = useMemo(() => {
    const values = Array.from(new Set(teamGoals.map((goal) => goal.cycleId).filter(Boolean)));
    return values.sort(sortCycleIds);
  }, [teamGoals]);

  useEffect(() => {
    if (!selectedCycleId && cycleOptions.length > 0) {
      setSelectedCycleId(cycleOptions[0]);
    }
  }, [cycleOptions, selectedCycleId]);

  const analyticsRows = useMemo(() => {
    const goalsInWindow = teamGoals.filter((goal) =>
      matchesAnalyticsTimeFilter(goal.cycleId, analyticsTimeFilter, selectedCycleId)
    );

    const filteredGoals = goalsInWindow.filter((goal) => {
      const employeeId = goal.employeeId;
      if (!employeeId) return false;
      if (analyticsDepartmentFilter === "all") return true;
      const member = employeeInfoById.get(employeeId);
      return member?.department === analyticsDepartmentFilter;
    });

    const grouped = new Map<string, TeamGoalItem[]>();
    filteredGoals.forEach((goal) => {
      if (!goal.employeeId) return;
      const list = grouped.get(goal.employeeId) || [];
      list.push(goal);
      grouped.set(goal.employeeId, list);
    });

    const rows = Array.from(grouped.entries()).map(([employeeId, goals]) => {
      const member = employeeInfoById.get(employeeId);
      const ratedGoals = goals.filter((goal) => Number.isFinite(goal.managerFinalRating));
      const weighted = ratedGoals.reduce(
        (acc, goal) => {
          const rating = Number(goal.managerFinalRating || 0);
          const weight = Number(goal.weightage || 0);
          if (weight <= 0) return acc;
          return {
            weightedSum: acc.weightedSum + rating * weight,
            weightTotal: acc.weightTotal + weight,
          };
        },
        { weightedSum: 0, weightTotal: 0 }
      );
      const weightedScore = weighted.weightTotal > 0 ? weighted.weightedSum / weighted.weightTotal : null;
      const avgProgress =
        goals.length > 0
          ? Math.round(goals.reduce((sum, goal) => sum + (goal.progressPercent || 0), 0) / goals.length)
          : 0;

      return {
        employeeId,
        employeeName: member?.name || employeeId,
        department: member?.department || "Unassigned",
        weightedScore,
        avgProgress,
        ratedGoalsCount: ratedGoals.length,
        totalGoalsCount: goals.length,
      };
    });

    const sorted = rows.sort((a, b) => {
      if (a.weightedScore === null && b.weightedScore !== null) return 1;
      if (a.weightedScore !== null && b.weightedScore === null) return -1;
      if (a.weightedScore !== null && b.weightedScore !== null && b.weightedScore !== a.weightedScore) {
        return b.weightedScore - a.weightedScore;
      }
      if (b.avgProgress !== a.avgProgress) return b.avgProgress - a.avgProgress;
      return a.employeeName.localeCompare(b.employeeName);
    });

    let rank = 0;
    return sorted.map((row) => {
      if (row.weightedScore !== null) {
        rank += 1;
        return { ...row, rank };
      }
      return { ...row, rank: null as number | null };
    });
  }, [analyticsDepartmentFilter, analyticsTimeFilter, employeeInfoById, selectedCycleId, teamGoals]);

  const analyticsRatedRows = useMemo(
    () => analyticsRows.filter((row) => row.weightedScore !== null),
    [analyticsRows]
  );

  const maxAnalyticsScore = useMemo(() => {
    if (analyticsRatedRows.length === 0) return 5;
    return Math.max(...analyticsRatedRows.map((row) => row.weightedScore || 0), 5);
  }, [analyticsRatedRows]);

  return (
    <Stack gap="4">
      <PageHeader
        title="Team Ranking & Progress Graph"
        subtitle="Compare weighted ratings across your team and identify top performers."
        actions={
          <Button variant="secondary" onClick={loadAnalytics} disabled={loading}>
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="error" title="Unable to load" description={error} onDismiss={() => setError("")} />}

      <Card title="Team Performance Analytics" description="Progress graph and ranking based on weighted employee ratings.">
        <Stack gap="3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="caption text-[var(--color-text-muted)]" htmlFor="analytics-department-filter">
              Department
            </label>
            <select
              id="analytics-department-filter"
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 body-sm text-[var(--color-text)]"
              value={analyticsDepartmentFilter}
              onChange={(event) => setAnalyticsDepartmentFilter(event.target.value)}
            >
              {analyticsDepartmentOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? "All Departments" : option}
                </option>
              ))}
            </select>

            <label className="caption text-[var(--color-text-muted)]" htmlFor="analytics-time-filter">
              Time
            </label>
            <select
              id="analytics-time-filter"
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 body-sm text-[var(--color-text)]"
              value={analyticsTimeFilter}
              onChange={(event) => setAnalyticsTimeFilter(event.target.value as AnalyticsTimeFilter)}
            >
              <option value="yearly">Yearly</option>
              <option value="last_6_months">Last 6 Months</option>
              <option value="quarterly">Quarterly</option>
              <option value="cycle">By Cycle</option>
            </select>

            {analyticsTimeFilter === "cycle" && (
              <>
                <label className="caption text-[var(--color-text-muted)]" htmlFor="analytics-cycle-filter">
                  Cycle
                </label>
                <select
                  id="analytics-cycle-filter"
                  className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 body-sm text-[var(--color-text)]"
                  value={selectedCycleId}
                  onChange={(event) => setSelectedCycleId(event.target.value)}
                >
                  {cycleOptions.map((cycle) => (
                    <option key={cycle} value={cycle}>
                      {cycle}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>

          {!loading && analyticsRows.length === 0 && (
            <p className="caption">No employee goals match the selected analytics filters.</p>
          )}

          {!loading && analyticsRows.length > 0 && analyticsRatedRows.length === 0 && (
            <p className="caption">Employees found, but no finalized ratings are available for this period yet.</p>
          )}

          {analyticsRatedRows.length > 0 && (
            <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
              <p className="body-sm font-medium text-[var(--color-text)]">Progress Graph (Weighted Rating)</p>
              <div className="mt-3 overflow-x-auto">
                <div className="flex min-w-[640px] items-end gap-3">
                  {analyticsRatedRows.map((row) => {
                    const score = row.weightedScore || 0;
                    const barHeight = Math.max(12, Math.round((score / maxAnalyticsScore) * 160));
                    const barTone =
                      score >= 4.5
                        ? "bg-[var(--color-badge-success-bg)] border-[var(--color-badge-success-border)]"
                        : score >= 3.5
                          ? "bg-[var(--color-badge-info-bg)] border-[var(--color-badge-info-border)]"
                          : score >= 2.5
                            ? "bg-[var(--color-badge-warning-bg)] border-[var(--color-badge-warning-border)]"
                            : "bg-[var(--color-badge-danger-bg)] border-[var(--color-badge-danger-border)]";

                    return (
                      <div key={row.employeeId} className="flex w-24 shrink-0 flex-col items-center gap-2">
                        <p className="caption text-[var(--color-text-muted)]">{score.toFixed(2)}</p>
                        <div
                          className={`w-full rounded-t-[var(--radius-sm)] border ${barTone}`}
                          style={{ height: `${barHeight}px` }}
                          title={`${row.employeeName} - ${score.toFixed(2)}`}
                        />
                        <p className="caption line-clamp-2 text-center text-[var(--color-text)]" title={row.employeeName}>
                          {row.employeeName}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {analyticsRows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    <th className="px-2 py-2 text-left caption text-[var(--color-text-muted)]">Rank</th>
                    <th className="px-2 py-2 text-left caption text-[var(--color-text-muted)]">Employee</th>
                    <th className="px-2 py-2 text-left caption text-[var(--color-text-muted)]">Department</th>
                    <th className="px-2 py-2 text-left caption text-[var(--color-text-muted)]">Weighted Score</th>
                    <th className="px-2 py-2 text-left caption text-[var(--color-text-muted)]">Avg Progress</th>
                    <th className="px-2 py-2 text-left caption text-[var(--color-text-muted)]">Rated Goals</th>
                  </tr>
                </thead>
                <tbody>
                  {analyticsRows.map((row) => {
                    const isTopThree = row.rank !== null && row.rank <= 3;
                    return (
                      <tr
                        key={row.employeeId}
                        className={
                          isTopThree
                            ? "border-b border-[var(--color-border)] bg-[var(--color-badge-info-bg)]"
                            : "border-b border-[var(--color-border)]"
                        }
                      >
                        <td className="px-2 py-2 body-sm text-[var(--color-text)]">
                          {row.rank !== null ? `#${row.rank}` : "-"}
                        </td>
                        <td className="px-2 py-2 body-sm text-[var(--color-text)]">{row.employeeName}</td>
                        <td className="px-2 py-2 body-sm text-[var(--color-text-muted)]">{row.department}</td>
                        <td className="px-2 py-2 body-sm text-[var(--color-text)]">
                          {row.weightedScore !== null ? row.weightedScore.toFixed(2) : "Not Rated"}
                        </td>
                        <td className="px-2 py-2 body-sm text-[var(--color-text)]">{row.avgProgress}%</td>
                        <td className="px-2 py-2 body-sm text-[var(--color-text)]">
                          {row.ratedGoalsCount}/{row.totalGoalsCount}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}

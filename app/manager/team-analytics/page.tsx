"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Grid, Stack } from "@/src/components/layout";
import {
  DataTable,
  ExplainabilityDrawer,
  type ExplainabilityPayload,
  PageHeader,
  type DataTableColumn,
} from "@/src/components/patterns";
import { Alert, Badge, Button, Card } from "@/src/components/ui";
import {
  CheckInItem,
  DecisionInsightsData,
  fetchCheckIns,
  fetchEmployeeTrajectory,
  fetchDecisionInsights,
  fetchGoals,
  fetchTeamMembers,
  EmployeeTrajectoryCyclePoint,
  EmployeeTrajectoryData,
  GoalItem,
  TeamMemberItem,
  TrajectoryTrendLabel,
} from "@/app/employee/_lib/pmsClient";

type TeamGoalItem = GoalItem & { employeeId?: string };
type AnalyticsTimeFilter = "yearly" | "last_6_months" | "quarterly" | "cycle";

interface ParsedCycle {
  year: number;
  quarter: number;
  start: Date;
  end: Date;
}

interface TeamAnalyticsRow {
  employeeId: string;
  employeeName: string;
  department: string;
  weightedScore: number | null;
  avgProgress: number;
  ratedGoalsCount: number;
  totalGoalsCount: number;
  rank: number | null;
  trendLabel: TrajectoryTrendLabel;
  trendDeltaPercent: number;
  trendDisplay: string;
  riskLevel: "low" | "medium" | "high";
  consistencyScore: number | null;
}

interface RiskAlertRow {
  employeeId: string;
  employeeName: string;
  department: string;
  riskLevel: "low" | "medium" | "high";
  decliningTrend: boolean;
  lowRating: boolean;
  missedCheckIns: number;
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

function computeWeightedScore(goals: TeamGoalItem[]) {
  const weighted = goals.reduce(
    (acc, goal) => {
      if (!Number.isFinite(goal.managerFinalRating)) return acc;

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

  return weighted.weightTotal > 0 ? weighted.weightedSum / weighted.weightTotal : null;
}

function computeConsistencyScore(cycles: EmployeeTrajectoryCyclePoint[]) {
  const scores = cycles
    .map((cycle) => (Number.isFinite(cycle.scoreX100) ? Number(cycle.scoreX100) / 100 : null))
    .filter((value): value is number => value !== null);

  if (scores.length < 2) return null;

  const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const variance =
    scores.reduce((sum, value) => {
      const diff = value - mean;
      return sum + diff * diff;
    }, 0) / scores.length;

  const normalizedVariance = Math.min(variance, 4) / 4;
  return Math.max(0, Math.round((1 - normalizedVariance) * 100));
}

function formatTrendDisplay(label: TrajectoryTrendLabel, deltaPercent: number) {
  const signedDelta = deltaPercent > 0 ? `+${deltaPercent.toFixed(1)}%` : `${deltaPercent.toFixed(1)}%`;
  const normalizedLabel = label.charAt(0).toUpperCase() + label.slice(1);
  return `${normalizedLabel} (${signedDelta})`;
}

function deriveRiskLevel(input: {
  weightedScore: number | null;
  trendLabel: TrajectoryTrendLabel;
  trendDeltaPercent: number;
  consistencyScore: number | null;
}) {
  const { weightedScore, trendLabel, trendDeltaPercent, consistencyScore } = input;

  const isHighRiskTrend = trendLabel === "declining" && trendDeltaPercent <= -5;
  const isMediumRiskTrend = trendLabel === "declining" || trendLabel === "stable";

  if (
    (weightedScore !== null && weightedScore < 2.5) ||
    isHighRiskTrend ||
    (consistencyScore !== null && consistencyScore < 50)
  ) {
    return "high";
  }

  if (
    (weightedScore !== null && weightedScore < 3.3) ||
    isMediumRiskTrend ||
    (consistencyScore !== null && consistencyScore < 75)
  ) {
    return "medium";
  }

  return "low";
}

function getPerformanceBand(score: number) {
  if (score >= 4.5) {
    return {
      label: "Excellent",
      tone: "bg-[var(--color-badge-success-bg)] border-[var(--color-badge-success-border)]",
    };
  }

  if (score >= 3.5) {
    return {
      label: "Strong",
      tone: "bg-[var(--color-badge-info-bg)] border-[var(--color-badge-info-border)]",
    };
  }

  if (score >= 2.5) {
    return {
      label: "Watch",
      tone: "bg-[var(--color-badge-warning-bg)] border-[var(--color-badge-warning-border)]",
    };
  }

  return {
    label: "Critical",
    tone: "bg-[var(--color-badge-danger-bg)] border-[var(--color-badge-danger-border)]",
  };
}

export default function ManagerTeamAnalyticsPage() {
  const [teamGoals, setTeamGoals] = useState<TeamGoalItem[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMemberItem[]>([]);
  const [analyticsDepartmentFilter, setAnalyticsDepartmentFilter] = useState("all");
  const [analyticsTimeFilter, setAnalyticsTimeFilter] = useState<AnalyticsTimeFilter>("quarterly");
  const [selectedCycleId, setSelectedCycleId] = useState("");
  const [teamCheckIns, setTeamCheckIns] = useState<CheckInItem[]>([]);
  const [trajectoryByEmployeeId, setTrajectoryByEmployeeId] = useState<Record<string, EmployeeTrajectoryData>>({});
  const [decisionInsightsByEmployeeId, setDecisionInsightsByEmployeeId] = useState<Record<string, DecisionInsightsData>>({});
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [showTrendOverlay, setShowTrendOverlay] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedExplainability, setSelectedExplainability] = useState<{
    title: string;
    payload: ExplainabilityPayload;
  } | null>(null);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [nextTeamGoals, nextTeamMembers, nextTeamCheckIns] = await Promise.all([
        fetchGoals("team"),
        fetchTeamMembers(),
        fetchCheckIns("team"),
      ]);

      const employeeIds = Array.from(
        new Set(
          [
            ...nextTeamMembers.map((member) => String(member.$id || "").trim()),
            ...nextTeamGoals.map((goal) => String(goal.employeeId || "").trim()),
          ].filter(Boolean)
        )
      );

      const trajectoryEntries = await Promise.all(
        employeeIds.map(async (employeeId) => {
          try {
            const trajectory = await fetchEmployeeTrajectory(employeeId);
            return [employeeId, trajectory] as const;
          } catch {
            return [employeeId, null] as const;
          }
        })
      );

      const nextTrajectoryByEmployeeId: Record<string, EmployeeTrajectoryData> = {};
      trajectoryEntries.forEach(([employeeId, trajectory]) => {
        if (trajectory) {
          nextTrajectoryByEmployeeId[employeeId] = trajectory;
        }
      });

      setTeamGoals(nextTeamGoals as TeamGoalItem[]);
      setTeamMembers(nextTeamMembers);
      setTeamCheckIns(nextTeamCheckIns);
      setTrajectoryByEmployeeId(nextTrajectoryByEmployeeId);
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

  const analyticsCycleId = useMemo(() => {
    return selectedCycleId || cycleOptions[0] || "";
  }, [cycleOptions, selectedCycleId]);

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
      const weightedScore = computeWeightedScore(ratedGoals);
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
        trendLabel: "new" as TrajectoryTrendLabel,
        trendDeltaPercent: 0,
        trendDisplay: "New (0.0%)",
        riskLevel: "low" as "low" | "medium" | "high",
        consistencyScore: null as number | null,
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
    return sorted.map((row): TeamAnalyticsRow => {
      const trajectory = trajectoryByEmployeeId[row.employeeId];
      const trendLabel = trajectory?.trendLabel || "new";
      const trendDeltaPercent = Number(trajectory?.trendDeltaPercent || 0);
      const trendDisplay = formatTrendDisplay(trendLabel, trendDeltaPercent);
      const consistencyScore = computeConsistencyScore(trajectory?.cycles || []);
      const riskLevel = deriveRiskLevel({
        weightedScore: row.weightedScore,
        trendLabel,
        trendDeltaPercent,
        consistencyScore,
      });

      if (row.weightedScore !== null) {
        rank += 1;
        return {
          ...row,
          rank,
          trendLabel,
          trendDeltaPercent,
          trendDisplay,
          riskLevel,
          consistencyScore,
        };
      }
      return {
        ...row,
        rank: null,
        trendLabel,
        trendDeltaPercent,
        trendDisplay,
        riskLevel,
        consistencyScore,
      };
    });
  }, [analyticsDepartmentFilter, analyticsTimeFilter, employeeInfoById, selectedCycleId, teamGoals, trajectoryByEmployeeId]);

  const analyticsRatedRows = useMemo(
    () => analyticsRows.filter((row) => row.weightedScore !== null),
    [analyticsRows]
  );

  const analyticsEmployeeIds = useMemo(
    () => analyticsRows.map((row) => row.employeeId).filter(Boolean),
    [analyticsRows]
  );

  useEffect(() => {
    let active = true;

    async function loadDecisionInsights() {
      if (!analyticsCycleId || analyticsEmployeeIds.length === 0) {
        if (active) {
          setDecisionInsightsByEmployeeId({});
        }
        return;
      }

      setInsightsLoading(true);

      const entries = await Promise.all(
        analyticsEmployeeIds.map(async (employeeId) => {
          try {
            const insight = await fetchDecisionInsights({ employeeId, cycleId: analyticsCycleId });
            return [employeeId, insight] as const;
          } catch {
            return [employeeId, null] as const;
          }
        })
      );

      if (!active) return;

      const next: Record<string, DecisionInsightsData> = {};
      entries.forEach(([employeeId, insight]) => {
        if (insight) {
          next[employeeId] = insight;
        }
      });

      setDecisionInsightsByEmployeeId(next);
      setInsightsLoading(false);
    }

    loadDecisionInsights().catch(() => {
      if (active) {
        setInsightsLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [analyticsCycleId, analyticsEmployeeIds]);

  const maxAnalyticsScore = useMemo(() => {
    if (analyticsRatedRows.length === 0) return 5;
    return Math.max(...analyticsRatedRows.map((row) => row.weightedScore || 0), 5);
  }, [analyticsRatedRows]);

  const graphMetrics = useMemo(() => {
    const barWidth = 96;
    const barGap = 12;
    const plotHeight = 160;
    const graphWidth = Math.max(640, analyticsRatedRows.length * barWidth + Math.max(0, analyticsRatedRows.length - 1) * barGap);

    const points = analyticsRatedRows
      .map((row, index) => {
        const score = Number(row.weightedScore || 0);
        const x = index * (barWidth + barGap) + barWidth / 2;
        const y = plotHeight - Math.round((score / maxAnalyticsScore) * plotHeight);
        return `${x},${Math.max(0, Math.min(plotHeight, y))}`;
      })
      .join(" ");

    return {
      barWidth,
      barGap,
      plotHeight,
      graphWidth,
      points,
    };
  }, [analyticsRatedRows, maxAnalyticsScore]);

  const kpiSummary = useMemo(() => {
    const averageTeamScore =
      analyticsRatedRows.length > 0
        ? analyticsRatedRows.reduce((sum, row) => sum + Number(row.weightedScore || 0), 0) / analyticsRatedRows.length
        : null;

    const topPerformerScore =
      analyticsRatedRows.length > 0
        ? Math.max(...analyticsRatedRows.map((row) => Number(row.weightedScore || 0)))
        : null;

    const departmentGoals = teamGoals.filter((goal) => {
      const employeeId = goal.employeeId;
      if (!employeeId) return false;
      if (analyticsDepartmentFilter === "all") return true;
      const member = employeeInfoById.get(employeeId);
      return member?.department === analyticsDepartmentFilter;
    });

    const cycleIds = Array.from(new Set(departmentGoals.map((goal) => goal.cycleId).filter(Boolean))).sort(sortCycleIds);
    const currentCycleId = selectedCycleId || cycleIds[0] || "";
    const currentCycleIndex = cycleIds.indexOf(currentCycleId);
    const previousCycleId = currentCycleIndex >= 0 ? cycleIds[currentCycleIndex + 1] || "" : "";

    const goalsByEmployeeCycle = new Map<string, Map<string, TeamGoalItem[]>>();
    departmentGoals.forEach((goal) => {
      const employeeId = String(goal.employeeId || "").trim();
      const cycleId = String(goal.cycleId || "").trim();
      if (!employeeId || !cycleId) return;

      const cycleMap = goalsByEmployeeCycle.get(employeeId) || new Map<string, TeamGoalItem[]>();
      const existing = cycleMap.get(cycleId) || [];
      existing.push(goal);
      cycleMap.set(cycleId, existing);
      goalsByEmployeeCycle.set(employeeId, cycleMap);
    });

    let atRiskEmployeeCount = 0;
    let comparedEmployees = 0;
    let improvedEmployees = 0;

    goalsByEmployeeCycle.forEach((cycleMap) => {
      if (!currentCycleId) return;

      const currentScore = computeWeightedScore(cycleMap.get(currentCycleId) || []);
      if (currentScore === null) return;

      const previousScore = previousCycleId ? computeWeightedScore(cycleMap.get(previousCycleId) || []) : null;
      const isDeclining = previousScore !== null && currentScore < previousScore;

      if (currentScore < 2.5 || isDeclining) {
        atRiskEmployeeCount += 1;
      }

      if (previousScore !== null) {
        comparedEmployees += 1;
        if (currentScore > previousScore) {
          improvedEmployees += 1;
        }
      }
    });

    const improvementRate =
      comparedEmployees > 0 ? (improvedEmployees / comparedEmployees) * 100 : null;

    return {
      averageTeamScore,
      topPerformerScore,
      atRiskEmployeeCount,
      improvementRate,
      previousCycleId,
    };
  }, [analyticsDepartmentFilter, analyticsRatedRows, employeeInfoById, selectedCycleId, teamGoals]);

  const aiInsightsSummary = useMemo(() => {
    const rankedRows = analyticsRows.filter((row) => row.rank !== null);
    const topRows = rankedRows.filter((row) => row.rank !== null && row.rank <= 3);
    const topAvgScore =
      topRows.length > 0
        ? topRows.reduce((sum, row) => sum + Number(row.weightedScore || 0), 0) / topRows.length
        : null;

    const topLowRiskCount = topRows.filter(
      (row) => (decisionInsightsByEmployeeId[row.employeeId]?.overallRiskLevel || "low") === "low"
    ).length;

    const decliningRows = analyticsRows.filter((row) => row.trendLabel === "declining");
    const highRiskRows = analyticsRows.filter(
      (row) => (decisionInsightsByEmployeeId[row.employeeId]?.overallRiskLevel || "low") === "high"
    );

    const riskCounts = analyticsRows.reduce(
      (acc, row) => {
        const level = decisionInsightsByEmployeeId[row.employeeId]?.overallRiskLevel || "low";
        if (level === "high") acc.high += 1;
        else if (level === "medium") acc.medium += 1;
        else acc.low += 1;
        return acc;
      },
      { low: 0, medium: 0, high: 0 }
    );

    return {
      topPerformersPattern:
        topRows.length > 0
          ? `Top ${topRows.length} average score is ${topAvgScore?.toFixed(2) || "0.00"}. ${topLowRiskCount}/${topRows.length} of top performers are flagged low risk by AI.`
          : "No top performer pattern detected yet for current filters.",
      decliningTrends:
        decliningRows.length > 0
          ? `${decliningRows.length} employee(s) show declining trajectory. High AI risk flags detected for ${highRiskRows.length} employee(s).`
          : "No declining trajectory detected across the current ranked team.",
      teamPerformanceSummary:
        analyticsRows.length > 0
          ? `AI risk distribution: ${riskCounts.low} low, ${riskCounts.medium} medium, ${riskCounts.high} high across ${analyticsRows.length} ranked employee(s).`
          : "Team performance summary will appear once ranked data is available.",
    };
  }, [analyticsRows, decisionInsightsByEmployeeId]);

  const riskAlerts = useMemo<RiskAlertRow[]>(() => {
    const now = Date.now();

    const filteredGoals = teamGoals.filter((goal) => {
      if (!matchesAnalyticsTimeFilter(goal.cycleId, analyticsTimeFilter, selectedCycleId)) {
        return false;
      }

      const employeeId = String(goal.employeeId || "").trim();
      if (!employeeId) return false;

      if (analyticsDepartmentFilter === "all") return true;
      const member = employeeInfoById.get(employeeId);
      return member?.department === analyticsDepartmentFilter;
    });

    const scopedGoalIds = new Set(filteredGoals.map((goal) => String(goal.$id || "").trim()).filter(Boolean));
    const checkInsByEmployeeId = new Map<string, CheckInItem[]>();

    teamCheckIns.forEach((checkIn) => {
      const employeeId = String(checkIn.employeeId || "").trim();
      if (!employeeId) return;
      if (scopedGoalIds.size > 0 && !scopedGoalIds.has(String(checkIn.goalId || "").trim())) return;

      const existing = checkInsByEmployeeId.get(employeeId) || [];
      existing.push(checkIn);
      checkInsByEmployeeId.set(employeeId, existing);
    });

    return analyticsRows
      .map((row) => {
        const employeeCheckIns = checkInsByEmployeeId.get(row.employeeId) || [];
        const missedCheckIns = employeeCheckIns.filter((checkIn) => {
          const scheduledAtMs = new Date(checkIn.scheduledAt).valueOf();
          if (Number.isNaN(scheduledAtMs)) return false;
          return checkIn.status === "planned" && scheduledAtMs < now;
        }).length;

        const lowRating = row.weightedScore !== null && row.weightedScore < 2.5;
        const decliningTrend = row.trendLabel === "declining";

        if (!decliningTrend && !lowRating && missedCheckIns === 0) return null;

        return {
          employeeId: row.employeeId,
          employeeName: row.employeeName,
          department: row.department,
          riskLevel: row.riskLevel,
          decliningTrend,
          lowRating,
          missedCheckIns,
        };
      })
      .filter((item): item is RiskAlertRow => Boolean(item))
      .sort((a, b) => {
        const priority = { high: 3, medium: 2, low: 1 };
        if (priority[b.riskLevel] !== priority[a.riskLevel]) {
          return priority[b.riskLevel] - priority[a.riskLevel];
        }

        if (b.missedCheckIns !== a.missedCheckIns) {
          return b.missedCheckIns - a.missedCheckIns;
        }

        return a.employeeName.localeCompare(b.employeeName);
      });
  }, [analyticsDepartmentFilter, analyticsRows, analyticsTimeFilter, employeeInfoById, selectedCycleId, teamCheckIns, teamGoals]);

  const explainabilityByEmployeeId = useMemo<Record<string, ExplainabilityPayload>>(() => {
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

    const goalsByEmployeeId = new Map<string, TeamGoalItem[]>();
    filteredGoals.forEach((goal) => {
      const employeeId = String(goal.employeeId || "").trim();
      if (!employeeId) return;

      const list = goalsByEmployeeId.get(employeeId) || [];
      list.push(goal);
      goalsByEmployeeId.set(employeeId, list);
    });

    const payloadMap: Record<string, ExplainabilityPayload> = {};

    analyticsRows.forEach((row) => {
      const employeeGoals = goalsByEmployeeId.get(row.employeeId) || [];
      const ratedGoals = employeeGoals.filter((goal) => Number.isFinite(goal.managerFinalRating));
      const weightedGoalFactors = ratedGoals
        .slice()
        .sort((a, b) => Number(b.weightage || 0) - Number(a.weightage || 0))
        .slice(0, 4)
        .map((goal) => {
          const rating = Number(goal.managerFinalRating || 0);
          const weight = Number(goal.weightage || 0);
          const progress = Number(goal.progressPercent || 0);
          return `${goal.title}: rating ${rating.toFixed(2)} x weight ${weight}% with progress ${progress}%`;
        });

      payloadMap[row.employeeId] = {
        source: "team_analytics_weighted_formula",
        confidence: "high",
        confidenceLabel: "high",
        reason:
          row.weightedScore !== null
            ? `Score ${row.weightedScore.toFixed(2)} is computed as weighted average of finalized goal ratings for this employee in the selected filter window.`
            : "No finalized score yet because no rated goals were found for this employee in the selected filters.",
        based_on: [
          "Weighted score formula: sum(rating x weightage) / sum(weightage)",
          `Contributing goals (rated/total): ${ratedGoals.length}/${employeeGoals.length}`,
          `Average progress signal: ${row.avgProgress}%`,
          `Trend signal: ${row.trendDisplay}`,
          ...weightedGoalFactors,
        ],
        time_window:
          analyticsTimeFilter === "cycle"
            ? selectedCycleId || "selected_cycle"
            : analyticsTimeFilter,
      };
    });

    return payloadMap;
  }, [analyticsDepartmentFilter, analyticsRows, analyticsTimeFilter, employeeInfoById, selectedCycleId, teamGoals]);

  const openExplainability = useCallback(
    (row: TeamAnalyticsRow) => {
      setSelectedExplainability({
        title: `${row.employeeName} Score Explainability`,
        payload:
          explainabilityByEmployeeId[row.employeeId] || {
            source: "team_analytics_weighted_formula",
            confidence: "medium",
            reason: "Explainability details are not available for this employee row.",
            based_on: ["No contributing factors found in the current filter context."],
            time_window: analyticsTimeFilter,
          },
      });
    },
    [analyticsTimeFilter, explainabilityByEmployeeId]
  );

  const analyticsColumns = useMemo<DataTableColumn<TeamAnalyticsRow>[]>(
    () => [
      {
        key: "rank",
        header: "Rank",
        render: (_value, row) => (row.rank !== null ? `#${row.rank}` : "-"),
      },
      { key: "employeeName", header: "Employee" },
      { key: "department", header: "Department" },
      {
        key: "weightedScore",
        header: "Weighted Score",
        render: (value) => (typeof value === "number" ? value.toFixed(2) : "Not Rated"),
      },
      {
        key: "avgProgress",
        header: "Avg Progress",
        render: (value) => `${Number(value || 0)}%`,
      },
      {
        key: "ratedGoalsCount",
        header: "Rated Goals",
        render: (_value, row) => `${row.ratedGoalsCount}/${row.totalGoalsCount}`,
      },
      { key: "trendDisplay", header: "Trend" },
      {
        key: "riskLevel",
        header: "Risk Level",
        render: (value) => {
          const riskLevel = String(value || "").toLowerCase();
          const tone =
            riskLevel === "high"
              ? "bg-[var(--color-badge-danger-bg)] border-[var(--color-badge-danger-border)] text-[var(--color-text)]"
              : riskLevel === "medium"
                ? "bg-[var(--color-badge-warning-bg)] border-[var(--color-badge-warning-border)] text-[var(--color-text)]"
                : "bg-[var(--color-badge-success-bg)] border-[var(--color-badge-success-border)] text-[var(--color-text)]";

          return (
            <span className={`inline-flex items-center rounded-[var(--radius-pill)] border px-2 py-1 caption ${tone}`}>
              {riskLevel ? `${riskLevel.charAt(0).toUpperCase()}${riskLevel.slice(1)}` : "Low"}
            </span>
          );
        },
      },
      {
        key: "consistencyScore",
        header: "Consistency",
        render: (value) => (typeof value === "number" ? `${value}%` : "N/A"),
      },
      {
        key: "explainability",
        header: "Explainability",
        render: (_value, row) => (
          <Button size="sm" variant="secondary" onClick={() => openExplainability(row)}>
            Explain
          </Button>
        ),
      },
    ],
    [openExplainability]
  );

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

          <Grid cols={1} colsMd={2} colsLg={4} gap="3">
            <Card title="Average Team Score" description="Weighted average of finalized team ratings.">
              <p className="heading-lg text-[var(--color-text)]">
                {kpiSummary.averageTeamScore !== null ? kpiSummary.averageTeamScore.toFixed(2) : "N/A"}
              </p>
            </Card>
            <Card title="Top Performer Score" description="Highest weighted score in current filtered view.">
              <p className="heading-lg text-[var(--color-text)]">
                {kpiSummary.topPerformerScore !== null ? kpiSummary.topPerformerScore.toFixed(2) : "N/A"}
              </p>
            </Card>
            <Card title="At-Risk Employees" description="Score below 2.5 or declining from previous cycle.">
              <p className="heading-lg text-[var(--color-text)]">{kpiSummary.atRiskEmployeeCount}</p>
            </Card>
            <Card
              title="Improvement Rate vs Last Cycle"
              description={
                kpiSummary.previousCycleId
                  ? `Share of employees improving vs ${kpiSummary.previousCycleId}.`
                  : "Share of employees improving vs last comparable cycle."
              }
            >
              <p className="heading-lg text-[var(--color-text)]">
                {kpiSummary.improvementRate !== null ? `${kpiSummary.improvementRate.toFixed(1)}%` : "N/A"}
              </p>
            </Card>
          </Grid>

          {analyticsRatedRows.length > 0 && (
            <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="body-sm font-medium text-[var(--color-text)]">Progress Graph (Weighted Rating)</p>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setShowTrendOverlay((prev) => !prev)}
                >
                  {showTrendOverlay ? "Hide Trend Line" : "Show Trend Line"}
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="success">Excellent (&gt;=4.5)</Badge>
                <Badge variant="info">Strong (3.5-4.49)</Badge>
                <Badge variant="warning">Watch (2.5-3.49)</Badge>
                <Badge variant="danger">Critical (&lt;2.5)</Badge>
              </div>
              <div className="mt-3 overflow-x-auto">
                <div className="relative" style={{ width: `${graphMetrics.graphWidth}px`, minWidth: `${graphMetrics.graphWidth}px` }}>
                  {showTrendOverlay && analyticsRatedRows.length > 1 && (
                    <svg
                      className="pointer-events-none absolute left-0 top-6 z-10"
                      width={graphMetrics.graphWidth}
                      height={graphMetrics.plotHeight}
                      viewBox={`0 0 ${graphMetrics.graphWidth} ${graphMetrics.plotHeight}`}
                      aria-hidden="true"
                    >
                      <polyline
                        points={graphMetrics.points}
                        fill="none"
                        stroke="var(--color-primary)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {graphMetrics.points.split(" ").map((point) => {
                        const [x, y] = point.split(",");
                        return <circle key={point} cx={x} cy={y} r="2.5" fill="var(--color-primary)" />;
                      })}
                    </svg>
                  )}

                  <div className="flex items-end gap-3 pt-6">
                  {analyticsRatedRows.map((row) => {
                    const score = row.weightedScore || 0;
                    const band = getPerformanceBand(score);
                    const barHeight = Math.max(12, Math.round((score / maxAnalyticsScore) * graphMetrics.plotHeight));

                    return (
                      <div key={row.employeeId} className="flex w-24 shrink-0 flex-col items-center gap-2">
                        <p className="caption text-[var(--color-text-muted)]">{score.toFixed(2)} • {band.label}</p>
                        <div
                          className={`w-full rounded-t-[var(--radius-sm)] border ${band.tone}`}
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
            </div>
          )}

          {analyticsRows.length > 0 && (
            <DataTable
              columns={analyticsColumns}
              rows={analyticsRows}
              rowKey={(row) => row.employeeId}
              emptyMessage="No ranked team records found for the selected filters."
              maxHeight={480}
            />
          )}

          <Card
            title="AI Insights"
            description="Decision-intelligence patterns generated from /api/analytics/decision-insights."
          >
            <Stack gap="2">
              {insightsLoading && (
                <Alert
                  variant="info"
                  title="Generating insights"
                  description="Analyzing decision insights across the current ranked team."
                />
              )}
              {!insightsLoading && (
                <>
                  <Alert
                    variant="success"
                    title="Top Performers Pattern"
                    description={aiInsightsSummary.topPerformersPattern}
                  />
                  <Alert
                    variant="warning"
                    title="Declining Trends"
                    description={aiInsightsSummary.decliningTrends}
                  />
                  <Alert
                    variant="info"
                    title="Team Performance Summary"
                    description={aiInsightsSummary.teamPerformanceSummary}
                  />
                </>
              )}
            </Stack>
          </Card>

          <Card
            title="Risk & Alerts"
            description="Employees flagged for declining trend, low rating, or missed check-ins."
          >
            <Stack gap="2">
              {riskAlerts.length === 0 && (
                <Alert
                  variant="success"
                  title="No active risk alerts"
                  description="No employees currently match the configured risk conditions in this filtered view."
                />
              )}

              {riskAlerts.map((item) => {
                const alertVariant = item.riskLevel === "high" ? "error" : "warning";

                return (
                  <div key={item.employeeId} className="flex flex-col gap-2">
                    <Alert
                      variant={alertVariant}
                      title={`${item.employeeName} • ${item.department}`}
                      description={`Risk level: ${item.riskLevel.toUpperCase()}`}
                    />
                    <div className="flex flex-wrap items-center gap-1 px-1">
                      {item.decliningTrend && <Badge variant="warning">Declining Trend</Badge>}
                      {item.lowRating && <Badge variant="danger">Low Rating &lt; 2.5</Badge>}
                      {item.missedCheckIns > 0 && (
                        <Badge variant="info">Missed Check-ins: {item.missedCheckIns}</Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </Stack>
          </Card>
        </Stack>
      </Card>

      <ExplainabilityDrawer
        open={Boolean(selectedExplainability)}
        onClose={() => setSelectedExplainability(null)}
        title={selectedExplainability?.title || "Employee Score Explainability"}
        payload={selectedExplainability?.payload || null}
      />
    </Stack>
  );
}

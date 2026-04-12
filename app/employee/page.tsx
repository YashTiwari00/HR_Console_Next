"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Container, Grid, Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Card } from "@/src/components/ui";
import {
  CheckInItem,
  DecisionInsightsData,
  EmployeeTrajectoryData,
  fetchCheckIns,
  fetchDecisionInsights,
  fetchEmployeeTrajectory,
  fetchGoals,
  fetchMe,
  formatDate,
  GoalItem,
  goalStatusVariant,
} from "@/app/employee/_lib/pmsClient";

const TRAJECTORY_CARD_ENABLED =
  String(process.env.NEXT_PUBLIC_ENABLE_EMPLOYEE_TRAJECTORY || "").trim().toLowerCase() === "true";

function trajectoryVariant(trend: EmployeeTrajectoryData["trendLabel"]) {
  if (trend === "improving") return "success" as const;
  if (trend === "declining") return "danger" as const;
  if (trend === "stable") return "info" as const;
  return "default" as const;
}

function trajectoryLabel(trend: EmployeeTrajectoryData["trendLabel"]) {
  if (trend === "improving") return "Improving";
  if (trend === "declining") return "Declining";
  if (trend === "stable") return "Stable";
  return "New";
}

function toSafeDeltaPercent(value: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(2));
}

function formatDateTime(value?: string) {
  if (!value) return "--";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "--";
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function EmployeePage() {
  const router = useRouter();
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [checkIns, setCheckIns] = useState<CheckInItem[]>([]);
  const [businessImpactBadge, setBusinessImpactBadge] = useState<"Low" | "Medium" | "High" | null>(null);
  const [businessImpactLinkedCount, setBusinessImpactLinkedCount] = useState(0);
  const [businessImpactLoading, setBusinessImpactLoading] = useState(false);
  const [businessImpactError, setBusinessImpactError] = useState("");
  const [trajectory, setTrajectory] = useState<EmployeeTrajectoryData | null>(null);
  const [streakData, setStreakData] = useState<{ streak: number; cycleNames: string[] }>({
    streak: 0,
    cycleNames: [],
  });
  const [streakLoading, setStreakLoading] = useState(true);
  const [decisionInsights, setDecisionInsights] = useState<DecisionInsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const gamificationEnabled =
    String(process.env.NEXT_PUBLIC_ENABLE_GAMIFICATION || "").trim().toLowerCase() === "true";

  function getPreferredCycleId(goalItems: GoalItem[]) {
    return String(goalItems.find((item) => String(item.cycleId || "").trim())?.cycleId || "").trim();
  }

  function riskBadgeVariant(level: DecisionInsightsData["overallRiskLevel"]) {
    if (level === "high") return "danger" as const;
    if (level === "medium") return "warning" as const;
    return "success" as const;
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    setBusinessImpactError("");

    try {
      const [nextGoals, nextCheckIns, nextTrajectory, me] = await Promise.all([
        fetchGoals(),
        fetchCheckIns(),
        TRAJECTORY_CARD_ENABLED ? fetchEmployeeTrajectory() : Promise.resolve(null),
        fetchMe(),
      ]);
      setGoals(nextGoals);
      setCheckIns(nextCheckIns);
      setTrajectory(nextTrajectory);

      const approvedGoals = nextGoals.filter(
        (goal) => goal.status === "approved" || goal.status === "closed"
      );

      if (String(process.env.NEXT_PUBLIC_ENABLE_CONTRIBUTION_BADGE) === "true") {
        if (approvedGoals.length === 0) {
          setBusinessImpactBadge(null);
          setBusinessImpactLinkedCount(0);
        } else {
          setBusinessImpactLoading(true);

          const settled = await Promise.allSettled(
            approvedGoals.map((goal) => fetch(`/api/goals/${encodeURIComponent(goal.$id)}/lineage`))
          );

          const rank: Record<"Low" | "Medium" | "High", number> = {
            Low: 1,
            Medium: 2,
            High: 3,
          };

          let highestBadge: "Low" | "Medium" | "High" | null = null;
          let linkedCount = 0;

          for (const item of settled) {
            if (item.status !== "fulfilled") continue;
            if (!item.value.ok) continue;

            try {
              const payload = (await item.value.json()) as {
                overallContributionBadge?: "Low" | "Medium" | "High";
              };
              const badge = payload?.overallContributionBadge;
              if (badge === "Low" || badge === "Medium" || badge === "High") {
                linkedCount += 1;
                if (!highestBadge || rank[badge] > rank[highestBadge]) {
                  highestBadge = badge;
                }
              }
            } catch {
              // Ignore malformed lineage payload and continue aggregation.
            }
          }

          setBusinessImpactBadge(highestBadge);
          setBusinessImpactLinkedCount(linkedCount);

          if (linkedCount === 0) {
            setBusinessImpactError("Could not load contribution data");
          }

          setBusinessImpactLoading(false);
        }
      }

      const employeeId = String(me?.profile?.$id || me?.user?.$id || "").trim();
      const cycleId = getPreferredCycleId(nextGoals);

      if (employeeId && cycleId) {
        const nextInsights = await fetchDecisionInsights({ employeeId, cycleId });
        setDecisionInsights(nextInsights);
      } else {
        setDecisionInsights(null);
      }

      if (gamificationEnabled) {
        setStreakLoading(true);
        try {
          const streakResponse = await fetch("/api/milestones/streak", { cache: "no-store" });
          if (!streakResponse.ok) {
            throw new Error("Failed to load streak");
          }

          const streakPayload = (await streakResponse.json()) as {
            streak?: unknown;
            cycleNames?: unknown;
          };

          setStreakData({
            streak: Number(streakPayload?.streak) || 0,
            cycleNames: Array.isArray(streakPayload?.cycleNames)
              ? streakPayload.cycleNames.filter((name): name is string => typeof name === "string")
              : [],
          });
        } catch {
          setStreakData({ streak: 0, cycleNames: [] });
        } finally {
          setStreakLoading(false);
        }
      } else {
        setStreakData({ streak: 0, cycleNames: [] });
        setStreakLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load employee overview.");
      setBusinessImpactLoading(false);
    } finally {
      setLoading(false);
    }
  }, [gamificationEnabled]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const approvedCount = useMemo(
    () => goals.filter((goal) => goal.status === "approved" || goal.status === "closed").length,
    [goals]
  );

  const averageProgress = useMemo(() => {
    if (goals.length === 0) return 0;
    const total = goals.reduce((sum, goal) => sum + (goal.progressPercent || 0), 0);
    return Math.round(total / goals.length);
  }, [goals]);

  const approvalRate = useMemo(() => {
    if (goals.length === 0) return 0;
    return Math.round((approvedCount / goals.length) * 100);
  }, [approvedCount, goals.length]);

  const safeTrajectoryDelta = useMemo(
    () => toSafeDeltaPercent(trajectory?.trendDeltaPercent ?? 0),
    [trajectory]
  );

  const upcomingCheckIns = useMemo(
    () =>
      checkIns
        .filter((item) => item.status === "planned")
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
        .slice(0, 3),
    [checkIns]
  );

  const recentCheckIns = useMemo(
    () =>
      checkIns
        .filter((item) => item.status === "completed")
        .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
        .slice(0, 3),
    [checkIns]
  );

  const completedCheckInsCount = useMemo(
    () => checkIns.filter((item) => item.status === "completed").length,
    [checkIns]
  );

  const reviewCompleted = useMemo(
    () => goals.some((goal) => goal.status === "closed"),
    [goals]
  );

  const journeySteps = useMemo(() => {
    const goalCreatedState = goals.length > 0 ? "complete" : "not_started";
    const goalApprovedState = approvedCount > 0 ? "complete" : goals.length > 0 ? "pending" : "not_started";
    const checkInsState =
      completedCheckInsCount > 0
        ? "complete"
        : upcomingCheckIns.length > 0 || checkIns.length > 0
          ? "pending"
          : "not_started";
    const reviewState = reviewCompleted
      ? "complete"
      : approvedCount > 0 || completedCheckInsCount > 0
        ? "pending"
        : "not_started";

    return [
      {
        label: "Goal Created",
        state: goalCreatedState,
        detail: goals.length > 0 ? `${goals.length} goal(s) created` : "No goals yet",
      },
      {
        label: "Goal Approved",
        state: goalApprovedState,
        detail: approvedCount > 0 ? `${approvedCount} approved` : "Awaiting first approval",
      },
      {
        label: "Check-ins",
        state: checkInsState,
        detail:
          completedCheckInsCount > 0
            ? `${completedCheckInsCount} completed`
            : upcomingCheckIns.length > 0
              ? `${upcomingCheckIns.length} upcoming`
              : "No check-ins yet",
      },
      {
        label: reviewCompleted ? "Review Completed" : "Review Pending",
        state: reviewState,
        detail: reviewCompleted ? "Cycle review submitted" : "Complete check-ins to move toward final review",
      },
    ] as const;
  }, [
    goals.length,
    approvedCount,
    completedCheckInsCount,
    upcomingCheckIns.length,
    checkIns.length,
    reviewCompleted,
  ]);

  const coachingSummary = useMemo(() => {
    if (!decisionInsights) return "";
    const explainReason = String(decisionInsights.explainability?.reason || "").trim();
    if (explainReason) return explainReason;

    const riskReason = String(decisionInsights.risks?.[0]?.reason || "").trim();
    if (riskReason) return riskReason;

    return "Keep momentum by focusing on the next high-impact action this cycle.";
  }, [decisionInsights]);

  return (
    <Container maxWidth="xl">
      <Stack gap="4">
        <PageHeader
          title="Employee Dashboard"
          subtitle="Track your goals, progress, and performance journey"
          actions={
            <Button variant="secondary" onClick={loadData} disabled={loading}>
              Refresh
            </Button>
          }
        />

        {error && <Alert variant="error" title="Unable to load" description={error} onDismiss={() => setError("")} />}

        <Grid cols={1} colsMd={3} gap="3">
          <Card className="border-[color-mix(in_srgb,var(--color-border)_55%,transparent)] bg-[linear-gradient(165deg,var(--color-surface)_0%,var(--color-surface-muted)_100%)] shadow-[var(--shadow-sm)]">
            <Stack gap="1" className="py-[var(--space-1)]">
              <p className="caption text-[var(--color-text-muted)]">Total Goals</p>
              <p className="heading-xl text-[var(--color-text)]">{loading ? "..." : goals.length}</p>
              <p className="caption">In your current dashboard view</p>
            </Stack>
          </Card>
          <Card className="border-[color-mix(in_srgb,var(--color-border)_55%,transparent)] bg-[linear-gradient(165deg,var(--color-surface)_0%,var(--color-surface-muted)_100%)] shadow-[var(--shadow-sm)]">
            <Stack gap="1" className="py-[var(--space-1)]">
              <p className="caption text-[var(--color-text-muted)]">Approved Goals</p>
              <p className="heading-xl text-[var(--color-text)]">{loading ? "..." : approvedCount}</p>
              <p className="caption">{loading ? "..." : `${approvalRate}% approval rate`}</p>
            </Stack>
          </Card>
          <Card className="border-[color-mix(in_srgb,var(--color-border)_55%,transparent)] bg-[linear-gradient(165deg,var(--color-surface)_0%,var(--color-surface-muted)_100%)] shadow-[var(--shadow-sm)]">
            <Stack gap="1" className="py-[var(--space-1)]">
              <p className="caption text-[var(--color-text-muted)]">Average Progress</p>
              <p className="heading-xl text-[var(--color-text)]">{loading ? "..." : `${averageProgress}%`}</p>
              <div className="flex items-center gap-[var(--space-2)]">
                <p className="caption">Across all goals</p>
                {!loading && trajectory && TRAJECTORY_CARD_ENABLED && safeTrajectoryDelta !== 0 && (
                  <Badge variant={safeTrajectoryDelta > 0 ? "success" : "danger"}>
                    {safeTrajectoryDelta > 0 ? "Up" : "Down"} {Math.abs(safeTrajectoryDelta).toFixed(2)}%
                  </Badge>
                )}
              </div>
            </Stack>
          </Card>
        </Grid>

        <Card title="What should you do next?" description="Choose one focused action to move your cycle forward.">
          <Stack gap="2">
            <Button type="button" className="w-full justify-start" onClick={() => router.push("/employee/goals")}>
              <Stack gap="1" align="start">
                <span>Create Draft Goal</span>
                <span className="caption text-[var(--color-text-muted)]">Start your next objective with outcomes and ownership.</span>
              </Stack>
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start border border-[color-mix(in_srgb,var(--color-border)_55%,transparent)]"
              onClick={() => router.push("/employee/progress")}
            >
              <Stack gap="1" align="start">
                <span>Submit Progress Update</span>
                <span className="caption text-[var(--color-text-muted)]">Capture latest progress signals and blockers.</span>
              </Stack>
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start border border-[color-mix(in_srgb,var(--color-border)_55%,transparent)]"
              onClick={() => router.push("/employee/check-ins")}
            >
              <Stack gap="1" align="start">
                <span>Plan Check-in</span>
                <span className="caption text-[var(--color-text-muted)]">Schedule your next manager conversation.</span>
              </Stack>
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start border border-[color-mix(in_srgb,var(--color-border)_55%,transparent)]"
              onClick={() => router.push("/employee/timeline")}
            >
              <Stack gap="1" align="start">
                <span>View Timeline</span>
                <span className="caption text-[var(--color-text-muted)]">Review deadlines and upcoming cycle milestones.</span>
              </Stack>
            </Button>
          </Stack>
        </Card>

        <Grid cols={1} colsLg={2} gap="3">
          <Card title="My Goals" description="Track current goal status and progress.">
            <Stack gap="2">
              {!loading && goals.length === 0 && <p className="caption">No goals yet.</p>}
              {goals.slice(0, 5).map((goal) => {
                const progress = Math.max(0, Math.min(100, Number(goal.progressPercent || 0)));
                const dueDateRaw =
                  (goal as GoalItem & { dueDate?: string; dueAt?: string; targetDate?: string; deadlineAt?: string })
                    .dueDate ||
                  (goal as GoalItem & { dueDate?: string; dueAt?: string; targetDate?: string; deadlineAt?: string })
                    .dueAt ||
                  (goal as GoalItem & { dueDate?: string; dueAt?: string; targetDate?: string; deadlineAt?: string })
                    .targetDate ||
                  (goal as GoalItem & { dueDate?: string; dueAt?: string; targetDate?: string; deadlineAt?: string })
                    .deadlineAt ||
                  "";
                const dueDate = dueDateRaw ? formatDate(dueDateRaw) : "";
                const normalizedStatus =
                  goal.status === "approved" || goal.status === "submitted" || goal.status === "needs_changes"
                    ? goal.status
                    : "submitted";

                return (
                  <Stack
                    key={goal.$id}
                    gap="1"
                    className="rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--color-border)_55%,transparent)] bg-[var(--color-surface-muted)] px-[var(--space-3)] py-[var(--space-2)]"
                  >
                    <div className="flex items-center justify-between gap-[var(--space-2)]">
                      <p className="body-sm font-medium text-[var(--color-text)]">{goal.title}</p>
                      <Badge variant={goalStatusVariant(goal.status)}>{normalizedStatus}</Badge>
                    </div>
                    <div className="h-[8px] rounded-[var(--radius-pill)] bg-[color-mix(in_srgb,var(--color-primary)_18%,var(--color-surface))]">
                      <div
                        className="h-full rounded-[var(--radius-pill)] bg-[var(--color-primary)] transition-[width] duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-[var(--space-2)]">
                      <p className="caption">{progress}% complete</p>
                      {dueDate && <p className="caption">Due: {dueDate}</p>}
                    </div>
                  </Stack>
                );
              })}
            </Stack>
          </Card>

          <Card title="Check-ins" description="Upcoming plans and recently completed sessions.">
            <Stack gap="3">
              <Stack gap="2">
                <p className="caption text-[var(--color-text-muted)]">Upcoming Check-ins</p>
                {!loading && upcomingCheckIns.length === 0 && <p className="caption">No upcoming check-ins.</p>}
                {upcomingCheckIns.map((item) => (
                  <div
                    key={`upcoming-${item.$id}`}
                    className="rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--color-border)_55%,transparent)] bg-[var(--color-surface-muted)] px-[var(--space-3)] py-[var(--space-2)]"
                  >
                    <div className="flex items-center justify-between gap-[var(--space-2)]">
                      <Stack gap="1" className="min-w-0">
                        <p className="body-sm text-[var(--color-text)]">{formatDateTime(item.scheduledAt)}</p>
                        <p className="caption">Planned session</p>
                      </Stack>
                      <div className="flex items-center gap-[var(--space-2)]">
                        <Badge variant="info">planned</Badge>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => router.push("/employee/check-ins")}
                        >
                          Join
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </Stack>

              <Stack gap="2">
                <p className="caption text-[var(--color-text-muted)]">Recent Check-ins</p>
                {!loading && recentCheckIns.length === 0 && <p className="caption">No recent check-ins.</p>}
                {recentCheckIns.map((item) => (
                  <div
                    key={`recent-${item.$id}`}
                    className="rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--color-border)_55%,transparent)] bg-[var(--color-surface-muted)] px-[var(--space-3)] py-[var(--space-2)]"
                  >
                    <div className="flex items-center justify-between gap-[var(--space-2)]">
                      <Stack gap="1" className="min-w-0">
                        <p className="body-sm text-[var(--color-text)]">{formatDateTime(item.scheduledAt)}</p>
                        <p className="caption">Completed session</p>
                      </Stack>
                      <div className="flex items-center gap-[var(--space-2)]">
                        <Badge variant="success">completed</Badge>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => router.push("/employee/check-ins")}
                        >
                          View
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </Stack>
            </Stack>
          </Card>
        </Grid>

        <Card title="Your Journey" description="A single performance timeline from goal setup to cycle review.">
          <Stack gap="2">
            {journeySteps.map((step, index) => {
              const isLast = index === journeySteps.length - 1;
              const badgeVariant =
                step.state === "complete" ? "success" : step.state === "pending" ? "warning" : "default";

              return (
                <div key={step.label} className="flex items-start gap-[var(--space-3)]">
                  <div className="flex flex-col items-center">
                    <span
                      className={
                        step.state === "complete"
                          ? "mt-[6px] block h-[8px] w-[8px] rounded-full bg-[var(--color-success)]"
                          : step.state === "pending"
                            ? "mt-[6px] block h-[8px] w-[8px] rounded-full bg-[var(--color-warning)]"
                            : "mt-[6px] block h-[8px] w-[8px] rounded-full bg-[var(--color-text-muted)]"
                      }
                    />
                    {!isLast && <span className="mt-[var(--space-1)] h-[20px] w-px bg-[var(--color-border)]" />}
                  </div>

                  <div className="flex min-w-0 flex-1 items-start justify-between gap-[var(--space-2)] pb-[var(--space-1)]">
                    <Stack gap="1" className="min-w-0">
                      <p className="body-sm font-medium text-[var(--color-text)]">{step.label}</p>
                      <p className="caption">{step.detail}</p>
                    </Stack>
                    <Badge variant={badgeVariant}>{step.state === "not_started" ? "Not Started" : step.state === "pending" ? "Pending" : "Completed"}</Badge>
                  </div>
                </div>
              );
            })}
          </Stack>
        </Card>

        <Card title="AI Insights" description="A coaching recommendation to help you move forward this cycle.">
          {loading && <p className="caption">Loading AI insights...</p>}

          {!loading && !decisionInsights && (
            <p className="caption">AI insights are unavailable until enough cycle data is present.</p>
          )}

          {!loading && decisionInsights && (
            <Stack gap="3">
              <div className="flex flex-wrap items-center gap-[var(--space-2)]">
                <Badge variant={riskBadgeVariant(decisionInsights.overallRiskLevel)}>
                  Risk: {String(decisionInsights.overallRiskLevel || "low").toUpperCase()}
                </Badge>
                <p className="caption">Cycle: {decisionInsights.cycleId}</p>
              </div>

              <div className="rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--color-border)_55%,transparent)] bg-[var(--color-surface-muted)] px-[var(--space-3)] py-[var(--space-3)]">
                <Stack gap="1">
                  <p className="caption text-[var(--color-text-muted)]">Recommended next step</p>
                  <p className="body-sm font-medium text-[var(--color-text)]">{decisionInsights.topRecommendation}</p>
                </Stack>
              </div>

              <p className="caption">{coachingSummary}</p>

              <details className="rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--color-border)_55%,transparent)] bg-[var(--color-surface-muted)] px-[var(--space-3)] py-[var(--space-2)]">
                <summary className="body-sm cursor-pointer font-medium text-[var(--color-text)]">Why this?</summary>
                <Stack gap="1" className="mt-[var(--space-2)]">
                  {decisionInsights.explainability?.reason && (
                    <p className="caption">{decisionInsights.explainability.reason}</p>
                  )}
                  {decisionInsights.explainability?.confidenceLabel && (
                    <p className="caption">Confidence: {decisionInsights.explainability.confidenceLabel}</p>
                  )}
                  {decisionInsights.explainability?.timeWindow && (
                    <p className="caption">Window: {decisionInsights.explainability.timeWindow}</p>
                  )}
                  {decisionInsights.explainability?.time_window && (
                    <p className="caption">Window: {decisionInsights.explainability.time_window}</p>
                  )}
                  {Array.isArray(decisionInsights.explainability?.based_on) &&
                    decisionInsights.explainability?.based_on.length > 0 && (
                      <ul className="pl-[var(--space-3)] text-[var(--color-text-muted)]">
                        {decisionInsights.explainability.based_on.slice(0, 3).map((item) => (
                          <li key={item} className="caption list-disc">{item}</li>
                        ))}
                      </ul>
                    )}
                </Stack>
              </details>
            </Stack>
          )}
        </Card>
      </Stack>
    </Container>
  );
}

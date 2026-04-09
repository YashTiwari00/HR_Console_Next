"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Grid, Stack } from "@/src/components/layout";
import { ExplainabilityDrawer, PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Card, ContributionBadge } from "@/src/components/ui";
import StreakBadge from "@/src/components/ui/StreakBadge";
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
  const [insightsExplainabilityOpen, setInsightsExplainabilityOpen] = useState(false);
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

  const safeTrajectoryDelta = useMemo(
    () => toSafeDeltaPercent(trajectory?.trendDeltaPercent ?? 0),
    [trajectory]
  );

  return (
    <Stack gap="4">
      <PageHeader
        title="Employee Dashboard"
        subtitle="A quick view of goals, progress, check-ins, and timeline status."
        actions={
          <Button variant="secondary" onClick={loadData} disabled={loading}>
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="error" title="Unable to load" description={error} onDismiss={() => setError("")} />}

      <Grid cols={1} colsMd={3} gap="3">
        <Card title="Total Goals" className="bg-[linear-gradient(160deg,var(--color-surface)_0%,var(--color-surface-muted)_100%)]">
          <p className="heading-xl">{loading ? "..." : goals.length}</p>
        </Card>
        <Card title="Approved Goals" className="bg-[linear-gradient(160deg,var(--color-surface)_0%,var(--color-surface-muted)_100%)]">
          <p className="heading-xl">{loading ? "..." : approvedCount}</p>
        </Card>
        <Card title="Average Progress" className="bg-[linear-gradient(160deg,var(--color-surface)_0%,var(--color-surface-muted)_100%)]">
          <p className="heading-xl">{loading ? "..." : `${averageProgress}%`}</p>
        </Card>

        {process.env.NEXT_PUBLIC_ENABLE_GAMIFICATION === "true" && (
          <Card title="Check-in Streak" className="bg-[linear-gradient(160deg,var(--color-surface)_0%,var(--color-surface-muted)_100%)]">
            <StreakBadge streak={streakData.streak} cycleNames={streakData.cycleNames} loading={streakLoading} />
          </Card>
        )}

        {(() => {
          if (process.env.NEXT_PUBLIC_ENABLE_CONTRIBUTION_BADGE !== "true") return null;

          return (
            <Card title="Business Impact" className="bg-[linear-gradient(160deg,var(--color-surface)_0%,var(--color-surface-muted)_100%)]">
              {loading || businessImpactLoading ? (
                <p className="heading-xl">...</p>
              ) : businessImpactBadge ? (
                <div className="space-y-2">
                  <ContributionBadge
                    badge={businessImpactBadge}
                    contributionPercent={0}
                    size="lg"
                  />
                  <p className="text-xs text-[var(--color-text-muted)]">Across {businessImpactLinkedCount} linked goals</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {businessImpactError && (
                    <p className="text-xs text-[var(--color-text-muted)]">Could not load contribution data</p>
                  )}
                  <p className="text-xs text-[var(--color-text-muted)]">No linked targets yet</p>
                </div>
              )}
            </Card>
          );
        })()}
      </Grid>

      {TRAJECTORY_CARD_ENABLED && (
        <Card
          title="Performance Trajectory"
          description="Last 3 cycle scores and direction."
        >
          {loading && <p className="caption">Loading trajectory...</p>}

          {!loading && !trajectory && <p className="caption">Trajectory unavailable right now.</p>}

          {!loading && trajectory && (
            <Stack gap="2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={trajectoryVariant(trajectory.trendLabel)}>
                  {trajectoryLabel(trajectory.trendLabel)}
                </Badge>
                <p className="caption">
                  Delta: {safeTrajectoryDelta > 0 ? "+" : ""}
                  {safeTrajectoryDelta.toFixed(2)}%
                </p>
              </div>

              {trajectory.cycles.length === 0 && (
                <p className="caption">No closed cycle score history yet.</p>
              )}

              {trajectory.cycles.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-3">
                  {trajectory.cycles.map((point) => (
                    <div
                      key={`${point.cycleId}-${point.computedAt || "na"}`}
                      className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2"
                    >
                      <p className="caption">{point.cycleName || point.cycleId}</p>
                      <p className="body-sm font-medium text-[var(--color-text)]">
                        {point.scoreX100 === null ? "NA" : `${(point.scoreX100 / 100).toFixed(2)} / 5.00`}
                      </p>
                      <p className="caption">{point.scoreLabel || "No label"}</p>
                    </div>
                  ))}
                </div>
              )}
            </Stack>
          )}
        </Card>
      )}

      <Card title="AI Insights" description="Decision intelligence based on goals, progress, check-ins, and AOP alignment.">
        {loading && <p className="caption">Loading AI insights...</p>}

        {!loading && !decisionInsights && (
          <p className="caption">AI insights are unavailable until enough cycle data is present.</p>
        )}

        {!loading && decisionInsights && (
          <Stack gap="2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={riskBadgeVariant(decisionInsights.overallRiskLevel)}>
                Risk: {String(decisionInsights.overallRiskLevel || "low").toUpperCase()}
              </Badge>
              <p className="caption">Cycle: {decisionInsights.cycleId}</p>
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

      <ExplainabilityDrawer
        open={insightsExplainabilityOpen}
        onClose={() => setInsightsExplainabilityOpen(false)}
        payload={decisionInsights?.explainability || null}
        title="Why this suggestion?"
      />

      <Grid cols={1} colsLg={2} gap="3">
        <Card title="Feature Pages" description="Use focused pages for each workflow.">
          <Stack gap="2">
            <Link className="body-sm rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-[var(--color-primary)] hover:bg-[var(--color-surface-muted)]" href="/employee/goals">
              Open Goals Workspace
            </Link>
            <Link className="body-sm rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-[var(--color-primary)] hover:bg-[var(--color-surface-muted)]" href="/employee/progress">
              Open Progress Updates
            </Link>
            <Link className="body-sm rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-[var(--color-primary)] hover:bg-[var(--color-surface-muted)]" href="/employee/check-ins">
              Open Check-ins
            </Link>
            <Link className="body-sm rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-[var(--color-primary)] hover:bg-[var(--color-surface-muted)]" href="/employee/meetings">
              Open Meetings
            </Link>
            <Link className="body-sm rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-[var(--color-primary)] hover:bg-[var(--color-surface-muted)]" href="/employee/meeting-calendar">
              Open Meeting Calendar Dashboard
            </Link>
            <Link className="body-sm rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-[var(--color-primary)] hover:bg-[var(--color-surface-muted)]" href="/employee/timeline">
              Open Cycle Timeline
            </Link>
          </Stack>
        </Card>

        <Card title="Recent Goals" description="Latest goal states at a glance.">
          <Stack gap="2">
            {!loading && goals.length === 0 && <p className="caption">No goals yet.</p>}
            {goals.slice(0, 4).map((goal) => (
              <div key={goal.$id} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="body-sm text-[var(--color-text)]">{goal.title}</p>
                  <Badge variant={goalStatusVariant(goal.status)}>{goal.status}</Badge>
                </div>
              </div>
            ))}
          </Stack>
        </Card>
      </Grid>

      <Card title="Upcoming Check-ins" description="Most recent planned sessions.">
        <Stack gap="2">
          {!loading && checkIns.length === 0 && <p className="caption">No check-ins yet.</p>}
          {checkIns.slice(0, 5).map((item) => (
            <div key={item.$id} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="body-sm text-[var(--color-text)]">{formatDate(item.scheduledAt)}</p>
                <Badge variant={item.status === "completed" ? "success" : "info"}>{item.status}</Badge>
              </div>
            </div>
          ))}
        </Stack>
      </Card>

      {process.env.NEXT_PUBLIC_ENABLE_GROWTH_HUB === "true" && (
        <Card className="rounded-xl border border-[var(--color-border)] bg-[linear-gradient(135deg,var(--color-primary-subtle),var(--color-surface-raised))]">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-base font-semibold text-[var(--color-text)]">Explore your growth pathway</h3>
              <p className="text-xs text-[var(--color-text-muted)]">
                See your career trajectory, skill gaps, and readiness for next steps.
              </p>
            </div>

            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => router.push('/employee/growth')}
            >
              View My Growth -&gt;
            </Button>
          </div>
        </Card>
      )}
    </Stack>
  );
}
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Grid, Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Card } from "@/src/components/ui";
import {
  CheckInItem,
  EmployeeTrajectoryData,
  fetchCheckIns,
  fetchEmployeeTrajectory,
  fetchGoals,
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
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [checkIns, setCheckIns] = useState<CheckInItem[]>([]);
  const [trajectory, setTrajectory] = useState<EmployeeTrajectoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [nextGoals, nextCheckIns, nextTrajectory] = await Promise.all([
        fetchGoals(),
        fetchCheckIns(),
        TRAJECTORY_CARD_ENABLED ? fetchEmployeeTrajectory() : Promise.resolve(null),
      ]);
      setGoals(nextGoals);
      setCheckIns(nextCheckIns);
      setTrajectory(nextTrajectory);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load employee overview.");
    } finally {
      setLoading(false);
    }
  }, []);

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
    </Stack>
  );
}
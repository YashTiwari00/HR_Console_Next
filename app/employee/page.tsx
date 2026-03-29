"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Grid, Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Card } from "@/src/components/ui";
import {
  CheckInItem,
  fetchCheckIns,
  fetchGoals,
  formatDate,
  GoalItem,
  goalStatusVariant,
} from "@/app/employee/_lib/pmsClient";

export default function EmployeePage() {
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [checkIns, setCheckIns] = useState<CheckInItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [nextGoals, nextCheckIns] = await Promise.all([fetchGoals(), fetchCheckIns()]);
      setGoals(nextGoals);
      setCheckIns(nextCheckIns);
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
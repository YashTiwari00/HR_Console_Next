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
  fetchProgressUpdates,
  formatDate,
  GoalItem,
  goalStatusVariant,
  ProgressUpdateItem,
} from "@/app/employee/_lib/pmsClient";

export default function ManagerPage() {
  const [myGoals, setMyGoals] = useState<GoalItem[]>([]);
  const [teamGoals, setTeamGoals] = useState<GoalItem[]>([]);
  const [myCheckIns, setMyCheckIns] = useState<CheckInItem[]>([]);
  const [teamCheckIns, setTeamCheckIns] = useState<CheckInItem[]>([]);
  const [myUpdates, setMyUpdates] = useState<ProgressUpdateItem[]>([]);
  const [teamUpdates, setTeamUpdates] = useState<ProgressUpdateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [nextMyGoals, nextTeamGoals, nextMyCheckIns, nextTeamCheckIns, nextMyUpdates, nextTeamUpdates] =
        await Promise.all([
          fetchGoals("self"),
          fetchGoals("team"),
          fetchCheckIns("self"),
          fetchCheckIns("team"),
          fetchProgressUpdates(undefined, "self"),
          fetchProgressUpdates(undefined, "team"),
        ]);

      setMyGoals(nextMyGoals);
      setTeamGoals(nextTeamGoals);
      setMyCheckIns(nextMyCheckIns);
      setTeamCheckIns(nextTeamCheckIns);
      setMyUpdates(nextMyUpdates);
      setTeamUpdates(nextTeamUpdates);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load manager dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const myAvgProgress = useMemo(() => {
    if (myGoals.length === 0) return 0;
    const total = myGoals.reduce((sum, goal) => sum + (goal.progressPercent || 0), 0);
    return Math.round(total / myGoals.length);
  }, [myGoals]);

  const teamAvgProgress = useMemo(() => {
    if (teamGoals.length === 0) return 0;
    const total = teamGoals.reduce((sum, goal) => sum + (goal.progressPercent || 0), 0);
    return Math.round(total / teamGoals.length);
  }, [teamGoals]);

  return (
    <Stack gap="4">
      <PageHeader
        title="Manager Dashboard"
        subtitle="Track your own journey and your team performance in one place."
        actions={
          <Button variant="secondary" onClick={loadDashboard} disabled={loading}>
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="error" title="Unable to load" description={error} onDismiss={() => setError("")} />}

      <Grid cols={1} colsMd={3} gap="3">
        <Card title="My Goals">
          <p className="heading-xl">{loading ? "..." : myGoals.length}</p>
        </Card>
        <Card title="My Average Progress">
          <p className="heading-xl">{loading ? "..." : `${myAvgProgress}%`}</p>
        </Card>
        <Card title="My Check-ins">
          <p className="heading-xl">{loading ? "..." : myCheckIns.length}</p>
        </Card>
      </Grid>

      <Grid cols={1} colsMd={3} gap="3">
        <Card title="Team Goals">
          <p className="heading-xl">{loading ? "..." : teamGoals.length}</p>
        </Card>
        <Card title="Team Average Progress">
          <p className="heading-xl">{loading ? "..." : `${teamAvgProgress}%`}</p>
        </Card>
        <Card title="Team Updates Logged">
          <p className="heading-xl">{loading ? "..." : teamUpdates.length}</p>
        </Card>
      </Grid>

      <Grid cols={1} colsLg={2} gap="3">
        <Card title="Manager Workspaces" description="Self-service and team operations.">
          <Stack gap="2">
            <p className="caption">My updates logged: {loading ? "..." : myUpdates.length}</p>
            <Link className="body-sm text-[var(--color-primary)] hover:underline" href="/manager/goals">
              Open My Goals Workspace
            </Link>
            <Link className="body-sm text-[var(--color-primary)] hover:underline" href="/manager/progress">
              Open My Progress Updates
            </Link>
            <Link className="body-sm text-[var(--color-primary)] hover:underline" href="/manager/team-progress">
              Open Team Progress Updates
            </Link>
            <Link className="body-sm text-[var(--color-primary)] hover:underline" href="/manager/check-ins">
              Open My Check-ins
            </Link>
            <Link className="body-sm text-[var(--color-primary)] hover:underline" href="/manager/timeline">
              Open My Cycle Timeline
            </Link>
            <Link className="body-sm text-[var(--color-primary)] hover:underline" href="/manager/team-check-ins">
              Open Team Check-ins
            </Link>
            <Link className="body-sm text-[var(--color-primary)] hover:underline" href="/manager/approvals">
              Open Approval Queue
            </Link>
          </Stack>
        </Card>

        <Card title="My Recent Goals" description="Your latest goal statuses.">
          <Stack gap="2">
            {!loading && myGoals.length === 0 && <p className="caption">No goals yet.</p>}
            {myGoals.slice(0, 4).map((goal) => (
              <div key={goal.$id} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="body-sm text-[var(--color-text)]">{goal.title}</p>
                  <Badge variant={goalStatusVariant(goal.status)}>{goal.status}</Badge>
                </div>
              </div>
            ))}
          </Stack>
        </Card>
      </Grid>

      <Card title="Team Upcoming Check-ins" description="Planned check-ins for your direct team.">
        <Stack gap="3">
          {!loading && teamCheckIns.length === 0 && <p className="caption">No team check-ins yet.</p>}
          {teamCheckIns.slice(0, 5).map((item) => (
            <div key={item.$id} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="body-sm text-[var(--color-text)]">{formatDate(item.scheduledAt)}</p>
                <Badge variant={item.status === "completed" ? "success" : "info"}>{item.status}</Badge>
              </div>
              {item.employeeId && <p className="caption mt-1">Employee: {item.employeeId}</p>}
            </div>
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}

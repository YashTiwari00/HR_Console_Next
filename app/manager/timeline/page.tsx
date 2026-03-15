"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Card } from "@/src/components/ui";
import { fetchCheckIns, fetchGoals, GoalItem } from "@/app/employee/_lib/pmsClient";

interface TimelineNode {
  label: string;
  done: boolean;
  locked?: boolean;
  details: string;
}

export default function ManagerTimelinePage() {
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [checkInCount, setCheckInCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [nextGoals, nextCheckIns] = await Promise.all([
        fetchGoals("self"),
        fetchCheckIns("self"),
      ]);
      setGoals(nextGoals);
      setCheckInCount(nextCheckIns.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load timeline state.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const nodes = useMemo<TimelineNode[]>(() => {
    const hasDraft = goals.some((goal) => goal.status === "draft" || goal.status === "needs_changes");
    const hasSubmitted = goals.some((goal) => goal.status === "submitted");
    const hasApproved = goals.some((goal) => goal.status === "approved" || goal.status === "closed");
    const allClosed = goals.length > 0 && goals.every((goal) => goal.status === "closed");

    return [
      {
        label: "Goal Creation",
        done: !hasDraft && goals.length > 0,
        details: "Create at least one measurable goal and complete the draft stage.",
      },
      {
        label: "Goal Approval",
        done: hasApproved && !hasSubmitted,
        details: "Submit drafts and wait for approver decisions (HR for manager-owned goals).",
      },
      {
        label: "Check-ins",
        done: checkInCount > 0,
        details: `Planned/completed check-ins this cycle: ${checkInCount}`,
      },
      {
        label: "Review",
        done: false,
        locked: true,
        details: "Review opens after the check-in window and cycle policy gates.",
      },
      {
        label: "Cycle Closed",
        done: allClosed,
        details: "All goals completed and cycle officially closed.",
      },
    ];
  }, [goals, checkInCount]);

  return (
    <Stack gap="4">
      <PageHeader
        title="My Cycle Timeline"
        subtitle="Single lifecycle path for your own performance cycle."
        actions={
          <Button variant="secondary" onClick={loadData} disabled={loading}>
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="error" title="Unable to load" description={error} onDismiss={() => setError("")} />}

      <Card title="Timeline Nodes" description="Nodes lock/unlock based on actual workflow state.">
        <Stack gap="2">
          {loading && <p className="caption">Loading timeline...</p>}
          {nodes.map((node) => (
            <div key={node.label} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="body-sm font-medium text-[var(--color-text)]">{node.label}</p>
                <Badge variant={node.done ? "success" : node.locked ? "warning" : "default"}>
                  {node.done ? "Done" : node.locked ? "Locked" : "Pending"}
                </Badge>
              </div>
              <p className="caption mt-2">{node.details}</p>
            </div>
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}

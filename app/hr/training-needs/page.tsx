"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import TrainingNeedsSummaryCard from "@/src/components/patterns/TrainingNeedsSummaryCard";
import TrainingNeedsTable from "@/src/components/patterns/TrainingNeedsTable";
import { Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Button, Card } from "@/src/components/ui";
import {
  fetchGoals,
  fetchHrManagers,
  getCycleIdFromDate,
  GoalItem,
  HrManagerSummary,
} from "@/app/employee/_lib/pmsClient";

const FALLBACK_CYCLES = ["Q4-2026", "Q3-2026", "Q2-2026", "Q1-2026", "Q4-2025"];

function getCycleOptions(goals: GoalItem[]) {
  const values = new Set<string>();

  goals.forEach((goal) => {
    const cycle = String(goal.cycleId || "").trim().toUpperCase();
    if (cycle) {
      values.add(cycle);
    }
  });

  const dynamic = Array.from(values).sort((a, b) => b.localeCompare(a));
  if (dynamic.length > 0) {
    return dynamic;
  }

  return FALLBACK_CYCLES;
}

export default function HrTrainingNeedsPage() {
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [managers, setManagers] = useState<HrManagerSummary[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState("");
  const [selectedManagerId, setSelectedManagerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [nextGoals, nextManagers] = await Promise.all([
        fetchGoals("all"),
        fetchHrManagers(),
      ]);

      const typedGoals = nextGoals as GoalItem[];
      setGoals(typedGoals);
      setManagers(nextManagers || []);

      const cycles = getCycleOptions(typedGoals);
      const currentCycle = getCycleIdFromDate();

      setSelectedCycleId((prev) => {
        if (prev && cycles.includes(prev)) {
          return prev;
        }

        if (currentCycle && cycles.includes(currentCycle)) {
          return currentCycle;
        }

        return cycles[0] || "";
      });

      setSelectedManagerId((prev) => {
        if (!prev) return "";
        return nextManagers.some((manager) => manager.managerId === prev) ? prev : "";
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load training needs data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const cycleOptions = useMemo(() => getCycleOptions(goals), [goals]);

  const summary = useMemo(() => {
    const cycleScoped = goals.filter((goal) => {
      if (!selectedCycleId) return true;
      return String(goal.cycleId || "").trim().toUpperCase() === selectedCycleId;
    });

    const managerScoped = cycleScoped.filter((goal) => {
      if (!selectedManagerId) return true;
      return String(goal.managerId || "").trim() === selectedManagerId;
    });

    const weakGoals = managerScoped.filter((goal) => {
      const rating = Number(goal.managerFinalRating || 0);
      return rating === 1 || rating === 2;
    });

    const impactedEmployees = new Set(
      weakGoals.map((goal) => String(goal.employeeId || "").trim()).filter(Boolean)
    );

    const areaCounts = new Map<string, number>();
    weakGoals.forEach((goal) => {
      const area = String(goal.frameworkType || "").trim() || "General Development";
      areaCounts.set(area, (areaCounts.get(area) || 0) + 1);
    });

    const topWeakArea =
      Array.from(areaCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "Not enough data yet";

    return {
      totalEmployees: impactedEmployees.size,
      totalWeakGoals: weakGoals.length,
      topWeakArea,
    };
  }, [goals, selectedCycleId, selectedManagerId]);

  return (
    <Stack gap="4">
      <PageHeader
        title="Training Needs Analysis"
        subtitle="AI-powered L&D gap identification from performance ratings"
        actions={
          <Button variant="secondary" onClick={loadData} disabled={loading}>
            Refresh
          </Button>
        }
      />

      {error ? (
        <Alert
          variant="error"
          title="Unable to load training context"
          description={error}
          onDismiss={() => setError("")}
        />
      ) : null}

      <Card title="Filters" description="Refine Training Needs Analysis by cycle and manager.">
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="caption text-[var(--color-text-muted)]" htmlFor="tna-cycle-filter">
              Cycle
            </label>
            <select
              id="tna-cycle-filter"
              value={selectedCycleId}
              onChange={(event) => setSelectedCycleId(event.target.value)}
              className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-2 body-sm text-[var(--color-text)]"
            >
              {cycleOptions.map((cycle) => (
                <option key={cycle} value={cycle}>
                  {cycle}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="caption text-[var(--color-text-muted)]" htmlFor="tna-manager-filter">
              Manager
            </label>
            <select
              id="tna-manager-filter"
              value={selectedManagerId}
              onChange={(event) => setSelectedManagerId(event.target.value)}
              className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-2 body-sm text-[var(--color-text)]"
            >
              <option value="">All Managers</option>
              {managers.map((manager) => (
                <option key={manager.managerId} value={manager.managerId}>
                  {manager.managerName}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <Button variant="secondary" onClick={loadData} disabled={loading}>
              Refresh Context
            </Button>
          </div>
        </div>
      </Card>

      <TrainingNeedsSummaryCard
        totalEmployees={summary.totalEmployees}
        totalWeakGoals={summary.totalWeakGoals}
        cycleLabel={selectedCycleId || undefined}
        topWeakArea={summary.topWeakArea}
      />

      <TrainingNeedsTable
        cycleId={selectedCycleId || undefined}
        managerId={selectedManagerId || undefined}
      />

      <p className="caption text-[var(--color-text-muted)]">
        Ratings SME (2) and NI (1) are used to identify development needs. Suggestions are AI-generated and should be
        reviewed by HR before actioning.
      </p>
    </Stack>
  );
}

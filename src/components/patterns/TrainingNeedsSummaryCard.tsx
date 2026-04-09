'use client';

import { Alert, Badge, Button, Card } from '@/src/components/ui';

export interface TrainingNeedsSummaryCardProps {
  totalEmployees: number;
  totalWeakGoals: number;
  cycleLabel?: string;
  topWeakArea?: string;
  loading?: boolean;
  error?: string;
  onViewFullAnalysis?: () => void;
}

function SummarySkeleton() {
  return (
    <Card title="Training Needs Summary" description="Preparing the latest training signals.">
      <div className="flex flex-col gap-[var(--space-3)]">
        <div className="h-8 w-full rounded-[var(--radius-sm)] bg-[var(--color-surface-muted)] animate-pulse" />
        <div className="grid grid-cols-2 gap-[var(--space-2)]">
          <div className="h-16 rounded-[var(--radius-sm)] bg-[var(--color-surface-muted)] animate-pulse" />
          <div className="h-16 rounded-[var(--radius-sm)] bg-[var(--color-surface-muted)] animate-pulse" />
        </div>
      </div>
    </Card>
  );
}

export default function TrainingNeedsSummaryCard({
  totalEmployees,
  totalWeakGoals,
  cycleLabel,
  topWeakArea,
  loading = false,
  error,
  onViewFullAnalysis,
}: TrainingNeedsSummaryCardProps) {
  if (loading) {
    return <SummarySkeleton />;
  }

  const hasData = totalEmployees > 0 || totalWeakGoals > 0;

  return (
    <Card
      title="Training Needs Summary"
      description="A compact overview of workforce capability gaps for the current filter scope."
    >
      <div className="flex flex-col gap-[var(--space-3)]">
        {error ? <Alert variant="error" title="Summary unavailable" description={error} /> : null}

        <div className="flex flex-wrap items-center gap-[var(--space-2)]">
          <Badge variant="info">Employees: {totalEmployees}</Badge>
          <Badge variant="warning">Weak Goals: {totalWeakGoals}</Badge>
          {cycleLabel ? <Badge variant="default">Cycle: {cycleLabel}</Badge> : null}
        </div>

        {hasData ? (
          <div className="grid grid-cols-1 gap-[var(--space-2)] sm:grid-cols-2">
            <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-[var(--space-3)]">
              <p className="caption">Employees Impacted</p>
              <p className="heading-lg text-[var(--color-text)]">{totalEmployees}</p>
            </div>

            <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-[var(--space-3)]">
              <p className="caption">Total Weak Goals</p>
              <p className="heading-lg text-[var(--color-text)]">{totalWeakGoals}</p>
            </div>

            <div className="sm:col-span-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-[var(--space-3)]">
              <p className="caption">Top Weak Area</p>
              <p className="body text-[var(--color-text)]">{topWeakArea || 'Not enough data yet'}</p>
            </div>
          </div>
        ) : (
          <Alert
            variant="info"
            title="No weak-goal records"
            description="There are no qualifying weak-goal ratings for the current selection yet."
          />
        )}

        {onViewFullAnalysis ? (
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onViewFullAnalysis}>
              View Full Analysis
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

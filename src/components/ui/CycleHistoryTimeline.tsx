'use client';

import { HTMLAttributes, useMemo, useState } from 'react';
import { cn } from '@/src/lib/cn';

type TrendLabel = 'new' | 'stable' | 'improving' | 'declining';

type ScoreLabel = 'EE' | 'DE' | 'ME' | 'SME' | 'NI';

interface CycleItem {
  cycleId: string;
  cycleName: string;
  scoreLabel: string;
  computedAt: string;
}

export interface CycleHistoryTimelineProps {
  cycles: Array<CycleItem>;
  trendLabel: TrendLabel;
  loading?: boolean;
  className?: string;
}

type NodeStyle = {
  backgroundColor: string;
  color: string;
  text: string;
};

const nodeStyleByLabel: Record<ScoreLabel, NodeStyle> = {
  EE: {
    backgroundColor: 'var(--color-success)',
    color: 'var(--color-button-text)',
    text: 'EE',
  },
  DE: {
    backgroundColor: 'var(--color-success-subtle)',
    color: 'var(--color-success)',
    text: 'DE',
  },
  ME: {
    backgroundColor: 'var(--color-primary-subtle)',
    color: 'var(--color-primary)',
    text: 'ME',
  },
  SME: {
    backgroundColor: 'var(--color-warning-subtle)',
    color: 'var(--color-warning)',
    text: 'SME',
  },
  NI: {
    backgroundColor: 'var(--color-muted-subtle)',
    color: 'var(--color-muted)',
    text: 'NI',
  },
};

const fallbackNodeStyle: NodeStyle = {
  backgroundColor: 'var(--color-border)',
  color: 'var(--color-muted)',
  text: '?',
};

function resolveNodeStyle(label?: string): NodeStyle {
  const normalized = String(label || '').trim().toUpperCase() as ScoreLabel;
  return nodeStyleByLabel[normalized] || fallbackNodeStyle;
}

function TrendIcon({ trend }: { trend: TrendLabel }) {
  if (trend === 'improving') {
    return (
      <svg viewBox="0 0 20 20" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M5 13.5 10 8.5l5 5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (trend === 'declining') {
    return (
      <svg viewBox="0 0 20 20" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M5 7l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (trend === 'stable') {
    return (
      <svg viewBox="0 0 20 20" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M4 10h12" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 20 20" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="m10 3.5 1.9 4 4.4.6-3.2 3.2.8 4.4L10 13.6 6.1 15.7l.8-4.4L3.7 8.1l4.4-.6L10 3.5Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function trendConfig(trend: TrendLabel): { label: string; color: string } {
  if (trend === 'improving') {
    return { label: 'Improving', color: 'var(--color-success)' };
  }

  if (trend === 'declining') {
    return { label: 'Needs attention', color: 'var(--color-warning)' };
  }

  if (trend === 'stable') {
    return { label: 'Consistent', color: 'var(--color-primary)' };
  }

  return { label: 'Getting started', color: 'var(--color-muted)' };
}

function TimelineSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('w-full', className)} aria-hidden="true">
      <div className="overflow-x-auto">
        <div className="relative flex min-w-[280px] items-start gap-5 py-2">
          <div className="absolute left-5 right-5 top-7 h-px bg-[var(--color-surface-muted)]" />
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={`skeleton-${index}`} className="relative z-10 flex w-[74px] shrink-0 flex-col items-center gap-2">
              <div className="h-10 w-10 animate-pulse rounded-full bg-[var(--color-surface-muted)]" />
              <div className="h-3 w-14 animate-pulse rounded bg-[var(--color-surface-muted)]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CycleHistoryTimeline({
  cycles,
  trendLabel,
  loading = false,
  className,
  ...props
}: CycleHistoryTimelineProps & Omit<HTMLAttributes<HTMLDivElement>, 'className'>) {
  const [showLegend, setShowLegend] = useState(false);

  const timelineCycles = useMemo(() => {
    if (!Array.isArray(cycles) || cycles.length === 0) return [];

    const sorted = [...cycles].sort((a, b) => {
      const left = Date.parse(a.computedAt || '');
      const right = Date.parse(b.computedAt || '');
      if (Number.isNaN(left) && Number.isNaN(right)) return 0;
      if (Number.isNaN(left)) return -1;
      if (Number.isNaN(right)) return 1;
      return left - right;
    });

    return sorted.slice(-3);
  }, [cycles]);

  if (loading) {
    return <TimelineSkeleton className={className} />;
  }

  if (timelineCycles.length === 0) {
    return (
      <div className={cn('w-full', className)} {...props}>
        <p className="text-sm italic text-[var(--color-text-muted)]">
          Your performance history will appear here after your first cycle closes.
        </p>
      </div>
    );
  }

  const trend = trendConfig(trendLabel);

  return (
    <div className={cn('w-full', className)} {...props}>
      <div className="overflow-x-auto">
        <div className="relative flex min-w-fit items-start gap-5 py-2 pr-2">
          {timelineCycles.length > 1 ? (
            <div className="pointer-events-none absolute left-5 right-[80px] top-7 h-px bg-[var(--color-border)]" aria-hidden="true" />
          ) : null}

          {timelineCycles.map((cycle) => {
            const style = resolveNodeStyle(cycle.scoreLabel);

            return (
              <div key={cycle.cycleId} className="relative z-10 flex w-[74px] shrink-0 flex-col items-center gap-2">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold"
                  style={{
                    backgroundColor: style.backgroundColor,
                    color: style.color,
                  }}
                  aria-label={`Cycle ${cycle.cycleName}: ${style.text}`}
                >
                  {style.text}
                </div>
                <p className="w-full truncate text-center text-xs text-[var(--color-text-muted)]" title={cycle.cycleName}>
                  {cycle.cycleName}
                </p>
              </div>
            );
          })}

          <div className="relative z-10 ml-1 flex shrink-0 items-center gap-1.5 pt-2" style={{ color: trend.color }}>
            <TrendIcon trend={trendLabel} />
            <span className="text-xs font-medium whitespace-nowrap">{trend.label}</span>
          </div>
        </div>
      </div>

      <div className="mt-3">
        <button
          type="button"
          className="cursor-pointer text-xs text-[var(--color-text-muted)] underline"
          onClick={() => setShowLegend((current) => !current)}
          aria-expanded={showLegend}
        >
          What do these mean?
        </button>

        {showLegend ? (
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
            EE = Exceptional, DE = Distinguished, ME = Meets Expectations, SME = Some Expectations, NI = Needs Improvement
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default CycleHistoryTimeline;

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { requestJson } from '@/app/employee/_lib/pmsClient';
import { Alert, Button, ContributionBadge, Tooltip } from '@/src/components/ui';
import { cn } from '@/src/lib/cn';

const CONTRIBUTION_BADGE_ENABLED = process.env.NEXT_PUBLIC_ENABLE_CONTRIBUTION_BADGE === 'true';

export interface GoalLineageCardProps {
  goalId: string;
  cycleId?: string;
  compact?: boolean;
  className?: string;
}

interface LineageNode {
  level: number;
  goalId: string;
  title: string;
  ownerName: string;
  weightage: number;
  progressPercent: number;
  contributionPercent: number;
  contributionBadge: 'Low' | 'Medium' | 'High';
}

interface GoalLineageResponse {
  goalId: string;
  lineage: LineageNode[];
  plainEnglishSummary: string;
  overallContributionBadge: 'Low' | 'Medium' | 'High';
}

function truncate(text: string, max: number) {
  const input = String(text || '').trim();
  if (input.length <= max) return input;
  return `${input.slice(0, max - 1)}…`;
}

function StandaloneInfo() {
  return (
    <div className="mt-2 flex items-center gap-2 text-[var(--color-text-muted)]">
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" clipRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-9V6H9v3h2zm0 5v-4H9v4h2z" />
      </svg>
      <p className="text-sm">Standalone goal - no parent target linked yet</p>
    </div>
  );
}

function ChainNode({ node, isCurrent, isLast }: { node: LineageNode; isCurrent: boolean; isLast: boolean }) {
  const progress = Math.max(0, Math.min(100, Number.isFinite(Number(node.progressPercent)) ? Number(node.progressPercent) : 0));

  return (
    <div className="relative pl-3">
      {!isLast && (
        <div
          className="absolute left-4 top-9 h-8 border-l-2 border-dashed border-[var(--color-border)]"
          aria-hidden="true"
        />
      )}

      <div
        className={cn(
          'rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3',
          isCurrent && 'border-l-4 border-l-[var(--color-primary)]'
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-muted)] text-xs font-semibold text-[var(--color-text)]">
                    {`L${node.level + 1}`}
              </span>

              <div className="min-w-0">
                <Tooltip content={node.title || 'Untitled goal'}>
                  <p className="text-sm font-medium text-[var(--color-text)] md:hidden">
                    {truncate(node.title || 'Untitled goal', 28)}
                  </p>
                </Tooltip>
                <Tooltip content={node.title || 'Untitled goal'}>
                  <p className="hidden text-sm font-medium text-[var(--color-text)] md:block">
                    {truncate(node.title || 'Untitled goal', 40)}
                  </p>
                </Tooltip>
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{node.ownerName || 'Unknown owner'}</p>
              </div>
            </div>

            <div className="mt-2">
              <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--color-surface-muted)]">
                <div className="h-1 rounded-full bg-[var(--color-primary)]" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>

          <ContributionBadge
            badge={node.contributionBadge}
            contributionPercent={node.contributionPercent}
            size="sm"
            showPercent
          />
        </div>
      </div>
    </div>
  );
}

function ChainView({ lineage, summary }: { lineage: LineageNode[]; summary: string }) {
  const nodes = useMemo(() => [...lineage].reverse(), [lineage]);

  return (
    <div className="space-y-2">
      {nodes.map((node, index) => (
        <ChainNode key={node.goalId || `${node.level}-${index}`} node={node} isCurrent={node.level === 0} isLast={index === nodes.length - 1} />
      ))}

      <div className="rounded-lg bg-[var(--color-surface-raised)] p-3">
        <p className="text-sm italic text-[var(--color-text-muted)]">{summary}</p>
      </div>
    </div>
  );
}

export function GoalLineageCard({ goalId, cycleId, compact = false, className }: GoalLineageCardProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [payload, setPayload] = useState<GoalLineageResponse | null>(null);

  const load = useCallback(async () => {
    if (!CONTRIBUTION_BADGE_ENABLED) {
      setPayload(null);
      setLoading(false);
      setError('');
      return;
    }

    const id = String(goalId || '').trim();
    if (!id) {
      setPayload(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const query = cycleId ? `?cycleId=${encodeURIComponent(cycleId)}` : '';
      const result = await requestJson(`/api/goals/${encodeURIComponent(id)}/lineage${query}`);
      setPayload((result || null) as GoalLineageResponse | null);
    } catch {
      setError('Could not load contribution data');
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [goalId, cycleId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!CONTRIBUTION_BADGE_ENABLED) {
    return null;
  }

  if (loading) {
    return (
      <div className={cn('space-y-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3', className)}>
        <div className="h-3 w-3/4 animate-pulse rounded bg-[var(--color-surface-muted)]" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-[var(--color-surface-muted)]" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--color-surface-muted)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('space-y-2', className)}>
        <Alert variant="info" title="Could not load contribution data" />
        <Button type="button" size="sm" variant="secondary" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!payload || !Array.isArray(payload.lineage) || payload.lineage.length === 0) {
    return null;
  }

  const leafNode = payload.lineage[0];
  const summary = String(payload.plainEnglishSummary || '').trim();
  const compactSummary = truncate(summary, 80);

  if (compact) {
    return (
      <div className={cn('space-y-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3', className)}>
        <div className="flex items-center gap-2">
          <ContributionBadge
            badge={leafNode.contributionBadge}
            contributionPercent={leafNode.contributionPercent}
            size="sm"
            showPercent
          />

          <p className="min-w-0 flex-1 truncate text-sm text-[var(--color-text-muted)]">
            {expanded ? summary : compactSummary}
          </p>

          {summary.length > 80 && (
            <button
              type="button"
              className="text-xs font-medium text-[var(--color-primary)]"
              onClick={() => setExpanded((prev) => !prev)}
            >
              {expanded ? 'show less' : '...show more'}
            </button>
          )}
        </div>

        {payload.lineage.length <= 1 && <StandaloneInfo />}
        {expanded && payload.lineage.length > 1 && <ChainView lineage={payload.lineage} summary={summary} />}
      </div>
    );
  }

  return (
    <div className={cn('space-y-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3', className)}>
      {payload.lineage.length <= 1 ? <StandaloneInfo /> : <ChainView lineage={payload.lineage} summary={summary} />}
    </div>
  );
}

export default GoalLineageCard;

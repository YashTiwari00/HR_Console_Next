'use client';

import { useMemo, useState, type HTMLAttributes, type ReactNode } from 'react';
import { Stack } from '@/src/components/layout';
import { Alert, Button, Spinner } from '@/src/components/ui';
import ExplainabilityDrawer from '@/src/components/patterns/ExplainabilityDrawer';
import { cn } from '@/src/lib/cn';

interface CycleHistoryItem {
  cycleName: string;
  scoreLabel: string;
}

interface TnaItem {
  area: string;
  signal: string;
}

export interface CareerPathwayPanelProps {
  role: string;
  department: string;
  cycleId: string;
  cycleHistory: Array<CycleHistoryItem>;
  tnaItems: Array<TnaItem>;
  readinessLabel: string;
  className?: string;
}

interface GrowthPathwayResponse {
  pathway?: string;
  error?: string;
  usedCount?: number;
  cap?: number;
}

const CREDITS_PER_CYCLE = 3;

function parsePathwayText(text: string): ReactNode[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line, index) => {
    if (/^\d+\./.test(line)) {
      return (
        <h4 key={`section-${index}`} className="mb-1 text-sm font-semibold text-[var(--color-text)]">
          {line}
        </h4>
      );
    }

    if (/^[-•]/.test(line)) {
      const bulletText = line.replace(/^[-•]\s*/, '');
      return (
        <ul key={`bullet-wrap-${index}`} className="ml-4 list-disc">
          <li className="text-sm text-[var(--color-text)]">{bulletText}</li>
        </ul>
      );
    }

    return (
      <p key={`line-${index}`} className="text-sm text-[var(--color-text)]">
        {line}
      </p>
    );
  });
}

export function CareerPathwayPanel({
  role,
  department,
  cycleId,
  cycleHistory,
  tnaItems,
  readinessLabel,
  className,
  ...props
}: CareerPathwayPanelProps & Omit<HTMLAttributes<HTMLDivElement>, 'className'>) {
  const [pathwayText, setPathwayText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usageLimitReached, setUsageLimitReached] = useState(false);
  const [usedCount, setUsedCount] = useState(0);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const parsedPathway = useMemo(() => {
    if (!pathwayText) return [];
    return parsePathwayText(pathwayText);
  }, [pathwayText]);

  const explainabilityPayload = useMemo(
    () => ({
      source: 'growth_pathway_ai',
      confidenceLabel: 'medium',
      reason: 'Generated from your role context, cycle trend labels, TNA skill areas, and readiness status.',
      based_on: [
        `Role: ${role || 'Unknown'}`,
        `Department: ${department || 'Unknown'}`,
        `Readiness: ${readinessLabel || 'Unknown'}`,
        `Cycle history records: ${Array.isArray(cycleHistory) ? cycleHistory.length : 0}`,
        `Development areas: ${Array.isArray(tnaItems) ? tnaItems.map((item) => item?.area).filter(Boolean).join(', ') || 'None' : 'None'}`,
      ],
      time_window: cycleId || 'current_cycle',
    }),
    [cycleHistory, cycleId, department, readinessLabel, role, tnaItems]
  );

  async function generatePathway() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/ai/growth-pathway', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role,
          department,
          cycleId,
          cycleHistory,
          tnaItems,
          readinessLabel,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as GrowthPathwayResponse;

      if (response.status === 429) {
        setUsageLimitReached(true);
        setUsedCount(Number(payload?.usedCount || CREDITS_PER_CYCLE));
        return;
      }

      if (!response.ok || !payload?.pathway) {
        throw new Error(payload?.error || 'Could not generate pathway.');
      }

      setPathwayText(payload.pathway);
      setHasGenerated(true);
      setUsageLimitReached(false);
      setUsedCount((current) => {
        const next = current + 1;
        return next > CREDITS_PER_CYCLE ? CREDITS_PER_CYCLE : next;
      });
      setGeneratedAt(new Date().toLocaleDateString());
    } catch {
      setError('Could not generate pathway. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className={cn(
        'w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-4)]',
        className
      )}
      {...props}
    >
      <Stack gap="3" align="start" className="w-full gap-[var(--space-4)]">
        <div>
          <h3 className="text-base font-semibold text-[var(--color-text)]">Career Pathway</h3>
          <p className="text-sm text-[var(--color-text-muted)]">
            AI guidance based on your role context, development signals, and recent growth trajectory.
          </p>
        </div>

        {error ? (
          <div className="space-y-[var(--space-2)]">
            <Alert variant="error" title="Could not generate pathway" description={error} />
            <Button variant="secondary" size="sm" onClick={() => void generatePathway()} disabled={loading}>
              Retry
            </Button>
          </div>
        ) : null}

        {usageLimitReached ? (
          <Alert
            variant="warning"
            title="AI credits used for this cycle"
            description="You have used all 3 credits. Credits reset at the start of the next cycle."
          />
        ) : null}

        {!hasGenerated && !usageLimitReached ? (
          <div className="w-full rounded-xl border border-[color-mix(in_srgb,var(--color-primary)_28%,var(--color-border))] bg-[var(--color-surface-raised)] p-[var(--space-4)]">
            <div className="flex flex-col items-start gap-[var(--space-3)]">
              <div>
                <h4 className="text-sm font-semibold text-[var(--color-text)]">Generate your pathway</h4>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  Start with one AI suggestion tailored to your role and current growth signals.
                </p>
              </div>

              {loading ? (
                <div className="flex items-center gap-[var(--space-2)]">
                  <Spinner size="sm" />
                  <p className="text-sm italic text-[var(--color-text-muted)]">Analysing your performance journey...</p>
                </div>
              ) : (
                <>
                  <Button variant="primary" onClick={() => void generatePathway()}>
                    Generate Career Pathway
                  </Button>
                  <p className="text-xs text-[var(--color-text-muted)]">Uses 1 of your 3 AI credits for this cycle</p>
                </>
              )}
            </div>
          </div>
        ) : null}

        {hasGenerated && pathwayText ? (
          <div className="space-y-[var(--space-3)]">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-[var(--space-4)]">
              <div className="space-y-[var(--space-2)]">{parsedPathway}</div>
            </div>

            {loading ? (
              <div className="flex items-center gap-[var(--space-2)]">
                <Spinner size="sm" />
                <p className="text-sm italic text-[var(--color-text-muted)]">Analysing your performance journey...</p>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-[var(--space-2)]">
                {usedCount < CREDITS_PER_CYCLE ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void generatePathway()}
                  >
                    <svg viewBox="0 0 20 20" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <path d="M15.5 10a5.5 5.5 0 1 1-1.6-3.9" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M15.5 4.5V8h-3.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Regenerate
                  </Button>
                ) : null}

                <Button variant="ghost" size="sm" className="underline" onClick={() => setDrawerOpen(true)}>
                  How was this generated?
                </Button>
              </div>
            )}

            <p className="text-xs text-[var(--color-text-muted)]">Generated by AI · {generatedAt || new Date().toLocaleDateString()}</p>
          </div>
        ) : null}
      </Stack>

      <ExplainabilityDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="How this pathway was generated"
        payload={explainabilityPayload}
      />
    </section>
  );
}

export default CareerPathwayPanel;

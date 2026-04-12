'use client';

import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/src/lib/cn';

export interface TnaSkillCardProps {
  area: string;
  signal: 'rating' | 'self_review' | 'progress';
  cycleId?: string;
  cycleName?: string;
  index: number;
  className?: string;
}

type SignalBadgeConfig = {
  label: string;
  backgroundColor: string;
  color: string;
};

const signalBadgeByType: Record<TnaSkillCardProps['signal'], SignalBadgeConfig> = {
  rating: {
    label: 'From performance review',
    backgroundColor: 'var(--color-warning-subtle)',
    color: 'var(--color-warning)',
  },
  self_review: {
    label: 'From your self-review',
    backgroundColor: 'var(--color-info-subtle)',
    color: 'var(--color-info)',
  },
  progress: {
    label: 'From goal progress',
    backgroundColor: 'var(--color-muted-subtle)',
    color: 'var(--color-muted)',
  },
};

function ChevronRightIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M7 5.5 12 10l-5 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TnaSkillCard({
  area,
  signal,
  cycleId,
  cycleName,
  index,
  className,
  ...props
}: TnaSkillCardProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'>) {
  if (!area || area.trim().length === 0) {
    return null;
  }

  const signalBadge = signalBadgeByType[signal];
  const sequence = Math.max(0, index) + 1;
  const safeArea = area.trim();
  const cycleMeta = cycleName || cycleId;
  const ariaLabel = cycleMeta
    ? `Skill ${sequence}: ${safeArea}. ${signalBadge.label}. Cycle ${cycleMeta}.`
    : `Skill ${sequence}: ${safeArea}. ${signalBadge.label}.`;

  return (
    <button
      type="button"
      className={cn(
        'w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-4)] text-left',
        'cursor-pointer transition-[box-shadow,transform,border-color] duration-200',
        'hover:-translate-y-px hover:shadow-[0_8px_22px_color-mix(in_srgb,var(--color-primary)_12%,transparent)]',
        'hover:border-[color-mix(in_srgb,var(--color-primary)_28%,var(--color-border))]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]',
        className
      )}
      aria-label={ariaLabel}
      {...props}
    >
      <div className="flex items-center gap-[var(--space-3)]">
        <div
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
          style={{
            backgroundColor: 'var(--color-primary-subtle)',
            color: 'var(--color-primary)',
          }}
          aria-hidden="true"
        >
          {sequence}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--color-text)]">{safeArea}</p>
          <span
            className="mt-[var(--space-1)] inline-flex rounded-full px-[var(--space-2)] py-[var(--space-1)] text-xs font-medium"
            style={{
              backgroundColor: signalBadge.backgroundColor,
              color: signalBadge.color,
            }}
          >
            {signalBadge.label}
          </span>
        </div>

        <div className="shrink-0 text-[var(--color-muted)]" aria-hidden="true">
          <ChevronRightIcon />
        </div>
      </div>
    </button>
  );
}

export default TnaSkillCard;

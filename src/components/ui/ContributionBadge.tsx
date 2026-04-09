import { HTMLAttributes } from 'react';
import { cn } from '@/src/lib/cn';

export interface ContributionBadgeProps {
  badge: 'Low' | 'Medium' | 'High';
  contributionPercent: number;
  size?: 'sm' | 'md' | 'lg';
  showPercent?: boolean;
  className?: string;
}

const sizeClasses: Record<NonNullable<ContributionBadgeProps['size']>, string> = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-sm px-3 py-1',
  lg: 'text-base px-4 py-1.5',
};

const toneClasses: Record<ContributionBadgeProps['badge'], string> = {
  High: 'bg-[var(--color-success-subtle)] text-[var(--color-success)]',
  Medium: 'bg-[var(--color-warning-subtle)] text-[var(--color-warning)]',
  Low: 'bg-[var(--color-muted-subtle)] text-[var(--color-muted)]',
};

function UpArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
      <path d="M4 13L13 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 4h5v5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DiagonalArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
      <path d="M4 12L12 8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 5h5v5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FlatLineIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
      <path d="M4 10h12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Renders a contribution level pill with icon, label, and optional percentage. */
export function ContributionBadge({
  badge,
  contributionPercent,
  size = 'md',
  showPercent = false,
  className,
}: ContributionBadgeProps & Omit<HTMLAttributes<HTMLSpanElement>, 'className'>) {
  const normalizedPercent = Math.max(0, Math.min(100, Number.isFinite(Number(contributionPercent)) ? Number(contributionPercent) : 0));
  const label = showPercent ? `${badge} · ${Math.round(normalizedPercent)}%` : badge;

  return (
    <span
      role="status"
      aria-label={`Contribution level: ${badge}`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap',
        sizeClasses[size],
        toneClasses[badge],
        className
      )}
    >
      {badge === 'High' && <UpArrowIcon />}
      {badge === 'Medium' && <DiagonalArrowIcon />}
      {badge === 'Low' && <FlatLineIcon />}
      <span>{label}</span>
    </span>
  );
}

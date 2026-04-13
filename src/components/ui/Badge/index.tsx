import { HTMLAttributes } from 'react';
import { cn } from '@/src/lib/cn';

export type BadgeVariant = 'default' | 'success' | 'danger' | 'warning' | 'info';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default:
    'bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)]',
  success:
    'bg-[var(--color-badge-success-bg)] text-[var(--color-success)] border border-[var(--color-badge-success-border)]',
  danger:
    'bg-[var(--color-badge-danger-bg)] text-[var(--color-danger)] border border-[var(--color-badge-danger-border)]',
  warning:
    'bg-[var(--color-badge-warning-bg)] text-[var(--color-warning)] border border-[var(--color-badge-warning-border)]',
  info:
    'bg-[var(--color-badge-info-bg)] text-[var(--color-primary)] border border-[var(--color-badge-info-border)]',
};

export default function Badge({
  variant = 'default',
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-1',
        'caption font-medium',
        'rounded-[999px]',
        'whitespace-nowrap',
        'backdrop-blur-[8px]',
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

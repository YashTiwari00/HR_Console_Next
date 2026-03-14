import { HTMLAttributes } from 'react';
import { cn } from '@/src/lib/cn';

export interface DividerProps extends HTMLAttributes<HTMLDivElement> {
  label?: string;
  orientation?: 'horizontal' | 'vertical';
}

export default function Divider({
  label,
  orientation = 'horizontal',
  className,
  ...props
}: DividerProps) {
  if (orientation === 'vertical') {
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        className={cn(
          'w-px self-stretch bg-[var(--color-border)]',
          className
        )}
        {...props}
      />
    );
  }

  if (label) {
    return (
      <div
        role="separator"
        aria-orientation="horizontal"
        className={cn('flex items-center gap-[var(--space-2)]', className)}
        {...props}
      >
        <div className="flex-1 h-px bg-[var(--color-border)]" />
        <span className="caption shrink-0">{label}</span>
        <div className="flex-1 h-px bg-[var(--color-border)]" />
      </div>
    );
  }

  return (
    <hr
      role="separator"
      className={cn('border-0 border-t border-[var(--color-border)]', className)}
      {...props}
    />
  );
}

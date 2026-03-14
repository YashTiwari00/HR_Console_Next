'use client';

import { ReactNode, useState, useId } from 'react';
import { cn } from '@/src/lib/cn';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  content: ReactNode;
  position?: TooltipPosition;
  children: ReactNode;
  className?: string;
}

const positionClasses: Record<TooltipPosition, { tooltip: string }> = {
  top: {
    tooltip: 'bottom-full left-1/2 -translate-x-1/2 mb-[var(--space-1)]',
  },
  bottom: {
    tooltip: 'top-full left-1/2 -translate-x-1/2 mt-[var(--space-1)]',
  },
  left: {
    tooltip: 'right-full top-1/2 -translate-y-1/2 mr-[var(--space-1)]',
  },
  right: {
    tooltip: 'left-full top-1/2 -translate-y-1/2 ml-[var(--space-1)]',
  },
};

export default function Tooltip({
  content,
  position = 'top',
  children,
  className,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      <div aria-describedby={visible ? id : undefined}>{children}</div>

      {visible && (
        <div
          id={id}
          role="tooltip"
          className={cn(
            'absolute z-50 pointer-events-none',
            'px-[var(--space-2)] py-[var(--space-1)]',
            'bg-[var(--color-surface)] border border-[var(--color-border)]',
            'caption text-[var(--color-text)]',
            'rounded-[var(--radius-sm)]',
            'shadow-[var(--shadow-md)]',
            'whitespace-nowrap',
            'transition-opacity duration-150',
            positionClasses[position].tooltip,
            className
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}

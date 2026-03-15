import { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/src/lib/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  footer?: ReactNode;
}

export default function Card({
  title,
  description,
  footer,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'bg-[var(--color-surface)] border border-[var(--color-border)]',
        'rounded-[var(--radius-md)]',
        'shadow-[var(--shadow-sm)]',
        'flex flex-col',
        className
      )}
      {...props}
    >
      {(title || description) && (
        <div className="px-[var(--space-4)] pt-[var(--space-4)] pb-[var(--space-3)] flex flex-col gap-[var(--space-1)] border-b border-[color-mix(in_srgb,var(--color-border)_70%,transparent)]">
          {title && (
            <h3 className="heading-lg text-[var(--color-text)] tracking-tight">{title}</h3>
          )}
          {description && (
            <p className="caption">{description}</p>
          )}
        </div>
      )}

      {children && (
        <div className="px-[var(--space-4)] py-[var(--space-3)] flex-1">
          {children}
        </div>
      )}

      {footer && (
        <div
          className={cn(
            'px-[var(--space-4)] py-[var(--space-3)]',
            'border-t border-[var(--color-border)]',
            'flex items-center gap-[var(--space-2)]'
          )}
        >
          {footer}
        </div>
      )}
    </div>
  );
}

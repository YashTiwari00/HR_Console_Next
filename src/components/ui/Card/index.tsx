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
        // Glass surface
        'bg-[color-mix(in_srgb,var(--color-surface)_72%,transparent)]',
        'backdrop-blur-[16px] backdrop-saturate-[1.4]',
        'border border-[color-mix(in_srgb,var(--color-border)_50%,transparent)]',
        'rounded-[var(--radius-md)]',
        'shadow-[var(--shadow-sm)]',
        'flex flex-col',
        'transition-[box-shadow,transform,border-color,background-color] duration-300',
        'hover:shadow-[0_8px_32px_color-mix(in_srgb,var(--color-primary)_14%,transparent)]',
        'hover:border-[color-mix(in_srgb,var(--color-primary)_25%,var(--color-border)_75%)]',
        'hover:bg-[color-mix(in_srgb,var(--color-surface)_80%,transparent)]',
        'hover:-translate-y-px',
        className
      )}
      {...props}
    >
      {(title || description) && (
        <div className="px-[var(--space-4)] pt-[var(--space-4)] pb-[var(--space-3)] flex flex-col gap-[var(--space-1)] border-b border-[color-mix(in_srgb,var(--color-border)_45%,transparent)]">
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
            'border-t border-[color-mix(in_srgb,var(--color-border)_45%,transparent)]',
            'flex items-center gap-[var(--space-2)]'
          )}
        >
          {footer}
        </div>
      )}
    </div>
  );
}

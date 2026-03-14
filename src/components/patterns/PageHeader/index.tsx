import { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/src/lib/cn';

export interface PageHeaderProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export default function PageHeader({
  title,
  subtitle,
  actions,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4',
        'py-6',
        className
      )}
      {...props}
    >
      <div className="flex flex-col gap-1 min-w-0">
        <h1 className="heading-xl text-[var(--color-text)] truncate">{title}</h1>
        {subtitle && (
          <p className="caption">{subtitle}</p>
        )}
      </div>

      {actions && (
        <div className="flex items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}

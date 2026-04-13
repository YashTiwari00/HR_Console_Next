import { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/src/lib/cn';

export type AlertVariant = 'success' | 'error' | 'warning' | 'info';

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  title?: string;
  description?: string;
  onDismiss?: () => void;
  icon?: ReactNode;
}

const variantConfig: Record<
  AlertVariant,
  { container: string; icon: ReactNode; iconColor: string }
> = {
  success: {
    container:
      'bg-[var(--color-alert-success-bg)] border-[var(--color-alert-success-border)] text-[var(--color-success)]',
    iconColor: 'text-[var(--color-success)]',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  error: {
    container:
      'bg-[var(--color-alert-danger-bg)] border-[var(--color-alert-danger-border)] text-[var(--color-danger)]',
    iconColor: 'text-[var(--color-danger)]',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  warning: {
    container:
      'bg-[var(--color-alert-warning-bg)] border-[var(--color-alert-warning-border)] text-[var(--color-warning)]',
    iconColor: 'text-[var(--color-warning)]',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  info: {
    container:
      'bg-[var(--color-alert-info-bg)] border-[var(--color-alert-info-border)] text-[var(--color-primary)]',
    iconColor: 'text-[var(--color-primary)]',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
};

export default function Alert({
  variant = 'info',
  title,
  description,
  onDismiss,
  icon,
  className,
  ...props
}: AlertProps) {
  const config = variantConfig[variant];

  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-[var(--space-2)]',
        'p-[var(--space-3)]',
        'border rounded-[var(--radius-sm)]',
        'backdrop-blur-[14px] backdrop-saturate-[1.3]',
        config.container,
        className
      )}
      {...props}
    >
      <span className={cn('shrink-0 mt-0.5', config.iconColor)}>
        {icon ?? config.icon}
      </span>

      <div className="flex-1 flex flex-col gap-[var(--space-1)] min-w-0">
        {title && (
          <p className="body-sm font-medium">
            {title}
          </p>
        )}
        {description && (
          <p className="caption opacity-80">
            {description}
          </p>
        )}
      </div>

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss alert"
          className={cn(
            'shrink-0 p-[var(--space-1)]',
            'rounded-[var(--radius-sm)]',
            'opacity-70 hover:opacity-100',
            'transition-opacity duration-150',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current',
            'cursor-pointer'
          )}
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M12 4L4 12M4 4l8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

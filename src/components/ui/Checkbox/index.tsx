'use client';

import { InputHTMLAttributes, forwardRef, useId } from 'react';
import { cn } from '@/src/lib/cn';

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  description?: string;
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, className, id, ...props }, ref) => {
    const generatedId = useId();
    const checkboxId = id ?? (label ? generatedId : undefined);

    return (
      <div className="flex items-start gap-2">
        <input
          ref={ref}
          type="checkbox"
          id={checkboxId}
          className={cn(
            'mt-0.5 w-4 h-4 shrink-0',
            'rounded-[var(--radius-sm)]',
            'bg-[var(--color-surface)] border border-[var(--color-border)]',
            'accent-[var(--color-primary)]',
            'cursor-pointer',
            'focus-visible:outline-none focus-visible:ring-2',
            'focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2',
            'focus-visible:ring-offset-[var(--color-bg)]',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            className
          )}
          {...props}
        />

        {(label || description) && (
          <div className="flex flex-col gap-1">
            {label && (
              <label
                htmlFor={checkboxId}
                className="body-sm font-medium text-[var(--color-text)] cursor-pointer leading-none"
              >
                {label}
              </label>
            )}
            {description && (
              <span className="caption">
                {description}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';
export default Checkbox;

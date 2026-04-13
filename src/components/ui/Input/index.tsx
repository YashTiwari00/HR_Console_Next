'use client';

import { InputHTMLAttributes, forwardRef, useId } from 'react';
import { cn } from '@/src/lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? (label ? generatedId : undefined);
    const normalizedProps = { ...props };

    // Keep the input mode stable when callers pass value as undefined/null.
    if (
      "value" in normalizedProps &&
      normalizedProps.value == null &&
      normalizedProps.type !== 'file'
    ) {
      normalizedProps.value = '';
    }

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={inputId}
            className="body-sm font-medium text-[var(--color-text)]"
          >
            {label}
          </label>
        )}

        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full px-3 py-2',
            'bg-[var(--color-surface)] border border-[var(--color-border)]',
            'body-sm text-[var(--color-text)]',
            'rounded-[var(--radius-sm)]',
            'transition-colors duration-150',
            'focus:outline-none focus:border-[var(--color-focus-ring)]',
            'focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-focus-ring)_28%,transparent)]',
            'placeholder:text-[var(--color-text-muted)]',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error &&
              'border-[var(--color-danger)] focus:border-[var(--color-danger)] focus:ring-[var(--color-danger)]',
            className
          )}
          aria-invalid={!!error}
          aria-describedby={
            error
              ? `${inputId}-error`
              : helperText
              ? `${inputId}-helper`
              : undefined
          }
          {...normalizedProps}
        />

        {error && (
          <span
            id={`${inputId}-error`}
            role="alert"
            className="caption text-[var(--color-danger)]"
          >
            {error}
          </span>
        )}
        {!error && helperText && (
          <span
            id={`${inputId}-helper`}
            className="caption"
          >
            {helperText}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
export default Input;

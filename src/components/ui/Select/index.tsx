'use client';

import { SelectHTMLAttributes, forwardRef, useId } from 'react';
import { cn } from '@/src/lib/cn';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: SelectOption[];
  placeholder?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    { label, error, helperText, options, placeholder, className, id, ...props },
    ref
  ) => {
    const generatedId = useId();
    const selectId = id ?? (label ? generatedId : undefined);

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={selectId}
            className="body-sm font-medium text-[var(--color-text)]"
          >
            {label}
          </label>
        )}

        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(
              'w-full px-3 py-2 pr-8',
              'bg-[color-mix(in_srgb,var(--color-surface)_60%,transparent)] backdrop-blur-[10px]',
              'border border-[color-mix(in_srgb,var(--color-border)_50%,transparent)]',
              'body-sm text-[var(--color-text)]',
              'rounded-[var(--radius-sm)]',
              'transition-all duration-200',
              'appearance-none cursor-pointer',
              'focus:outline-none focus:border-[var(--color-focus-ring)]',
              'focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-focus-ring)_28%,transparent)]',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              error && 'border-[var(--color-danger)] focus:border-[var(--color-danger)]',
              className
            )}
            aria-invalid={!!error}
            aria-describedby={
              error
                ? `${selectId}-error`
                : helperText
                ? `${selectId}-helper`
                : undefined
            }
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Chevron icon */}
          <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
            <svg
              className="w-4 h-4 text-[var(--color-text-muted)]"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M4 6l4 4 4-4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        {error && (
          <span
            id={`${selectId}-error`}
            role="alert"
            className="caption text-[var(--color-danger)]"
          >
            {error}
          </span>
        )}
        {!error && helperText && (
          <span
            id={`${selectId}-helper`}
            className="caption"
          >
            {helperText}
          </span>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';
export default Select;

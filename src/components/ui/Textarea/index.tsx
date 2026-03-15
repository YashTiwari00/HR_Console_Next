'use client';

import { TextareaHTMLAttributes, forwardRef, useId } from 'react';
import { cn } from '@/src/lib/cn';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, className, id, rows = 4, ...props }, ref) => {
    const generatedId = useId();
    const textareaId = id ?? (label ? generatedId : undefined);

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={textareaId}
            className="body-sm font-medium text-[var(--color-text)]"
          >
            {label}
          </label>
        )}

        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          className={cn(
            'w-full px-3 py-2',
            'bg-[var(--color-surface)] border border-[var(--color-border)]',
            'body-sm text-[var(--color-text)]',
            'rounded-[var(--radius-sm)]',
            'transition-colors duration-150',
            'resize-y',
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
              ? `${textareaId}-error`
              : helperText
              ? `${textareaId}-helper`
              : undefined
          }
          {...props}
        />

        {error && (
          <span
            id={`${textareaId}-error`}
            role="alert"
            className="caption text-[var(--color-danger)]"
          >
            {error}
          </span>
        )}
        {!error && helperText && (
          <span
            id={`${textareaId}-helper`}
            className="caption"
          >
            {helperText}
          </span>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
export default Textarea;

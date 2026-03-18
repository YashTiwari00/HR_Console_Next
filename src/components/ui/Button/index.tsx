'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';
import Spinner from '../Spinner';
import { cn } from '@/src/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-button-text)] shadow-[var(--shadow-sm)] hover:shadow-[0_4px_18px_color-mix(in_srgb,var(--color-primary)_45%,transparent)] hover:-translate-y-px transition-[background-color,box-shadow,transform]',
  secondary:
    'bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]',
  ghost:
    'bg-transparent text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]',
  danger:
    'bg-[var(--color-danger)] hover:opacity-90 text-white shadow-[var(--shadow-sm)]',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-2 py-1 body-sm',
  md: 'px-4 py-2 body-sm',
  lg: 'px-6 py-2 body',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled,
      className,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center gap-2',
          'font-medium rounded-[var(--radius-sm)]',
          'transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2',
          'focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-2',
          'focus-visible:ring-offset-[var(--color-bg)]',
          'disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer',
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {loading && <Spinner size="sm" />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
export default Button;

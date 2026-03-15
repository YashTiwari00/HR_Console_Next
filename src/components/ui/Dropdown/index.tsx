'use client';

import {
  HTMLAttributes,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cn } from '@/src/lib/cn';

export interface DropdownOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface DropdownProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  label?: string;
  options: DropdownOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  id?: string;
}

export default function Dropdown({
  label,
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  error,
  helperText,
  disabled,
  id,
  className,
  ...props
}: DropdownProps) {
  const generatedId = useId();
  const dropdownId = id ?? generatedId;
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(
    () => options.find((option) => option.value === value),
    [options, value]
  );

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    window.addEventListener('mousedown', handleOutsideClick);
    return () => {
      window.removeEventListener('mousedown', handleOutsideClick);
    };
  }, []);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  function handleSelect(nextValue: string, optionDisabled?: boolean) {
    if (optionDisabled) return;
    if (disabled) return;
    onChange?.(nextValue);
    setOpen(false);
  }

  return (
    <div className={cn('flex flex-col gap-1', className)} {...props}>
      {label && (
        <label
          htmlFor={dropdownId}
          className="body-sm font-medium text-[var(--color-text)]"
        >
          {label}
        </label>
      )}

      <div ref={containerRef} className="relative">
        <button
          id={dropdownId}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
          className={cn(
            'group w-full rounded-[var(--radius-md)] border border-[var(--color-border)]',
            'px-[var(--space-3)] py-[var(--space-2)] text-left',
            'bg-[color-mix(in_srgb,var(--color-surface)_86%,var(--color-bg)_14%)]',
            'shadow-[var(--shadow-sm)] transition-all duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]',
            'hover:border-[color-mix(in_srgb,var(--color-primary)_35%,var(--color-border))] hover:shadow-[var(--shadow-md)]',
            'disabled:cursor-not-allowed disabled:opacity-60',
            error && 'border-[var(--color-danger)]'
          )}
        >
          <span className="flex items-center justify-between gap-[var(--space-2)]">
            <span className="flex min-w-0 flex-col">
              <span
                className={cn(
                  'body-sm truncate',
                  selected ? 'text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'
                )}
              >
                {selected?.label ?? placeholder}
              </span>
              {selected?.description && (
                <span className="caption truncate text-[var(--color-text-muted)]">
                  {selected.description}
                </span>
              )}
            </span>

            <span
              className={cn(
                'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                'bg-[color-mix(in_srgb,var(--color-primary)_18%,transparent)]',
                'text-[var(--color-text)] transition-transform duration-200',
                open && 'rotate-180'
              )}
              aria-hidden="true"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none">
                <path
                  d="M4 6l4 4 4-4"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </span>
        </button>

        {open && (
          <div
            role="listbox"
            className={cn(
              'absolute left-0 right-0 z-40 mt-2 overflow-hidden rounded-[var(--radius-md)]',
              'border border-[var(--color-border)] bg-[var(--color-surface)]',
              'shadow-[var(--shadow-lg)] backdrop-blur-sm'
            )}
          >
            <ul className="max-h-64 overflow-y-auto p-1">
              {options.map((option) => {
                const isActive = option.value === value;
                return (
                  <li key={option.value}>
                    <button
                      type="button"
                      onClick={() => handleSelect(option.value, option.disabled)}
                      disabled={option.disabled}
                      className={cn(
                        'w-full rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-2)] text-left',
                        'transition-colors duration-150',
                        isActive
                          ? 'bg-[color-mix(in_srgb,var(--color-primary)_22%,transparent)] text-[var(--color-text)]'
                          : 'text-[var(--color-text)] hover:bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)]',
                        option.disabled && 'cursor-not-allowed opacity-50'
                      )}
                    >
                      <span className="body-sm block">{option.label}</span>
                      {option.description && (
                        <span className="caption block text-[var(--color-text-muted)]">
                          {option.description}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {error && (
        <span role="alert" className="caption text-[var(--color-danger)]">
          {error}
        </span>
      )}

      {!error && helperText && (
        <span className="caption text-[var(--color-text-muted)]">{helperText}</span>
      )}
    </div>
  );
}

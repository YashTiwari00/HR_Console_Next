'use client';

import { ReactNode, useEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/src/lib/cn';
import Button from '../Button';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export default function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  children,
  className,
}: ModalProps) {
  const modalId = useId();
  const titleId = `${modalId}-title`;
  const descriptionId = `${modalId}-description`;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-[var(--space-4)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descriptionId : undefined}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[var(--color-overlay)]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={cn(
          'relative z-10 w-full max-w-lg',
          'bg-[var(--color-surface)] border border-[var(--color-border)]',
          'rounded-[var(--radius-md)]',
          'shadow-[var(--shadow-lg)]',
          'flex flex-col',
          'max-h-[90vh] overflow-hidden',
          className
        )}
      >
        {/* Header */}
        {(title || description) && (
          <div className="flex items-start justify-between gap-[var(--space-3)] px-[var(--space-4)] pt-[var(--space-4)] pb-[var(--space-3)]">
            <div className="flex flex-col gap-[var(--space-1)]">
              {title && (
                <h2
                  id={titleId}
                  className="heading-lg text-[var(--color-text)]"
                >
                  {title}
                </h2>
              )}
              {description && (
                <p
                  id={descriptionId}
                  className="caption"
                >
                  {description}
                </p>
              )}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label="Close modal"
              className="shrink-0 p-[var(--space-1)]"
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
            </Button>
          </div>
        )}

        {/* Content */}
        {children && (
          <div className="px-[var(--space-4)] py-[var(--space-3)] overflow-y-auto flex-1">
            {children}
          </div>
        )}

        {/* Footer */}
        {footer && (
          <div
            className={cn(
              'px-[var(--space-4)] py-[var(--space-3)]',
              'border-t border-[var(--color-border)]',
              'flex items-center justify-end gap-[var(--space-2)]'
            )}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

import { HTMLAttributes } from 'react';
import { cn } from '@/src/lib/cn';

export type SkeletonVariant = 'rect' | 'text' | 'circle';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant;
  width?: string | number;
  height?: string | number;
}

export default function Skeleton({
  variant = 'rect',
  width,
  height,
  className,
  style,
  ...props
}: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-pulse bg-[var(--color-surface)]',
        variant === 'circle' && 'rounded-full',
        variant === 'text' && 'rounded-[var(--radius-sm)] h-2',
        variant === 'rect' && 'rounded-[var(--radius-sm)]',
        className
      )}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        ...style,
      }}
      {...props}
    />
  );
}

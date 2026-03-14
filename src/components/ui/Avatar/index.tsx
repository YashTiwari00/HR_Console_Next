import { HTMLAttributes } from 'react';
import { cn } from '@/src/lib/cn';

export type AvatarSize = 'sm' | 'md' | 'lg';

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  src?: string;
  alt?: string;
  initials?: string;
  size?: AvatarSize;
}

const sizeMap: Record<AvatarSize, { container: string; text: string; img: string }> = {
  sm: { container: 'w-6 h-6', text: 'caption', img: 'w-6 h-6' },
  md: { container: 'w-8 h-8', text: 'body-sm', img: 'w-8 h-8' },
  lg: { container: 'w-12 h-12', text: 'body', img: 'w-12 h-12' },
};

export default function Avatar({
  src,
  alt = '',
  initials,
  size = 'md',
  className,
  ...props
}: AvatarProps) {
  const { container, text, img } = sizeMap[size];

  return (
    <div
      role="img"
      aria-label={alt || initials || 'Avatar'}
      className={cn(
        'relative inline-flex items-center justify-center shrink-0',
        'rounded-full overflow-hidden',
        'bg-[var(--color-surface)] border border-[var(--color-border)]',
        container,
        className
      )}
      {...props}
    >
      {src ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src}
          alt={alt}
          className={cn('object-cover', img)}
        />
      ) : (
        <span
          className={cn(
            'font-medium text-[var(--color-text-muted)] uppercase select-none',
            text
          )}
        >
          {initials?.slice(0, 2) ?? '?'}
        </span>
      )}
    </div>
  );
}

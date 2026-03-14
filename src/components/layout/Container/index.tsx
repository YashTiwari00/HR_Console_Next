import { HTMLAttributes } from 'react';
import { cn } from '@/src/lib/cn';

export type ContainerMaxWidth = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  maxWidth?: ContainerMaxWidth;
}

const maxWidthMap: Record<ContainerMaxWidth, string> = {
  sm: 'max-w-2xl',
  md: 'max-w-4xl',
  lg: 'max-w-6xl',
  xl: 'max-w-7xl',
  full: 'max-w-full',
};

export default function Container({
  maxWidth = 'xl',
  className,
  children,
  ...props
}: ContainerProps) {
  return (
    <div
      className={cn(
        'w-full mx-auto px-6',
        maxWidthMap[maxWidth],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

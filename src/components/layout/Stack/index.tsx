import { HTMLAttributes } from 'react';
import { cn } from '@/src/lib/cn';

export type StackGap = '1' | '2' | '3' | '4' | '5' | '6';
export type StackDirection = 'vertical' | 'horizontal';
export type StackAlign = 'start' | 'center' | 'end' | 'stretch';
export type StackJustify = 'start' | 'center' | 'end' | 'between' | 'around';

export interface StackProps extends HTMLAttributes<HTMLDivElement> {
  gap?: StackGap;
  direction?: StackDirection;
  align?: StackAlign;
  justify?: StackJustify;
}

const gapMap: Record<StackGap, string> = {
  '1': 'gap-1',
  '2': 'gap-2',
  '3': 'gap-4',
  '4': 'gap-6',
  '5': 'gap-8',
  '6': 'gap-12',
};

const alignMap: Record<StackAlign, string> = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
};

const justifyMap: Record<StackJustify, string> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around',
};

export default function Stack({
  gap = '3',
  direction = 'vertical',
  align = 'stretch',
  justify = 'start',
  className,
  children,
  ...props
}: StackProps) {
  return (
    <div
      className={cn(
        'flex',
        direction === 'vertical' ? 'flex-col' : 'flex-row',
        gapMap[gap],
        alignMap[align],
        justifyMap[justify],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

import { HTMLAttributes } from 'react';
import { cn } from '@/src/lib/cn';

export type GridCols = 1 | 2 | 3 | 4 | 6 | 12;
export type GridGap = '1' | '2' | '3' | '4' | '5' | '6';

export interface GridProps extends HTMLAttributes<HTMLDivElement> {
  cols?: GridCols;
  gap?: GridGap;
  /** Responsive: cols at md breakpoint */
  colsMd?: GridCols;
  /** Responsive: cols at lg breakpoint */
  colsLg?: GridCols;
}

const colsMap: Record<GridCols, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  6: 'grid-cols-6',
  12: 'grid-cols-12',
};

const colsMdMap: Record<GridCols, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
  6: 'md:grid-cols-6',
  12: 'md:grid-cols-12',
};

const colsLgMap: Record<GridCols, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  6: 'lg:grid-cols-6',
  12: 'lg:grid-cols-12',
};

const gapMap: Record<GridGap, string> = {
  '1': 'gap-1',
  '2': 'gap-2',
  '3': 'gap-4',
  '4': 'gap-6',
  '5': 'gap-8',
  '6': 'gap-12',
};

export default function Grid({
  cols = 1,
  gap = '3',
  colsMd,
  colsLg,
  className,
  children,
  ...props
}: GridProps) {
  return (
    <div
      className={cn(
        'grid',
        colsMap[cols],
        colsMd && colsMdMap[colsMd],
        colsLg && colsLgMap[colsLg],
        gapMap[gap],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

import { ReactNode } from 'react';
import { cn } from '@/src/lib/cn';
import Skeleton from '@/src/components/ui/Skeleton';
import Stack from '@/src/components/layout/Stack';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render?: (value: unknown, row: T) => ReactNode;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

export interface DataTableProps<T extends Record<string, unknown>> {
  columns: DataTableColumn<T>[];
  rows: T[];
  data?: T[];
  loading?: boolean;
  emptyMessage?: string;
  className?: string;
  rowKey?: (row: T) => string;
}

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, rowIdx) => (
        <tr key={rowIdx} className="border-b border-[var(--color-border)]">
          {Array.from({ length: cols }).map((_, colIdx) => (
            <td key={colIdx} className="px-4 py-4">
              <Skeleton variant="text" width="80%" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export default function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  data,
  loading = false,
  emptyMessage = 'No data to display.',
  className,
  rowKey,
}: DataTableProps<T>) {
  const normalizedRows = rows ?? data ?? [];

  const alignMap = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  };

  return (
    <div
      className={cn(
        'w-full overflow-x-auto',
        'border border-[var(--color-border)] rounded-[var(--radius-md)]',
        'bg-[var(--color-surface)]',
        className
      )}
    >
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            {columns.map((col) => (
              <th
                key={col.key}
                style={col.width ? { width: col.width } : undefined}
                className={cn(
                  'px-4 py-3',
                  'caption font-medium',
                  'bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]',
                  'whitespace-nowrap',
                  alignMap[col.align ?? 'left']
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {loading ? (
            <TableSkeleton cols={columns.length} />
          ) : normalizedRows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center"
              >
                <Stack gap="2" align="center">
                  <svg
                    className="w-12 h-12 text-[var(--color-text-muted)] opacity-40"
                    viewBox="0 0 40 40"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <rect
                      x="4"
                      y="8"
                      width="32"
                      height="24"
                      rx="3"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                    <line
                      x1="4"
                      y1="15"
                      x2="36"
                      y2="15"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                    <line
                      x1="12"
                      y1="8"
                      x2="12"
                      y2="32"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeDasharray="2 2"
                    />
                  </svg>
                  <p className="caption">{emptyMessage}</p>
                </Stack>
              </td>
            </tr>
          ) : (
            normalizedRows.map((row, rowIdx) => {
              const key = rowKey ? rowKey(row) : String(rowIdx);
              return (
                <tr
                  key={key}
                  className={cn(
                    'border-b border-[var(--color-border)] last:border-b-0',
                    'hover:bg-[var(--color-surface-muted)] transition-colors duration-100'
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        'px-4 py-4',
                        'body-sm text-[var(--color-text)]',
                        alignMap[col.align ?? 'left']
                      )}
                    >
                      {col.render
                        ? col.render(row[col.key], row)
                        : (row[col.key] as ReactNode)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

import { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/src/lib/cn';

export interface SidebarLayoutProps extends HTMLAttributes<HTMLDivElement> {
  sidebar: ReactNode;
  sidebarWidth?: string;
}

export default function SidebarLayout({
  sidebar,
  sidebarWidth = '256px',
  className,
  children,
  ...props
}: SidebarLayoutProps) {
  return (
    <div
      className={cn('flex h-screen overflow-hidden bg-[var(--color-bg)]', className)}
      {...props}
    >
      {/* Sidebar — fixed height, independently scrollable */}
      <aside
        className={cn(
          'shrink-0 flex flex-col h-full',
          'bg-[var(--color-surface)] border-r border-[var(--color-border)]',
          'overflow-y-auto'
        )}
        style={{ width: sidebarWidth }}
      >
        {sidebar}
      </aside>

      {/* Main content — fills remaining width, independently scrollable */}
      <main className="flex-1 overflow-y-auto min-w-0">
        {children}
      </main>
    </div>
  );
}

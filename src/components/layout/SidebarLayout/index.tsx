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
      className={cn('flex h-screen min-h-screen overflow-hidden overflow-x-hidden bg-[var(--color-bg)]', className)}
      {...props}
    >
      {/* Sidebar — independently scrollable */}
      <aside
        className={cn(
          'shrink-0 flex h-full min-h-screen flex-col overflow-y-scroll overflow-x-hidden',
          'border-r border-[color-mix(in_srgb,var(--color-border)_75%,transparent)] shadow-[var(--shadow-sm)]',
          'overscroll-contain'
        )}
        style={{
          width: sidebarWidth,
          background: 'linear-gradient(175deg, color-mix(in srgb, var(--color-primary) 4%, var(--color-surface)) 0%, var(--color-surface) 40%, var(--color-surface-muted) 100%)',
        }}
      >
        {sidebar}
      </aside>

      {/* Main content — independently scrollable */}
      <main className="flex-1 min-w-0 min-h-0 h-full overflow-y-auto overflow-x-hidden overscroll-contain bg-[color-mix(in_srgb,var(--color-bg)_88%,var(--color-surface)_12%)] shadow-[-2px_0_12px_color-mix(in_srgb,var(--color-primary)_4%,transparent)_inset]">
        {children}
      </main>
    </div>
  );
}

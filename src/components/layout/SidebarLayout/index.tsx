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
      {/* Sidebar — glass panel */}
      <aside
        className={cn(
          'shrink-0 flex h-full min-h-screen flex-col overflow-y-scroll overflow-x-hidden',
          'border-r border-[color-mix(in_srgb,var(--color-border)_45%,transparent)]',
          'shadow-[2px_0_24px_color-mix(in_srgb,var(--color-primary)_6%,transparent)]',
          'overscroll-contain'
        )}
        style={{
          width: sidebarWidth,
          background: 'color-mix(in srgb, var(--color-surface) 65%, transparent)',
          backdropFilter: 'blur(20px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.5)',
        }}
      >
        {sidebar}
      </aside>

      {/* Main content — subtle glass inset */}
      <main
        className="flex-1 min-w-0 min-h-0 h-full overflow-y-auto overflow-x-hidden overscroll-contain"
        style={{
          background: 'color-mix(in srgb, var(--color-bg) 85%, transparent)',
          backdropFilter: 'blur(8px) saturate(1.2)',
          WebkitBackdropFilter: 'blur(8px) saturate(1.2)',
        }}
      >
        {children}
      </main>
    </div>
  );
}

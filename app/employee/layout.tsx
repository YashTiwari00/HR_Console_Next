import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  Avatar,
  Badge,
  Card,
  Divider,
} from '@/src/components/ui';
import { SidebarLayout, Stack } from '@/src/components/layout';

interface EmployeeLayoutProps {
  children: ReactNode;
}

const navItems = [
  { label: 'My Roster', href: '/employee/roster', active: true },
  { label: 'Shift Calendar', href: '/employee/calendar' },
  { label: 'Leave Requests', href: '/employee/leave' },
  { label: 'Attendance', href: '/employee/attendance' },
  { label: 'Team Notices', href: '/employee/notices' },
  { label: 'Payroll Summary', href: '/employee/payroll' },
];

const quickActions = [
  { label: 'Add Availability', href: '/employee/availability/new' },
  { label: 'Swap Request', href: '/employee/swap-request/new' },
];

export default function EmployeeLayout({ children }: EmployeeLayoutProps) {
  const sidebar = (
    <Stack
      gap="4"
      className="h-full px-[var(--space-3)] py-[var(--space-4)] bg-[linear-gradient(180deg,var(--color-surface)_0%,var(--color-bg)_100%)]"
    >
      <Card className="border-transparent shadow-[var(--shadow-md)]">
        <div className="flex items-start justify-between gap-[var(--space-2)]">
          <div className="flex items-center gap-[var(--space-2)]">
            <Avatar initials="ER" size="md" />
            <div>
              <p className="body font-medium text-[var(--color-text)]">Employee Roster</p>
              <p className="caption">Daily shift hub</p>
            </div>
          </div>
          <Badge variant="info">LIVE</Badge>
        </div>
      </Card>

      <Stack gap="2" className="px-[var(--space-1)]">
        {navItems.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={
              item.active
                ? 'inline-flex w-full items-center justify-start gap-2 rounded-[var(--radius-md)] px-4 py-2 body-sm font-medium transition-colors duration-150 bg-[var(--color-primary)] text-[var(--color-button-text)]'
                : 'inline-flex w-full items-center justify-start gap-2 rounded-[var(--radius-md)] px-4 py-2 body-sm font-medium transition-colors duration-150 text-[var(--color-text)] hover:bg-[var(--color-surface)]'
            }
          >
            {item.label}
          </Link>
        ))}
      </Stack>

      <Divider label="Quick Actions" />

      <Stack gap="2" className="px-[var(--space-1)]">
        {quickActions.map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className="inline-flex w-full items-center justify-start gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2 body-sm font-medium text-[var(--color-text)] transition-colors duration-150 hover:bg-[var(--color-surface)]"
          >
            {action.label}
          </Link>
        ))}
      </Stack>

      <div className="mt-auto">
        <Card className="bg-[var(--color-bg)]">
          <p className="caption mb-[var(--space-2)]">Upcoming shift</p>
          <p className="body font-medium">Monday, 9:00 AM - 5:00 PM</p>
          <p className="caption mt-[var(--space-1)]">Location: Front Desk</p>
        </Card>
      </div>
    </Stack>
  );

  return (
    <SidebarLayout sidebar={sidebar} sidebarWidth="min(300px, 82vw)">
      <div className="min-h-full bg-[linear-gradient(180deg,var(--color-bg)_0%,var(--color-surface)_100%)]">
        <div className="mx-auto w-full max-w-7xl px-[var(--space-3)] py-[var(--space-4)] md:px-[var(--space-5)] md:py-[var(--space-5)]">
          {children}
        </div>
      </div>
    </SidebarLayout>
  );
}

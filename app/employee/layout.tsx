"use client";

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  Button,
  Card,
  Companion,
  Divider,
  NotificationBell,
} from '@/src/components/ui';
import { SidebarLayout, Stack } from '@/src/components/layout';
import { MilestoneToastStack } from '@/src/components/patterns/MilestoneToastStack';
import SidebarThemeToggle from '@/src/components/theme/SidebarThemeToggle';
import { AiModeProvider } from '@/src/context/AiModeContext';
import { logout } from '@/services/authService';
import { fetchCurrentUserContext } from '@/app/employee/_lib/pmsClient';

interface EmployeeLayoutProps {
  children: ReactNode;
}

const baseNavItems = [
  { label: 'Dashboard',        href: '/employee',                   route: '/employee',                   tutorialId: 'nav-dashboard'        },
  { label: 'Goals Workspace',  href: '/employee/goals',             route: '/employee/goals',             tutorialId: 'nav-goals'            },
  { label: 'Progress Updates', href: '/employee/progress',          route: '/employee/progress',          tutorialId: 'nav-progress'         },
  { label: 'Check-ins',        href: '/employee/check-ins',         route: '/employee/check-ins',         tutorialId: 'nav-checkins'         },
  { label: 'Matrix Feedback',  href: '/employee/matrix-feedback',    route: '/employee/matrix-feedback',    tutorialId: 'nav-matrix-feedback'  },
  { label: 'Meetings',         href: '/employee/meetings',          route: '/employee/meetings',          tutorialId: 'nav-meetings'         },
  { label: 'Cycle Timeline',   href: '/employee/timeline',          route: '/employee/timeline',          tutorialId: 'nav-timeline'         },
];

const baseQuickActions = [
  { label: 'Create Draft Goal', href: '/employee/goals' },
  { label: 'Submit Progress Update', href: '/employee/progress' },
  { label: 'Plan Check-in', href: '/employee/check-ins' },
  { label: 'Submit Matrix Feedback', href: '/employee/matrix-feedback' },
  { label: 'Open Meetings', href: '/employee/meetings' },
];

export default function EmployeeLayout({ children }: EmployeeLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [userName, setUserName] = useState('Employee User');
  const [userRole, setUserRole] = useState('employee');
  const [userDepartment, setUserDepartment] = useState('Engineering');

  const gamificationEnabled = process.env.NEXT_PUBLIC_ENABLE_GAMIFICATION === 'true';
  const growthHubEnabled = process.env.NEXT_PUBLIC_ENABLE_GROWTH_HUB === 'true';
  const navItems = useMemo(() => {
    const items = [...baseNavItems];

    if (growthHubEnabled) {
      const timelineIndex = items.findIndex((item) => item.route === '/employee/timeline');
      const growthNavItem = {
        label: 'My Growth',
        href: '/employee/growth',
        route: '/employee/growth',
        tutorialId: 'nav-growth',
        icon: (
          <svg
            className="h-5 w-5 shrink-0"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M10 16V9.5M10 9.5c0-2.2 1.8-4 4-4v.8c0 2.2-1.8 4-4 4ZM10 9.5c0-2.2-1.8-4-4-4v.8c0 2.2 1.8 4 4 4Z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
      };

      if (timelineIndex >= 0) {
        items.splice(timelineIndex + 1, 0, growthNavItem);
      } else {
        items.push(growthNavItem);
      }
    }

    return items;
  }, [growthHubEnabled]);
  const quickActions = useMemo(() => {
    if (!growthHubEnabled) return baseQuickActions;

    return [
      ...baseQuickActions,
      { label: 'Open Growth Hub', href: '/employee/growth' },
    ];
  }, [growthHubEnabled]);
  const showTopNotificationBell = !pathname.startsWith('/employee/growth');

  useEffect(() => {
    let active = true;

    async function loadUserContext() {
      try {
        const ctx = await fetchCurrentUserContext();
        if (!active) return;

        const name = ctx?.profile?.name || ctx?.user?.name || 'Employee User';
        const role = ctx?.profile?.role || 'employee';
        const department = ctx?.profile?.department || 'General';

        setUserName(name);
        setUserRole(role);
        setUserDepartment(department);
      } catch {
        // Keep fallback values when profile lookup fails.
      }
    }

    loadUserContext();

    return () => {
      active = false;
    };
  }, []);

  const userInitials = useMemo(() => {
    const parts = userName.trim().split(/\s+/).filter(Boolean);
    return (parts[0]?.[0] || 'E') + (parts[1]?.[0] || 'U');
  }, [userName]);

  async function handleLogout() {
    setLogoutError('');
    setLoggingOut(true);

    try {
      const ok = await logout();
      if (!ok) {
        setLogoutError('Unable to logout right now. Please try again.');
        return;
      }

      router.push('/login');
      router.refresh();
    } catch {
      setLogoutError('Unable to logout right now. Please try again.');
    } finally {
      setLoggingOut(false);
      setMenuOpen(false);
    }
  }

  const sidebar = (
    <Stack
      gap="4"
      className="px-[var(--space-3)] py-[var(--space-4)] bg-[linear-gradient(180deg,var(--color-surface)_0%,var(--color-bg)_100%)]"
    >
      <Card className="border-transparent shadow-[var(--shadow-md)]">
        <div className="flex items-start justify-between gap-[var(--space-2)]">
          <div className="flex items-center gap-[var(--space-2)]">
            <Avatar initials={userInitials.toUpperCase()} size="md" />
            <div>
              <p className="body font-medium text-[var(--color-text)]">{userName}</p>
              <p className="caption">{userRole} • {userDepartment}</p>
            </div>
          </div>
          <SidebarThemeToggle />
        </div>
      </Card>

      <Stack gap="2" className="px-[var(--space-1)]">
        {navItems.map((item) => {
          const isActive =
            item.route === "/employee"
              ? pathname === item.route
              : pathname === item.route || pathname.startsWith(`${item.route}/`);

          return (
          <Link
            key={item.label}
            href={item.href}
            data-tutorial={item.tutorialId}
            className={
              isActive
                ? 'inline-flex w-full items-center justify-start gap-2 rounded-[var(--radius-md)] border border-transparent px-4 py-2 body-sm font-medium transition-colors duration-150 bg-[var(--color-primary)] text-[var(--color-button-text)] shadow-[var(--shadow-sm)]'
                : 'inline-flex w-full items-center justify-start gap-2 rounded-[var(--radius-md)] border border-transparent px-4 py-2 body-sm font-medium transition-colors duration-150 text-[var(--color-text)] hover:border-[var(--color-border)] hover:bg-[var(--color-surface-muted)]'
            }
          >
            {'icon' in item ? item.icon : null}
            {item.label}
          </Link>
          );
        })}
      </Stack>

      <Divider label="Quick Actions" />

      <Stack gap="2" className="px-[var(--space-1)]">
        {quickActions.map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className="inline-flex w-full items-center justify-start gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 body-sm font-medium text-[var(--color-text)] transition-colors duration-150 hover:bg-[var(--color-surface-muted)]"
          >
            {action.label}
          </Link>
        ))}
      </Stack>

      <div className="mt-auto">
        <Card className="bg-[var(--color-bg)]">
          <p className="caption mb-[var(--space-2)]">Cycle snapshot</p>
          <p className="body font-medium">Keep updates flowing this week</p>
          <p className="caption mt-[var(--space-1)]">Submit goals and plan your next check-in</p>
        </Card>

        <Card className="mt-[var(--space-2)] bg-[var(--color-bg)]">
          <div className="flex items-center justify-between gap-[var(--space-2)]">
            <div className="flex items-center gap-[var(--space-2)]">
              <Avatar initials="ER" size="sm" />
              <div>
                <p className="body-sm font-medium text-[var(--color-text)]">Account</p>
                <p className="caption">Profile and session options</p>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setMenuOpen((prev) => !prev)}
            >
              {menuOpen ? 'Close' : 'Open'}
            </Button>
          </div>

          {menuOpen && (
            <div className="mt-[var(--space-3)] rounded-[var(--radius-sm)] border border-[var(--color-border)] p-[var(--space-2)]">
              <p className="caption">Signed in as employee role</p>
              <Button
                type="button"
                variant="danger"
                size="sm"
                className="mt-[var(--space-2)] w-full"
                loading={loggingOut}
                onClick={handleLogout}
              >
                Logout
              </Button>
            </div>
          )}

          {logoutError && <p className="caption mt-[var(--space-2)] text-[var(--color-danger)]">{logoutError}</p>}
        </Card>
      </div>
    </Stack>
  );

  return (
    <AiModeProvider role="employee">
      <>
        <SidebarLayout sidebar={sidebar} sidebarWidth="min(300px, 82vw)">
          <div className="min-h-full bg-[linear-gradient(180deg,var(--color-bg)_0%,var(--color-surface)_100%)]">
            <div className="mx-auto w-full max-w-7xl px-[var(--space-3)] py-[var(--space-4)] md:px-[var(--space-5)] md:py-[var(--space-5)]">
              {showTopNotificationBell ? (
                <div className="mb-[var(--space-3)] flex justify-end">
                  <NotificationBell />
                </div>
              ) : null}
              {children}
              <MilestoneToastStack enabled={gamificationEnabled} />
            </div>
          </div>
        </SidebarLayout>
        <Companion role="employee" userName={userName} />
      </>
    </AiModeProvider>
  );
}

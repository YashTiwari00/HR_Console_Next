"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar, Badge, Button, Card, Divider } from "@/src/components/ui";
import { SidebarLayout, Stack } from "@/src/components/layout";
import { logout } from "@/services/authService";

interface ManagerLayoutProps {
  children: ReactNode;
}

const navItems = [
  { label: "Dashboard", href: "/manager", route: "/manager" },
  { label: "My Goals Workspace", href: "/manager/goals", route: "/manager/goals" },
  { label: "My Progress Updates", href: "/manager/progress", route: "/manager/progress" },
  { label: "Team Progress Updates", href: "/manager/team-progress", route: "/manager/team-progress" },
  { label: "My Check-ins", href: "/manager/check-ins", route: "/manager/check-ins" },
  { label: "My Cycle Timeline", href: "/manager/timeline", route: "/manager/timeline" },
  { label: "Team Check-ins", href: "/manager/team-check-ins", route: "/manager/team-check-ins" },
  { label: "Approval Queue", href: "/manager/approvals", route: "/manager/approvals" },
];

const quickActions = [
  { label: "Create My Goal", href: "/manager/goals" },
  { label: "Log My Progress", href: "/manager/progress" },
  { label: "Review Team Progress", href: "/manager/team-progress" },
  { label: "Review Pending Goals", href: "/manager/approvals" },
];

export default function ManagerLayout({ children }: ManagerLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  async function handleLogout() {
    setLogoutError("");
    setLoggingOut(true);

    try {
      const ok = await logout();
      if (!ok) {
        setLogoutError("Unable to logout right now. Please try again.");
        return;
      }

      router.push("/login");
      router.refresh();
    } catch {
      setLogoutError("Unable to logout right now. Please try again.");
    } finally {
      setLoggingOut(false);
      setMenuOpen(false);
    }
  }

  const sidebar = (
    <Stack
      gap="4"
      className="h-full px-[var(--space-3)] py-[var(--space-4)] bg-[linear-gradient(180deg,var(--color-surface)_0%,var(--color-bg)_100%)]"
    >
      <Card className="border-transparent shadow-[var(--shadow-md)]">
        <div className="flex items-start justify-between gap-[var(--space-2)]">
          <div className="flex items-center gap-[var(--space-2)]">
            <Avatar initials="MN" size="md" />
            <div>
              <p className="body font-medium text-[var(--color-text)]">Manager Console</p>
              <p className="caption">Approvals and guidance</p>
            </div>
          </div>
          <Badge variant="info">TEAM VIEW</Badge>
        </div>
      </Card>

      <Stack gap="2" className="px-[var(--space-1)]">
        {navItems.map((item) => {
          const isActive =
            item.route === "/manager"
              ? pathname === item.route
              : pathname === item.route || pathname.startsWith(`${item.route}/`);
          return (
            <Link
              key={item.label}
              href={item.href}
              className={
                isActive
                  ? "inline-flex w-full items-center justify-start gap-2 rounded-[var(--radius-md)] px-4 py-2 body-sm font-medium transition-colors duration-150 bg-[var(--color-primary)] text-[var(--color-button-text)]"
                  : "inline-flex w-full items-center justify-start gap-2 rounded-[var(--radius-md)] px-4 py-2 body-sm font-medium transition-colors duration-150 text-[var(--color-text)] hover:bg-[var(--color-surface)]"
              }
            >
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
            className="inline-flex w-full items-center justify-start gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2 body-sm font-medium text-[var(--color-text)] transition-colors duration-150 hover:bg-[var(--color-surface)]"
          >
            {action.label}
          </Link>
        ))}
      </Stack>

      <div className="mt-auto">
        <Card className="bg-[var(--color-bg)]">
          <p className="caption mb-[var(--space-2)]">Manager reminder</p>
          <p className="body font-medium">Close pending approvals quickly</p>
          <p className="caption mt-[var(--space-1)]">Balance team coaching with your own cycle progress</p>
        </Card>

        <Card className="mt-[var(--space-2)] bg-[var(--color-bg)]">
          <div className="flex items-center justify-between gap-[var(--space-2)]">
            <div className="flex items-center gap-[var(--space-2)]">
              <Avatar initials="MN" size="sm" />
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
              {menuOpen ? "Close" : "Open"}
            </Button>
          </div>

          {menuOpen && (
            <div className="mt-[var(--space-3)] rounded-[var(--radius-sm)] border border-[var(--color-border)] p-[var(--space-2)]">
              <p className="caption">Signed in as manager role</p>
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
    <SidebarLayout sidebar={sidebar} sidebarWidth="min(300px, 82vw)">
      <div className="min-h-full bg-[linear-gradient(180deg,var(--color-bg)_0%,var(--color-surface)_100%)]">
        <div className="mx-auto w-full max-w-7xl px-[var(--space-3)] py-[var(--space-4)] md:px-[var(--space-5)] md:py-[var(--space-5)]">
          {children}
        </div>
      </div>
    </SidebarLayout>
  );
}

"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Avatar, Button, Card, Divider } from "@/src/components/ui";
import { SidebarLayout, Stack } from "@/src/components/layout";
import SidebarThemeToggle from "@/src/components/theme/SidebarThemeToggle";
import { logout } from "@/services/authService";
import { fetchCurrentUserContext } from "@/app/employee/_lib/pmsClient";

interface HrLayoutProps {
  children: ReactNode;
}

const navItems = [
  { label: "Dashboard", href: "/hr", route: "/hr" },
  { label: "Approval Queue", href: "/hr/approvals", route: "/hr/approvals" },
  { label: "Check-in Monitoring", href: "/hr/check-ins", route: "/hr/check-ins" },
];

const quickActions = [
  { label: "Review Manager Goals", href: "/hr/approvals" },
  { label: "Review Manager Check-ins", href: "/hr/approvals" },
  { label: "Monitor Manager Cadence", href: "/hr/check-ins" },
];

export default function HrLayout({ children }: HrLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [userName, setUserName] = useState("HR User");
  const [userRole, setUserRole] = useState("hr");
  const [userDepartment, setUserDepartment] = useState("People Operations");

  useEffect(() => {
    let active = true;

    async function loadUserContext() {
      try {
        const ctx = await fetchCurrentUserContext();
        if (!active) return;

        const name = ctx?.profile?.name || ctx?.user?.name || "HR User";
        const role = ctx?.profile?.role || "hr";
        const department = ctx?.profile?.department || "General";

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
    return (parts[0]?.[0] || "H") + (parts[1]?.[0] || "R");
  }, [userName]);

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
          const isActive = item.route === "/hr"
            ? pathname === "/hr" || pathname.startsWith("/hr/managers/")
            : pathname === item.route || pathname.startsWith(`${item.route}/`);
          return (
            <Link
              key={item.label}
              href={item.href}
              className={
                isActive
                  ? "inline-flex w-full items-center justify-start gap-2 rounded-[var(--radius-md)] border border-transparent px-4 py-2 body-sm font-medium transition-colors duration-150 bg-[var(--color-primary)] text-[var(--color-button-text)] shadow-[var(--shadow-sm)]"
                  : "inline-flex w-full items-center justify-start gap-2 rounded-[var(--radius-md)] border border-transparent px-4 py-2 body-sm font-medium transition-colors duration-150 text-[var(--color-text)] hover:border-[var(--color-border)] hover:bg-[var(--color-surface-muted)]"
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
            className="inline-flex w-full items-center justify-start gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 body-sm font-medium text-[var(--color-text)] transition-colors duration-150 hover:bg-[var(--color-surface-muted)]"
          >
            {action.label}
          </Link>
        ))}
      </Stack>

      <div className="mt-auto">
        <Card className="bg-[var(--color-bg)]">
          <p className="caption mb-[var(--space-2)]">HR reminder</p>
          <p className="body font-medium">Focus on manager cadence and coaching quality</p>
          <p className="caption mt-[var(--space-1)]">Resolve pending approvals before cycle lock dates</p>
        </Card>

        <Card className="mt-[var(--space-2)] bg-[var(--color-bg)]">
          <div className="flex items-center justify-between gap-[var(--space-2)]">
            <div className="flex items-center gap-[var(--space-2)]">
              <Avatar initials="HR" size="sm" />
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
              <p className="caption">Signed in as HR role</p>
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

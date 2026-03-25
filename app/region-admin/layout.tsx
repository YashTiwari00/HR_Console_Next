"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Avatar, Button, Card, ChatBot, Divider } from "@/src/components/ui";
import { SidebarLayout, Stack } from "@/src/components/layout";
import SidebarThemeToggle from "@/src/components/theme/SidebarThemeToggle";
import { logout } from "@/services/authService";
import { fetchCurrentUserContext } from "@/app/employee/_lib/pmsClient";

interface RegionAdminLayoutProps {
  children: ReactNode;
}

const navItems = [
  { label: "Dashboard", href: "/region-admin", route: "/region-admin" },
  { label: "Team Analytics", href: "/region-admin/team-analytics", route: "/region-admin/team-analytics" },
  { label: "Check-in Monitoring", href: "/region-admin/check-ins", route: "/region-admin/check-ins" },
];

export default function RegionAdminLayout({ children }: RegionAdminLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [userName, setUserName] = useState("Region Admin");
  const [userRole, setUserRole] = useState("region-admin");
  const [userDepartment, setUserDepartment] = useState("People Operations");
  const [userRegion, setUserRegion] = useState("Unassigned");

  useEffect(() => {
    let active = true;

    async function loadUserContext() {
      try {
        const ctx = await fetchCurrentUserContext();
        if (!active) return;

        const name = ctx?.profile?.name || ctx?.user?.name || "Region Admin";
        const role = ctx?.profile?.role || "region-admin";
        const department = ctx?.profile?.department || "General";
        const region = ctx?.profile?.region || "Unassigned";

        setUserName(name);
        setUserRole(role);
        setUserDepartment(department);
        setUserRegion(region);
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
    return (parts[0]?.[0] || "R") + (parts[1]?.[0] || "A");
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
              <p className="caption">Region: {userRegion}</p>
            </div>
          </div>
          <SidebarThemeToggle />
        </div>
      </Card>

      <Stack gap="2" className="px-[var(--space-1)]">
        {navItems.map((item) => {
          const isDashboardRoute = item.route === "/region-admin";
          const isActive = isDashboardRoute
            ? pathname === item.route
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

      <Divider label="Scope" />

      <Card className="bg-[var(--color-bg)]">
        <p className="caption mb-[var(--space-2)]">Region visibility</p>
        <p className="body font-medium">This dashboard is read-only and region scoped.</p>
        <p className="caption mt-[var(--space-1)]">Employees and managers outside your region are hidden.</p>
      </Card>

      <div className="mt-auto">
        <Card className="bg-[var(--color-bg)]">
          <div className="flex items-center justify-between gap-[var(--space-2)]">
            <div className="flex items-center gap-[var(--space-2)]">
              <Avatar initials="RA" size="sm" />
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
              <p className="caption">Signed in as region admin role</p>
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
    <>
      <SidebarLayout sidebar={sidebar} sidebarWidth="min(300px, 82vw)">
        <div className="min-h-full bg-[linear-gradient(180deg,var(--color-bg)_0%,var(--color-surface)_100%)]">
          <div className="mx-auto w-full max-w-7xl px-[var(--space-3)] py-[var(--space-4)] md:px-[var(--space-5)] md:py-[var(--space-5)]">
            {children}
          </div>
        </div>
      </SidebarLayout>
      <ChatBot role="hr" userName={userName} />
    </>
  );
}

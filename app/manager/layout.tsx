"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar, Button, Card, ChatBot, Divider } from "@/src/components/ui";
import { SidebarLayout, Stack } from "@/src/components/layout";
import SidebarThemeToggle from "@/src/components/theme/SidebarThemeToggle";
import { logout } from "@/services/authService";
import { fetchCurrentUserContext } from "@/app/employee/_lib/pmsClient";

interface ManagerLayoutProps {
  children: ReactNode;
}

type PersonaMode = "manager" | "employee";

const PERSONA_KEY = "managerConsolePersona";

const managerNavItems = [
  { label: "Dashboard", href: "/manager", route: "/manager" },
  { label: "Team Goal Assignment", href: "/manager/team-goals", route: "/manager/team-goals" },
  { label: "Team Progress Overview", href: "/manager/team-progress", route: "/manager/team-progress" },
  { label: "Team Ranking & Graph", href: "/manager/team-analytics", route: "/manager/team-analytics" },
  { label: "Team Approvals", href: "/manager/team-approvals", route: "/manager/team-approvals" },
];

const employeeNavItems = [
  { label: "Personal Dashboard", href: "/manager/employee-dashboard", route: "/manager/employee-dashboard" },
  { label: "Goal Workspace", href: "/manager/goals", route: "/manager/goals" },
  { label: "Progress Updates", href: "/manager/progress", route: "/manager/progress" },
  { label: "My Check-ins", href: "/manager/check-ins", route: "/manager/check-ins" },
  { label: "My Cycle Timeline", href: "/manager/timeline", route: "/manager/timeline" },
];

const managerQuickActions = [
  { label: "Open Manager Dashboard", href: "/manager" },
  { label: "Assign Team Goal", href: "/manager/team-goals" },
  { label: "Review Team Progress", href: "/manager/team-progress" },
  { label: "Open Team Ranking & Graph", href: "/manager/team-analytics" },
  { label: "Review Team Approvals", href: "/manager/team-approvals" },
];

const employeeQuickActions = [
  { label: "Open Personal Dashboard", href: "/manager/employee-dashboard" },
  { label: "Create My Goal", href: "/manager/goals" },
  { label: "Log My Progress", href: "/manager/progress" },
  { label: "Open My Check-ins", href: "/manager/check-ins" },
  { label: "Open My Timeline", href: "/manager/timeline" },
];

const employeePersonaRoutes = [
  "/manager/employee-dashboard",
  "/manager/goals",
  "/manager/progress",
  "/manager/check-ins",
  "/manager/timeline",
];

function getPersonaForPath(pathname: string): PersonaMode {
  if (employeePersonaRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
    return "employee";
  }
  return "manager";
}

export default function ManagerLayout({ children }: ManagerLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const hasHandledInitialRedirect = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [userName, setUserName] = useState("Manager User");
  const [userRole, setUserRole] = useState("manager");
  const [userDepartment, setUserDepartment] = useState("Engineering");
  const [persona, setPersona] = useState<PersonaMode>(() => getPersonaForPath(pathname));

  useEffect(() => {
    let active = true;

    async function loadUserContext() {
      try {
        const ctx = await fetchCurrentUserContext();
        if (!active) return;

        const name = ctx?.profile?.name || ctx?.user?.name || "Manager User";
        const role = ctx?.profile?.role || "manager";
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

  useEffect(() => {
    const nextPersona = getPersonaForPath(pathname);
    setPersona(nextPersona);

    try {
      window.localStorage.setItem(PERSONA_KEY, nextPersona);
    } catch {
      // Ignore storage failures.
    }
  }, [pathname]);

  useEffect(() => {
    if (hasHandledInitialRedirect.current) {
      return;
    }
    hasHandledInitialRedirect.current = true;

    try {
      const storedPersona = window.localStorage.getItem(PERSONA_KEY);
      if (pathname === "/manager" && storedPersona === "employee") {
        router.replace("/manager/employee-dashboard");
      }
    } catch {
      // Ignore storage failures.
    }
  }, [pathname, router]);

  const userInitials = useMemo(() => {
    const parts = userName.trim().split(/\s+/).filter(Boolean);
    return (parts[0]?.[0] || "M") + (parts[1]?.[0] || "U");
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

  function switchPersona(nextPersona: PersonaMode) {
    setPersona(nextPersona);

    try {
      window.localStorage.setItem(PERSONA_KEY, nextPersona);
    } catch {
      // Ignore storage failures.
    }

    if (nextPersona === "manager") {
      router.push("/manager");
      return;
    }

    router.push("/manager/employee-dashboard");
  }

  const navItems = persona === "manager" ? managerNavItems : employeeNavItems;
  const quickActions = persona === "manager" ? managerQuickActions : employeeQuickActions;

  const sidebar = (
    <Stack
      gap="4"
      className=" px-[var(--space-3)] py-[var(--space-4)] bg-[linear-gradient(180deg,var(--color-surface)_0%,var(--color-bg)_100%)]"
    >
      <Card>
        <Stack gap="2">
          <p className="caption">Current View: {persona === "manager" ? "Manager" : "Employee"}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="flex-1"
              variant={persona === "manager" ? "primary" : "secondary"}
              onClick={() => switchPersona("manager")}
            >
              Manager View
            </Button>
            <Button
              type="button"
              size="sm"
              className="flex-1"
              variant={persona === "employee" ? "primary" : "secondary"}
              onClick={() => switchPersona("employee")}
            >
              Employee View
            </Button>
          </div>
        </Stack>
      </Card>

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
            item.route === "/manager"
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
    <>
      <SidebarLayout sidebar={sidebar} sidebarWidth="min(300px, 82vw)">
        <div className="min-h-full bg-[linear-gradient(180deg,var(--color-bg)_0%,var(--color-surface)_100%)]">
          <div className="mx-auto w-full max-w-7xl px-[var(--space-3)] py-[var(--space-4)] md:px-[var(--space-5)] md:py-[var(--space-5)]">
            {children}
          </div>
        </div>
      </SidebarLayout>
      <ChatBot role="manager" userName={userName} />
    </>
  );
}

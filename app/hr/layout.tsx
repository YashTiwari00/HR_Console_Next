"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Avatar, Button, Card, Companion, Divider } from "@/src/components/ui";
import { SidebarLayout, Stack } from "@/src/components/layout";
import SidebarThemeToggle from "@/src/components/theme/SidebarThemeToggle";
import { logout } from "@/services/authService";
import { fetchCurrentUserContext } from "@/app/employee/_lib/pmsClient";

interface HrLayoutProps {
  children: ReactNode;
}

type HrView = "hr" | "manager" | "employee";

const hrNavItems = [
  { label: "Dashboard",             href: "/hr",                 route: "/hr",                 tutorialId: "nav-dashboard"       },
  { label: "Team Ranking & Graph",  href: "/hr/team-analytics",  route: "/hr/team-analytics",  tutorialId: "nav-team-analytics"  },
  { label: "Check-in Monitoring",   href: "/hr/check-ins",       route: "/hr/check-ins",       tutorialId: "nav-checkins"        },
  { label: "AI Governance",         href: "/hr/ai-governance",   route: "/hr/ai-governance",   tutorialId: "nav-ai-governance"   },
  { label: "Calibration Workbench", href: "/hr/calibration",     route: "/hr/calibration",     tutorialId: "nav-calibration"     },
  { label: "9-Box Talent Map",      href: "/hr/9-box",           route: "/hr/9-box",           tutorialId: "nav-9-box"           },
  { label: "Notification Policy",   href: "/hr/notifications",   route: "/hr/notifications",   tutorialId: "nav-notifications"   },
];

const managerViewNavItems = [
  { label: "Manager Dashboard",    href: "/hr/manager-view",    route: "/hr/manager-view",    tutorialId: "nav-manager-dashboard"  },
  { label: "Team Goal Assignment", href: "/hr/team-goals",      route: "/hr/team-goals",      tutorialId: "nav-team-goals"         },
  { label: "Team Approvals",       href: "/hr/team-approvals",  route: "/hr/team-approvals",  tutorialId: "nav-team-approvals"     },
  { label: "Team Check-ins",       href: "/hr/team-check-ins",  route: "/hr/team-check-ins",  tutorialId: "nav-team-checkins"      },
  { label: "Matrix Reviews",       href: "/hr/matrix-reviews",  route: "/hr/matrix-reviews",  tutorialId: "nav-matrix-reviews"     },
];

const employeeViewNavItems = [
  { label: "Personal Dashboard", href: "/hr/employee-dashboard", route: "/hr/employee-dashboard", tutorialId: "nav-employee-dashboard" },
  { label: "Goal Workspace",     href: "/hr/my-goals",           route: "/hr/my-goals",           tutorialId: "nav-my-goals"           },
  { label: "Progress Updates",   href: "/hr/my-progress",        route: "/hr/my-progress",        tutorialId: "nav-my-progress"        },
  { label: "My Check-ins",       href: "/hr/my-check-ins",       route: "/hr/my-check-ins",       tutorialId: "nav-my-checkins"        },
  { label: "Cycle Timeline",     href: "/hr/my-timeline",        route: "/hr/my-timeline",        tutorialId: "nav-my-timeline"        },
];

const hrQuickActions = [
  { label: "View Team Ranking",      href: "/hr/team-analytics" },
  { label: "Monitor Goal Progress",  href: "/hr"                },
  { label: "Monitor Manager Cadence",href: "/hr/check-ins"      },
  { label: "Review AI Governance",   href: "/hr/ai-governance"  },
  { label: "Run Calibration Session",href: "/hr/calibration"    },
  { label: "Review 9-Box Snapshot",  href: "/hr/9-box"          },
  { label: "Manage Notifications",   href: "/hr/notifications"  },
];

const managerViewQuickActions = [
  { label: "Open Manager Dashboard",  href: "/hr/manager-view"   },
  { label: "Assign Team Goal",        href: "/hr/team-goals"     },
  { label: "Review Team Approvals",   href: "/hr/team-approvals" },
  { label: "Monitor Team Check-ins",  href: "/hr/team-check-ins" },
  { label: "Open Matrix Reviews",     href: "/hr/matrix-reviews" },
];

const employeeViewQuickActions = [
  { label: "Open Personal Dashboard", href: "/hr/employee-dashboard" },
  { label: "Create My Goal",          href: "/hr/my-goals"           },
  { label: "Log My Progress",         href: "/hr/my-progress"        },
  { label: "Open My Check-ins",       href: "/hr/my-check-ins"       },
  { label: "Open My Timeline",        href: "/hr/my-timeline"        },
];

const managerViewRoutes = [
  "/hr/manager-view",
  "/hr/team-goals",
  "/hr/team-approvals",
  "/hr/team-check-ins",
  "/hr/matrix-reviews",
];

const employeeViewRoutes = [
  "/hr/employee-dashboard",
  "/hr/my-goals",
  "/hr/my-progress",
  "/hr/my-check-ins",
  "/hr/my-timeline",
];

function getViewForPath(pathname: string): HrView {
  if (managerViewRoutes.some((r) => pathname === r || pathname.startsWith(`${r}/`))) return "manager";
  if (employeeViewRoutes.some((r) => pathname === r || pathname.startsWith(`${r}/`))) return "employee";
  return "hr";
}

export default function HrLayout({ children }: HrLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [userName, setUserName] = useState("HR User");
  const [userRole, setUserRole] = useState("hr");
  const [userDepartment, setUserDepartment] = useState("People Operations");
  const [view, setView] = useState<HrView>(() => getViewForPath(pathname));

  useEffect(() => {
    setView(getViewForPath(pathname));
  }, [pathname]);

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

  function switchView(nextView: HrView) {
    setView(nextView);
    if (nextView === "hr") router.push("/hr");
    else if (nextView === "manager") router.push("/hr/manager-view");
    else router.push("/hr/employee-dashboard");
  }

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

  const activeNavItems =
    view === "hr" ? hrNavItems : view === "manager" ? managerViewNavItems : employeeViewNavItems;

  const activeQuickActions =
    view === "hr" ? hrQuickActions : view === "manager" ? managerViewQuickActions : employeeViewQuickActions;

  const sidebar = (
    <Stack
      gap="4"
      className="px-[var(--space-3)] py-[var(--space-4)] bg-[linear-gradient(180deg,var(--color-surface)_0%,var(--color-bg)_100%)]"
    >
      <Card data-tutorial="view-switcher">
        <Stack gap="2">
          <p className="caption">Current View: {view === "hr" ? "HR" : view === "manager" ? "Manager" : "Employee"}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="flex-1"
              variant={view === "hr" ? "primary" : "secondary"}
              onClick={() => switchView("hr")}
            >
              HR
            </Button>
            <Button
              type="button"
              size="sm"
              className="flex-1"
              variant={view === "manager" ? "primary" : "secondary"}
              onClick={() => switchView("manager")}
            >
              Manager
            </Button>
            <Button
              type="button"
              size="sm"
              className="flex-1"
              variant={view === "employee" ? "primary" : "secondary"}
              onClick={() => switchView("employee")}
            >
              Employee
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
        {activeNavItems.map((item) => {
          const isActive = item.route === "/hr"
            ? pathname === "/hr" || pathname.startsWith("/hr/managers/")
            : pathname === item.route || pathname.startsWith(`${item.route}/`);
          return (
            <Link
              key={item.label}
              href={item.href}
              data-tutorial={item.tutorialId}
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
        {activeQuickActions.map((action) => (
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
          <p className="caption mt-[var(--space-1)]">Track organization progress and intervene early on risks</p>
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
    <>
      <SidebarLayout sidebar={sidebar} sidebarWidth="min(300px, 82vw)">
        <div className="min-h-full bg-[linear-gradient(180deg,var(--color-bg)_0%,var(--color-surface)_100%)]">
          <div className="mx-auto w-full max-w-7xl px-[var(--space-3)] py-[var(--space-4)] md:px-[var(--space-5)] md:py-[var(--space-5)]">
            {children}
          </div>
        </div>
      </SidebarLayout>
      <Companion role="hr" userName={userName} />
    </>
  );
}

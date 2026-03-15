"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, getUserRole } from "@/services/authService";
import { Grid, Stack } from "@/src/components/layout";
import { Button, Card } from "@/src/components/ui";

type AppRole = "employee" | "manager" | "hr";

function routeForRole(role: AppRole) {
  if (role === "employee") return "/employee";
  if (role === "manager") return "/manager";
  return "/hr";
}

export default function Home() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionState, setSessionState] = useState<"guest" | "profile-missing">("guest");

  useEffect(() => {
    let cancelled = false;

    async function redirectByRole() {
      try {
        const role = (await getUserRole()) as AppRole | null;
        if (!cancelled && role) {
          router.replace(routeForRole(role));
          return;
        }

        const user = await getCurrentUser();
        if (!cancelled) {
          setSessionState(user ? "profile-missing" : "guest");
        }
      } finally {
        if (!cancelled) {
          setCheckingSession(false);
        }
      }
    }

    redirectByRole();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] px-4 py-8">
        <div className="mx-auto max-w-3xl">
          <Card title="Opening HR Console" description="Resolving your workspace role..." />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,var(--color-bg)_0%,var(--color-surface)_100%)] px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <Stack gap="4">
          <Card
            title="HR Console"
            description={
              sessionState === "profile-missing"
                ? "You are signed in, but your role profile is incomplete. Ask HR/admin to map your role, then re-login."
                : "A unified workspace for employee growth, manager coaching, and HR governance."
            }
          >
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/login">
                <Button type="button">{sessionState === "profile-missing" ? "Re-login" : "Login"}</Button>
              </Link>
              <Link href="/signup">
                <Button type="button" variant="secondary">Create Account</Button>
              </Link>
            </div>
          </Card>

          <Grid cols={1} colsMd={3} gap="3">
            <Card title="Employee" description="Goals, progress updates, and cycle timeline." />
            <Card title="Manager" description="Team progress, check-ins, and approvals." />
            <Card title="HR" description="Manager oversight, governance queue, and drilldowns." />
          </Grid>
        </Stack>
      </div>
    </div>
  );
}

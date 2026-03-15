"use client";

import { getUserRole, login } from "@/services/authService";
import { Alert, Button, Card, Input } from "@/src/components/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState(null);

  const redirectUserByRole = useCallback(async () => {
    const role = await getUserRole();

    if (role === "employee") {
      router.push("/employee");
    }

    if (role === "manager") {
      router.push("/manager");
    }

    if (role === "hr") {
      router.push("/hr");
    }
  }, [router]);

  useEffect(() => {
    if (!session) return;

    redirectUserByRole();
  }, [session, redirectUserByRole]);

  useEffect(() => {
    redirectUserByRole();
  }, [redirectUserByRole]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }

    setLoading(true);
    try {
      const loginSession = await login(email, password);

      if (!loginSession) {
        setError("Login failed. Please check your credentials.");
        return;
      }

      setSession(loginSession);
    } catch {
      setError("Login failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-5xl grid gap-4 md:grid-cols-[1.1fr_1fr]">
        <section className="hidden md:flex rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[linear-gradient(165deg,var(--color-primary)_0%,color-mix(in_srgb,var(--color-primary)_72%,black)_100%)] p-[var(--space-5)] text-[var(--color-button-text)] shadow-[var(--shadow-lg)]">
          <div className="flex flex-col justify-between gap-[var(--space-4)]">
            <div>
              <p className="caption uppercase tracking-[0.14em] text-[color-mix(in_srgb,var(--color-button-text)_76%,transparent)]">
                HR Console
              </p>
              <h1 className="mt-[var(--space-2)] heading-xl text-[var(--color-button-text)] max-w-md">
                Performance and people operations in one place.
              </h1>
              <p className="body mt-[var(--space-3)] text-[color-mix(in_srgb,var(--color-button-text)_86%,transparent)] max-w-sm">
                Drive aligned goals, faster approvals, and transparent check-ins across teams.
              </p>
            </div>

            <div className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-button-text)_28%,transparent)] bg-[color-mix(in_srgb,var(--color-button-text)_10%,transparent)] px-[var(--space-3)] py-[var(--space-2)]">
              <p className="caption text-[color-mix(in_srgb,var(--color-button-text)_86%,transparent)]">
                Enterprise ready
              </p>
              <p className="body-sm mt-1 text-[var(--color-button-text)]">
                Built for employee, manager, and HR workflows.
              </p>
            </div>
          </div>
        </section>

        <Card
          className="shadow-[var(--shadow-lg)]"
          title="Welcome back"
          description="Sign in to continue to your HR workspace."
        >
          <form className="flex flex-col gap-3" onSubmit={handleLogin}>
            {error && (
              <Alert variant="error" title="Login failed" description={error} />
            )}

            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <Input
              label="Password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <Button type="submit" loading={loading}>
              Login
            </Button>
          </form>

          <p className="caption mt-4 text-center">
            New here?{" "}
            <Link
              className="text-[var(--color-primary)] hover:underline"
              href="/signup"
            >
              Create an account
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}

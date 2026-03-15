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
    <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Card
          title="Welcome back"
          description="Login to continue to HR Console."
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

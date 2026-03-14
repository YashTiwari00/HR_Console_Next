"use client";

import { login } from "@/services/authService";
import { Alert, Button, Card, Input } from "@/src/components/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }

    setLoading(true);
    const session = await login(email, password);
    setLoading(false);

    if (!session) {
      setError("Login failed. Please check your credentials.");
      return;
    }

    router.push("/");
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
              <Alert
                variant="error"
                title="Login failed"
                description={error}
              />
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
            <Link className="text-[var(--color-primary)] hover:underline" href="/signup">
              Create an account
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
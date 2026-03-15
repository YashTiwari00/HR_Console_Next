"use client";

import { getUserRole, signup } from "@/services/authService";
import { Alert, Button, Card, Dropdown, Input } from "@/src/components/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const ROLE_OPTIONS = [
  { value: "employee", label: "Employee" },
  { value: "manager", label: "Manager" },
  { value: "hr", label: "HR" },
];

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("employee");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [signedUpUser, setSignedUpUser] = useState(null);

  const getRoleAndRedirect = useCallback(async () => {
    try {
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
    } catch {
      // Keep user on signup if session role cannot be resolved yet.
    }
  }, [router]);
  useEffect(() => {
    if (!signedUpUser) return;

    getRoleAndRedirect();
  }, [signedUpUser, getRoleAndRedirect]);

  useEffect(() => {
    getRoleAndRedirect();
  }, [getRoleAndRedirect]);

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!name || !email || !password || !role) {
      setError("All fields are required.");
      return;
    }

    setLoading(true);
    try {
      const user = await signup(name, email, password, role);

      if (!user) {
        setError("Signup failed. Please check details and try again.");
        return;
      }

      setSignedUpUser(user);
    } catch {
      setError("Signup failed. Please check details and try again.");
    } finally {
      setLoading(false);
    }

    setSuccess("Account created successfully. You can now login.");
    setName("");
    setEmail("");
    setPassword("");
    setRole("employee");
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
                Set up your account and start your performance cycle.
              </h1>
              <p className="body mt-[var(--space-3)] text-[color-mix(in_srgb,var(--color-button-text)_86%,transparent)] max-w-sm">
                Choose your role and get access to role-specific dashboards and workflows.
              </p>
            </div>

            <div className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-button-text)_28%,transparent)] bg-[color-mix(in_srgb,var(--color-button-text)_10%,transparent)] px-[var(--space-3)] py-[var(--space-2)]">
              <p className="caption text-[color-mix(in_srgb,var(--color-button-text)_86%,transparent)]">
                Role-based onboarding
              </p>
              <p className="body-sm mt-1 text-[var(--color-button-text)]">
                Employee, manager, and HR experiences are tailored from the first login.
              </p>
            </div>
          </div>
        </section>

        <Card
          className="shadow-[var(--shadow-lg)]"
          title="Create your account"
          description="Join HR Console to manage your profile and workspace."
        >
          <form className="flex flex-col gap-3" onSubmit={handleSignup}>
            {error && (
              <Alert
                variant="error"
                title="Signup failed"
                description={error}
              />
            )}

            {success && (
              <Alert variant="success" title="Success" description={success} />
            )}

            <Input
              label="Full Name"
              placeholder="Enter your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

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
              placeholder="Enter a strong password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <Dropdown
              label="Role"
              value={role}
              onChange={setRole}
              options={ROLE_OPTIONS}
              helperText="This decides which dashboard the new account lands on."
            />

            <Button type="submit" loading={loading}>
              Create Account
            </Button>
          </form>

          <p className="caption mt-4 text-center">
            Already have an account?{" "}
            <Link
              className="text-[var(--color-primary)] hover:underline"
              href="/login"
            >
              Login
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}

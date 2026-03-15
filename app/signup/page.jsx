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
    <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Card
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

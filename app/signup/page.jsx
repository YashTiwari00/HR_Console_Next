"use client";

import { signup } from "@/services/authService";
import { Alert, Button, Card, Input } from "@/src/components/ui";
import Link from "next/link";
import { useState } from "react";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!name || !email || !password) {
      setError("All fields are required.");
      return;
    }

    setLoading(true);
    const user = await signup(name, email, password);
    setLoading(false);

    if (!user) {
      setError("Signup failed. Please check details and try again.");
      return;
    }

    setSuccess("Account created successfully. You can now login.");
    setName("");
    setEmail("");
    setPassword("");
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
              <Alert
                variant="success"
                title="Success"
                description={success}
              />
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

            <Button type="submit" loading={loading}>
              Create Account
            </Button>
          </form>

          <p className="caption mt-4 text-center">
            Already have an account?{" "}
            <Link className="text-[var(--color-primary)] hover:underline" href="/login">
              Login
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
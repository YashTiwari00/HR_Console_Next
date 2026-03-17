"use client";

import {
  completeGoogleOnboarding,
  finalizeOAuthCallbackSession,
  getRoleRedirectFromServer,
  loginWithGoogle,
  waitForCurrentUser,
} from "@/services/authService";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const ROLES = [
  { value: "employee", label: "Employee" },
  { value: "manager", label: "Manager" },
  { value: "hr", label: "HR" },
];

const ROLE_DESCRIPTIONS = {
  employee: "Track your own goals, updates, and check-ins.",
  manager: "Review team goals, progress, and check-ins.",
  hr: "Manage governance, assignments, and approvals.",
};

export default function OnboardingPage() {
  const router = useRouter();
  const [role, setRole] = useState("employee");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    let active = true;

    async function initialize() {
      const params = new URLSearchParams(window.location.search);
      const callbackUserId = params.get("userId");
      const callbackSecret = params.get("secret");

      if (callbackUserId && callbackSecret) {
        await finalizeOAuthCallbackSession(callbackUserId, callbackSecret);
      }

      const user = await waitForCurrentUser({ attempts: 12, delayMs: 300 });
      if (!active) return;

      setCurrentUser(user);

      if (user) {
        const redirectTo = await getRoleRedirectFromServer();
        if (!active) return;

        if (redirectTo && redirectTo !== "/onboarding") {
          router.replace(redirectTo);
          return;
        }
      }

      setCheckingSession(false);
    }

    initialize();

    return () => {
      active = false;
    };
  }, [router]);

  async function handleGoogleSignIn() {
    setError("");
    setLoading(true);
    try {
      await loginWithGoogle();
    } catch {
      setError("Google sign-in failed. Please try again.");
      setLoading(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!currentUser) {
      setError("Please continue with Google before selecting your role.");
      return;
    }

    if (!confirmed) {
      setError("Please confirm your role selection before continuing.");
      return;
    }

    setLoading(true);
    try {
      await completeGoogleOnboarding(role);
      const redirectTo = await getRoleRedirectFromServer();
      router.replace(redirectTo || "/employee");
    } catch (submitError) {
      const message = String(submitError?.message || "").trim();
      setError(message || "Failed to finish onboarding. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#fdf2e9",
        color: "#4a2c2a",
        padding: "24px",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: 460,
          border: "1px solid rgba(74,44,42,0.2)",
          background: "rgba(253,242,233,0.88)",
          padding: "28px",
          display: "grid",
          gap: "14px",
        }}
      >
        <h1 style={{ margin: 0 }}>Finish onboarding</h1>
        <p style={{ margin: 0, opacity: 0.8 }}>
          Choose your role to enter the correct dashboard.
        </p>

        {error && <p style={{ margin: 0, color: "#b03124" }}>{error}</p>}

        {checkingSession && <p style={{ margin: 0 }}>Checking session...</p>}

        {!checkingSession && !currentUser && (
          <button type="button" onClick={handleGoogleSignIn} disabled={loading}>
            {loading ? "Redirecting to Google..." : "Continue with Google"}
          </button>
        )}

        {!checkingSession && currentUser && (
          <>
            <p style={{ margin: 0 }}>
              Signed in as {currentUser.name || currentUser.email}
            </p>
            <label htmlFor="role">Role</label>
            <select
              id="role"
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setConfirmed(false);
              }}
              disabled={loading}
            >
              {ROLES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <p style={{ margin: 0, opacity: 0.85 }}>
              {ROLE_DESCRIPTIONS[role]}
            </p>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                disabled={loading}
              />
              I confirm this role and understand changes require HR support.
            </label>
            <button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Complete setup"}
            </button>
          </>
        )}
      </form>
    </main>
  );
}

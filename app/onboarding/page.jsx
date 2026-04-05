"use client";

import {
  completeGoogleOnboarding,
  finalizeOAuthCallbackSession,
  getRoleRedirectFromServer,
  loginWithGoogle,
  waitForCurrentUser,
} from "@/services/authService";
import Dropdown from "@/src/components/ui/Dropdown";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const ROLES = [
  { value: "employee", label: "Employee" },
  { value: "manager", label: "Manager" },
  { value: "hr", label: "HR" },
  { value: "leadership", label: "Leadership" },
];

const ROLE_DESCRIPTIONS = {
  employee: "Track your own goals, updates, and check-ins.",
  manager: "Review team goals, progress, and check-ins.",
  hr: "Monitor governance, process health, and fairness across the organization.",
  leadership: "View organization-level strategic dashboards with decision-safe aggregates.",
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
        const meResponse = await fetch("/api/me", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        }).catch(() => null);

        const mePayload = await meResponse?.json().catch(() => ({}));
        const profile = mePayload?.data?.profile || null;
        const profileRole = String(profile?.role || "").trim();

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
    <main className="onboarding-shell">
      <div className="color-wash" aria-hidden="true" />

      <form className="onboarding-panel" onSubmit={handleSubmit}>
        <section className="panel-head reveal">
          <p className="eyebrow">Workspace Setup</p>
          <h1>Finish onboarding</h1>
          <p className="subtitle">Choose your role to enter the correct dashboard.</p>
        </section>

        <section className="panel-body reveal">
          {error && <p className="notice error">{error}</p>}

          {checkingSession && <p className="notice">Checking session...</p>}

          {!checkingSession && !currentUser && (
            <button
              className="button button-primary"
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
            >
              {loading ? "Redirecting to Google..." : "Continue with Google"}
            </button>
          )}

          {!checkingSession && currentUser && (
            <>
              <p className="account-line">
                Signed in as <strong>{currentUser.name || currentUser.email}</strong>
              </p>

              <div className="field-group">
                <Dropdown
                  id="role"
                  label="Role"
                  value={role}
                  onChange={(nextRole) => {
                    setRole(nextRole);
                    setConfirmed(false);
                  }}
                  options={ROLES.map((item) => ({
                    value: item.value,
                    label: item.label,
                    description: ROLE_DESCRIPTIONS[item.value],
                  }))}
                  disabled={loading}
                />
                <p className="role-description">{ROLE_DESCRIPTIONS[role]}</p>
              </div>

              <label className="confirm-row">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  disabled={loading}
                />
                <span>
                  I confirm this role and understand changes require leadership or HR support.
                </span>
              </label>

              <button className="button button-accent" type="submit" disabled={loading}>
                {loading ? "Saving..." : "Complete setup"}
              </button>
            </>
          )}
        </section>
      </form>

      <style jsx>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=Space+Mono:wght@400;700&display=swap');

        .onboarding-shell {
          --c-bg: #fdf2e9;
          --c-text: #4a2c2a;
          --c-muted: #8e6d6b;
          --c-accent: #e67e22;
          --c-accent2: #ff7f50;
          --c-border: rgba(142, 109, 107, 0.2);
          min-height: 100vh;
          position: relative;
          overflow: hidden;
          display: grid;
          place-items: center;
          padding: 24px;
          background: var(--c-bg);
          color: var(--c-text);
          font-family: "Playfair Display", Georgia, serif;
        }

        .color-wash {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            radial-gradient(circle at 100% 0%, rgba(230, 126, 34, 0.22), transparent 34%),
            radial-gradient(circle at 88% 10%, rgba(255, 127, 80, 0.18), transparent 28%);
        }

        .onboarding-panel {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 500px;
          background: rgba(253, 242, 233, 0.92);
          border: 1px solid var(--c-border);
          border-radius: 18px;
          box-shadow: 0 20px 44px rgba(74, 44, 42, 0.12);
          backdrop-filter: blur(2px);
        }

        .panel-head,
        .panel-body {
          padding: 24px;
        }

        .panel-head {
          border-bottom: 1px solid var(--c-border);
          background: linear-gradient(110deg, rgba(230, 126, 34, 0.1), rgba(230, 126, 34, 0));
        }

        .eyebrow {
          margin: 0 0 6px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          font-size: 0.66rem;
          color: var(--c-accent);
          font-weight: 600;
          font-family: "Space Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
        }

        h1 {
          margin: 0;
          font-size: clamp(1.7rem, 2.8vw, 2.2rem);
          line-height: 1.15;
          letter-spacing: -0.02em;
        }

        .subtitle {
          margin: 10px 0 0;
          color: var(--c-muted);
          font-family: "Space Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.78rem;
          line-height: 1.6;
        }

        .panel-body {
          display: grid;
          gap: 14px;
        }

        .notice {
          margin: 0;
          padding: 11px 12px;
          border-radius: 10px;
          border: 1px solid var(--c-border);
          background: rgba(255, 255, 255, 0.55);
          font-family: "Space Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.78rem;
        }

        .notice.error {
          color: #b33f2f;
          border-color: rgba(179, 63, 47, 0.24);
          background: rgba(255, 215, 204, 0.5);
        }

        .account-line {
          margin: 0;
          color: rgba(31, 40, 51, 0.87);
        }

        .field-group {
          display: grid;
          gap: 8px;
        }

        .field-label {
          font-family: "Space Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.74rem;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--c-muted);
        }

        .field-input {
          width: 100%;
          border: 1px solid var(--c-border);
          border-radius: 10px;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.82);
          color: var(--c-text);
          font-family: "Space Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.84rem;
          outline: none;
        }

        .field-input:focus {
          border-color: rgba(230, 126, 34, 0.7);
          box-shadow: 0 0 0 3px rgba(230, 126, 34, 0.12);
        }

        .role-description {
          margin: 0;
          color: var(--c-muted);
          font-size: 0.82rem;
          font-family: "Space Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
          line-height: 1.55;
        }

        .confirm-row {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          font-weight: 500;
          line-height: 1.4;
          font-family: "Space Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.78rem;
          color: var(--c-muted);
        }

        .confirm-row input {
          margin-top: 3px;
          width: 16px;
          height: 16px;
          accent-color: var(--c-accent);
        }

        .button {
          border: 0;
          border-radius: 12px;
          padding: 12px 16px;
          font-weight: 700;
          font-size: 0.98rem;
          cursor: pointer;
          transition: transform 0.18s ease, box-shadow 0.2s ease, filter 0.2s ease;
        }

        .button:disabled {
          cursor: not-allowed;
          filter: saturate(0.5);
          opacity: 0.7;
        }

        .button:not(:disabled):hover {
          transform: translateY(-1px);
        }

        .button:not(:disabled):active {
          transform: translateY(0);
        }

        .button-primary {
          color: #fff;
          background: linear-gradient(120deg, #e67e22, #ff7f50);
          box-shadow: 0 10px 18px rgba(230, 126, 34, 0.3);
        }

        .button-accent {
          color: #fff;
          background: linear-gradient(120deg, #d96b18, #e67e22);
          box-shadow: 0 10px 18px rgba(217, 107, 24, 0.28);
        }

        .reveal {
          animation: riseFade 0.5s ease both;
        }

        .panel-body.reveal {
          animation-delay: 0.12s;
        }

        @keyframes riseFade {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (max-width: 640px) {
          .onboarding-shell {
            padding: 16px;
          }

          .panel-head,
          .panel-body {
            padding: 18px;
          }
        }
      `}</style>
    </main>
  );
}

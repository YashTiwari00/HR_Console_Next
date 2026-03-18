"use client";

import {
  getRoleRedirectFromServer,
  loginWithGoogle,
} from "@/services/authService";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/* ─── styles ─────────────────────────────────────────────────────────────── */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap');

.lumo-auth-root {
  --c-bg-base: #fdf2e9;
  --c-text-main: #4a2c2a;
  --c-text-muted: #8e6d6b;
  --c-accent: #e67e22;
  --c-secondary-accent: #ff7f50;
  --c-golden: #f39c12;
  --ease-fluid: cubic-bezier(0.2, 0.0, 0.2, 1);
  --font-serif: 'Playfair Display', serif;
  --font-mono: 'Space Mono', monospace;

  position: fixed;
  inset: 0;
  background-color: var(--c-bg-base);
  font-family: var(--font-serif);
  overflow: hidden;
  color: var(--c-text-main);
  -webkit-font-smoothing: antialiased;
  cursor: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

.lumo-auth-root *, .lumo-auth-root *::before, .lumo-auth-root *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  cursor: none;
}

.lumo-auth-noise {
  position: absolute;
  inset: 0;
  z-index: 0;
  opacity: 0.12;
  pointer-events: none;
  mix-blend-mode: overlay;
  filter: contrast(120%);
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.6' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
}

.lumo-auth-card {
  position: relative;
  z-index: 10;
  width: 100%;
  max-width: 460px;
  border: 1px solid rgba(142,109,107,0.25);
  padding: 3.5rem;
  background: rgba(253,242,233,0.85);
  backdrop-filter: blur(12px);
  opacity: 0;
  animation: lumoAuthFadeIn 1.2s var(--ease-fluid) forwards 0.1s;
}

.lumo-auth-back {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--font-mono);
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--c-text-muted);
  text-decoration: none;
  margin-bottom: 2.5rem;
  transition: color 0.3s ease;
  pointer-events: auto;
}
.lumo-auth-back:hover { color: var(--c-accent); }

.lumo-auth-eyebrow {
  font-family: var(--font-mono);
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: var(--c-accent);
  margin-bottom: 0.75rem;
}

.lumo-auth-title {
  font-family: var(--font-serif);
  font-size: 2.5rem;
  font-weight: 400;
  letter-spacing: -0.03em;
  color: var(--c-text-main);
  margin-bottom: 0.5rem;
}

.lumo-auth-sub {
  font-family: var(--font-serif);
  font-style: italic;
  font-size: 0.95rem;
  color: var(--c-text-muted);
  margin-bottom: 2.5rem;
}

.lumo-auth-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.lumo-auth-field {
  position: relative;
  display: flex;
  flex-direction: column;
}

.lumo-auth-label {
  font-family: var(--font-mono);
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--c-text-muted);
  margin-bottom: 0.6rem;
  transition: color 0.3s ease;
}

.lumo-auth-input {
  background: transparent;
  border: none;
  border-bottom: 1px solid rgba(74,44,42,0.25);
  padding: 0.6rem 0;
  font-family: var(--font-serif);
  font-size: 1.1rem;
  color: var(--c-text-main);
  outline: none;
  transition: border-color 0.3s ease;
  width: 100%;
}
.lumo-auth-input::placeholder {
  color: rgba(142,109,107,0.5);
  font-style: italic;
}
.lumo-auth-input:focus {
  border-color: var(--c-accent);
}

.lumo-auth-highlight {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 2px;
  width: 0;
  background: var(--c-accent);
  transition: width 0.5s var(--ease-fluid);
}
.lumo-auth-input:focus ~ .lumo-auth-highlight {
  width: 100%;
}

.lumo-auth-submit {
  margin-top: 0.25rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 1.1rem;
  border: none;
  background: var(--c-accent);
  color: white;
  font-weight: 700;
  cursor: none;
  width: 100%;
  transition: all 0.4s var(--ease-fluid);
}
.lumo-auth-submit:hover:not(:disabled) {
  background: var(--c-secondary-accent);
  box-shadow: 0 0 28px rgba(230,126,34,0.35);
}
.lumo-auth-submit:disabled {
  opacity: 0.6;
}

.lumo-auth-helper {
  font-family: var(--font-mono);
  font-size: 0.62rem;
  letter-spacing: 0.05em;
  color: var(--c-text-muted);
  line-height: 1.6;
}

.lumo-auth-error {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  color: #c0392b;
  letter-spacing: 0.05em;
  border-left: 2px solid #c0392b;
  padding-left: 0.75rem;
  margin-top: -0.5rem;
}

.lumo-auth-footer {
  margin-top: 2rem;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 0.65rem;
  letter-spacing: 0.05em;
  color: var(--c-text-muted);
}

.lumo-auth-link {
  color: var(--c-accent);
  text-decoration: none;
  transition: opacity 0.2s ease;
}
.lumo-auth-link:hover { opacity: 0.75; }

.lumo-cursor-dot {
  position: fixed;
  top: 0; left: 0;
  width: 4px; height: 4px;
  background-color: var(--c-accent);
  z-index: 9999;
  pointer-events: none;
  transform: translate(-50%, -50%);
}

.lumo-cursor-outline {
  position: fixed;
  top: 0; left: 0;
  width: 40px; height: 40px;
  border: 1px solid rgba(230,126,34,0.4);
  border-radius: 50%;
  z-index: 9999;
  pointer-events: none;
  transform: translate(-50%, -50%);
  transition: width 0.2s, height 0.2s;
  mix-blend-mode: color-burn;
}
.lumo-cursor-outline::before, .lumo-cursor-outline::after {
  content: '';
  position: absolute;
  background: var(--c-accent);
}
.lumo-cursor-outline::before { top: 50%; left: -20%; right: -20%; height: 1px; }
.lumo-cursor-outline::after  { left: 50%; top: -20%; bottom: -20%; width: 1px; }

@keyframes lumoAuthFadeIn {
  from { opacity: 0; transform: translateY(16px); filter: blur(6px); }
  to   { opacity: 1; transform: translateY(0);    filter: blur(0); }
}
`;

/* ─── component ──────────────────────────────────────────────────────────── */

export default function LoginPage() {
  const router = useRouter();
  const dotRef = useRef(null);
  const outlineRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /* inject styles */
  useEffect(() => {
    const id = "lumo-login-styles";
    if (!document.getElementById(id)) {
      const style = document.createElement("style");
      style.id = id;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    return () => { document.getElementById(id)?.remove(); };
  }, []);

  /* cursor */
  useEffect(() => {
    let mouseX = window.innerWidth / 2, mouseY = window.innerHeight / 2;
    let cx = mouseX, cy = mouseY;
    let animId;

    const onMove = (e) => {
      mouseX = e.clientX; mouseY = e.clientY;
      if (dotRef.current) {
        dotRef.current.style.left = `${mouseX}px`;
        dotRef.current.style.top = `${mouseY}px`;
      }
    };
    const animCursor = () => {
      cx += (mouseX - cx) * 0.1;
      cy += (mouseY - cy) * 0.1;
      if (outlineRef.current) {
        outlineRef.current.style.left = `${cx}px`;
        outlineRef.current.style.top = `${cy}px`;
      }
      animId = requestAnimationFrame(animCursor);
    };
    animCursor();
    document.addEventListener("mousemove", onMove);

    const grow = () => {
      if (!outlineRef.current) return;
      outlineRef.current.style.width = "60px";
      outlineRef.current.style.height = "60px";
      outlineRef.current.style.borderColor = "#e67e22";
    };
    const shrink = () => {
      if (!outlineRef.current) return;
      outlineRef.current.style.width = "40px";
      outlineRef.current.style.height = "40px";
      outlineRef.current.style.borderColor = "rgba(230,126,34,0.4)";
    };
    const targets = document.querySelectorAll(".lumo-auth-submit, .lumo-auth-input, .lumo-auth-back, .lumo-auth-link");
    targets.forEach(el => { el.addEventListener("mouseenter", grow); el.addEventListener("mouseleave", shrink); });

    return () => {
      cancelAnimationFrame(animId);
      document.removeEventListener("mousemove", onMove);
      targets.forEach(el => { el.removeEventListener("mouseenter", grow); el.removeEventListener("mouseleave", shrink); });
    };
  }, []);

  useEffect(() => {
    let active = true;

    const checkSessionAndRedirect = async () => {
      const redirectTo = await getRoleRedirectFromServer();
      if (!active || !redirectTo) return;
      router.push(redirectTo);
    };

    checkSessionAndRedirect();

    return () => {
      active = false;
    };
  }, [router]);

  const handleGoogleSignIn = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await loginWithGoogle();
    } catch {
      setError("Google sign-in failed. Please try again.");
      setLoading(false);
      return;
    } finally {
      // OAuth redirects away from this page on success.
    }
  };

  return (
    <div className="lumo-auth-root">
      <div className="lumo-auth-noise" />

      <div className="lumo-auth-card">
        <Link href="/" className="lumo-auth-back">← Back to console</Link>

        <p className="lumo-auth-eyebrow">HR Console</p>
        <h1 className="lumo-auth-title">Sign In</h1>
        <p className="lumo-auth-sub">Access your workspace with Google.</p>

        <form className="lumo-auth-form" onSubmit={handleGoogleSignIn}>
          {error && <p className="lumo-auth-error">{error}</p>}

          <button type="submit" className="lumo-auth-submit" disabled={loading}>
            {loading ? "Redirecting to Google..." : "Continue with Google"}
          </button>

          <p className="lumo-auth-helper">
            Your organization role is detected after sign-in. First-time users complete a short role setup.
          </p>
        </form>

        <p className="lumo-auth-footer">
          New here?{" "}
          <Link href="/onboarding" className="lumo-auth-link">Start onboarding</Link>
        </p>
      </div>

      <div ref={dotRef} className="lumo-cursor-dot" />
      <div ref={outlineRef} className="lumo-cursor-outline" />
    </div>
  );
}

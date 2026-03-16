"use client";

import { getUserRole, signup } from "@/services/authService";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/* ─── styles ─────────────────────────────────────────────────────────────── */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap');

.lumo-su-root {
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
  overflow-y: auto;
  color: var(--c-text-main);
  -webkit-font-smoothing: antialiased;
  cursor: none;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
}

.lumo-su-root *, .lumo-su-root *::before, .lumo-su-root *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  cursor: none;
}

.lumo-su-noise {
  position: fixed;
  inset: 0;
  z-index: 0;
  opacity: 0.12;
  pointer-events: none;
  mix-blend-mode: overlay;
  filter: contrast(120%);
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.6' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
}

.lumo-su-card {
  position: relative;
  z-index: 10;
  width: 100%;
  max-width: 460px;
  border: 1px solid rgba(142,109,107,0.25);
  padding: 3.5rem;
  background: rgba(253,242,233,0.85);
  backdrop-filter: blur(12px);
  opacity: 0;
  animation: lumoSuFadeIn 1.2s var(--ease-fluid) forwards 0.1s;
}

.lumo-su-back {
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
}
.lumo-su-back:hover { color: var(--c-accent); }

.lumo-su-eyebrow {
  font-family: var(--font-mono);
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: var(--c-accent);
  margin-bottom: 0.75rem;
}

.lumo-su-title {
  font-family: var(--font-serif);
  font-size: 2.5rem;
  font-weight: 400;
  letter-spacing: -0.03em;
  color: var(--c-text-main);
  margin-bottom: 0.5rem;
}

.lumo-su-sub {
  font-family: var(--font-serif);
  font-style: italic;
  font-size: 0.95rem;
  color: var(--c-text-muted);
  margin-bottom: 2.5rem;
}

.lumo-su-form {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.lumo-su-field {
  position: relative;
  display: flex;
  flex-direction: column;
}

.lumo-su-label {
  font-family: var(--font-mono);
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--c-text-muted);
  margin-bottom: 0.6rem;
  transition: color 0.3s ease;
}

.lumo-su-input {
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
  appearance: none;
}
.lumo-su-input::placeholder {
  color: rgba(142,109,107,0.5);
  font-style: italic;
}
.lumo-su-input:focus {
  border-color: var(--c-accent);
}

.lumo-su-highlight {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 2px;
  width: 0;
  background: var(--c-accent);
  transition: width 0.5s var(--ease-fluid);
}
.lumo-su-input:focus ~ .lumo-su-highlight {
  width: 100%;
}

.lumo-su-helper {
  font-family: var(--font-mono);
  font-size: 0.6rem;
  color: var(--c-text-muted);
  margin-top: 0.4rem;
  letter-spacing: 0.03em;
}

.lumo-su-submit {
  margin-top: 0.5rem;
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
.lumo-su-submit:hover:not(:disabled) {
  background: var(--c-secondary-accent);
  box-shadow: 0 0 28px rgba(230,126,34,0.35);
}
.lumo-su-submit:disabled { opacity: 0.6; }

.lumo-su-error {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  color: #c0392b;
  letter-spacing: 0.05em;
  border-left: 2px solid #c0392b;
  padding-left: 0.75rem;
  margin-top: -0.5rem;
}

.lumo-su-success {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  color: #27ae60;
  letter-spacing: 0.05em;
  border-left: 2px solid #27ae60;
  padding-left: 0.75rem;
  margin-top: -0.5rem;
}

.lumo-su-footer {
  margin-top: 2rem;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 0.65rem;
  letter-spacing: 0.05em;
  color: var(--c-text-muted);
}

.lumo-su-link {
  color: var(--c-accent);
  text-decoration: none;
  transition: opacity 0.2s ease;
}
.lumo-su-link:hover { opacity: 0.75; }

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

@keyframes lumoSuFadeIn {
  from { opacity: 0; transform: translateY(16px); filter: blur(6px); }
  to   { opacity: 1; transform: translateY(0);    filter: blur(0); }
}
`;

const ROLES = [
  { value: "employee", label: "Employee" },
  { value: "manager", label: "Manager" },
  { value: "hr", label: "HR" },
];

/* ─── component ──────────────────────────────────────────────────────────── */

export default function SignupPage() {
  const router = useRouter();
  const dotRef = useRef(null);
  const outlineRef = useRef(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("employee");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [signedUpUser, setSignedUpUser] = useState(null);

  /* inject styles */
  useEffect(() => {
    const id = "lumo-signup-styles";
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
    const targets = document.querySelectorAll(".lumo-su-submit, .lumo-su-input, .lumo-su-back, .lumo-su-link");
    targets.forEach(el => { el.addEventListener("mouseenter", grow); el.addEventListener("mouseleave", shrink); });

    return () => {
      cancelAnimationFrame(animId);
      document.removeEventListener("mousemove", onMove);
      targets.forEach(el => { el.removeEventListener("mouseenter", grow); el.removeEventListener("mouseleave", shrink); });
    };
  }, []);

  const getRoleAndRedirect = useCallback(async () => {
    try {
      const r = await getUserRole();
      if (r === "employee") router.push("/employee");
      if (r === "manager") router.push("/manager");
      if (r === "hr") router.push("/hr");
    } catch { /* keep on signup */ }
  }, [router]);

  useEffect(() => { if (signedUpUser) getRoleAndRedirect(); }, [signedUpUser, getRoleAndRedirect]);
  useEffect(() => { getRoleAndRedirect(); }, [getRoleAndRedirect]);

  const handleSignup = async (e) => {
    e.preventDefault();
    setError(""); setSuccess("");
    if (!name || !email || !password || !role) { setError("All fields are required."); return; }
    setLoading(true);
    try {
      const user = await signup(name, email, password, role);
      if (!user) { setError("Signup failed. Please check details and try again."); return; }
      setSignedUpUser(user);
      setSuccess("Account created. Redirecting...");
      setName(""); setEmail(""); setPassword(""); setRole("employee");
    } catch {
      setError("Signup failed. Please check details and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lumo-su-root">
      <div className="lumo-su-noise" />

      <div className="lumo-su-card">
        <Link href="/" className="lumo-su-back">← Back to console</Link>

        <p className="lumo-su-eyebrow">HR Console</p>
        <h1 className="lumo-su-title">Create Account</h1>
        <p className="lumo-su-sub">Begin your performance cycle.</p>

        <form className="lumo-su-form" onSubmit={handleSignup}>
          {error && <p className="lumo-su-error">{error}</p>}
          {success && <p className="lumo-su-success">{success}</p>}

          <div className="lumo-su-field">
            <label className="lumo-su-label">Full Name</label>
            <input
              className="lumo-su-input"
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="lumo-su-highlight" />
          </div>

          <div className="lumo-su-field">
            <label className="lumo-su-label">Electronic Mail</label>
            <input
              className="lumo-su-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <div className="lumo-su-highlight" />
          </div>

          <div className="lumo-su-field">
            <label className="lumo-su-label">Password</label>
            <input
              className="lumo-su-input"
              type="password"
              placeholder="Enter a strong password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="lumo-su-highlight" />
          </div>

          <div className="lumo-su-field">
            <label className="lumo-su-label">Role</label>
            <select
              className="lumo-su-input"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {ROLES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <div className="lumo-su-highlight" />
            <p className="lumo-su-helper">Determines your dashboard and workflow access.</p>
          </div>

          <button type="submit" className="lumo-su-submit" disabled={loading}>
            {loading ? "Initializing Account..." : "Initiate Access"}
          </button>
        </form>

        <p className="lumo-su-footer">
          Already have an account?{" "}
          <Link href="/login" className="lumo-su-link">Sign in</Link>
        </p>
      </div>

      <div ref={dotRef} className="lumo-cursor-dot" />
      <div ref={outlineRef} className="lumo-cursor-outline" />
    </div>
  );
}

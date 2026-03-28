"use client";

import { useEffect, useState } from "react";

export type TutorialBuddyRole = "employee" | "manager" | "hr" | "region-admin";

export interface TutorialBuddyProps {
  role: TutorialBuddyRole;
  userName?: string;
}

interface TutorialStep {
  title: string;
  body: string;
}

const STEPS: Record<TutorialBuddyRole, TutorialStep[]> = {
  employee: [
    {
      title: "Welcome to HR Console! 🎉",
      body: "I'm Pip, your performance guide! This is your personal workspace to manage your goals and check-ins.",
    },
    {
      title: "Set Your Goals",
      body: "Head to Goals Workspace to create SMART goals. Draft them first, then submit for your manager's approval.",
    },
    {
      title: "Track Your Progress",
      body: "Use Progress Updates to log how you're doing. Regular updates keep your manager in the loop.",
    },
    {
      title: "Schedule Check-ins",
      body: "Check-ins are structured conversations with your manager. Plan them from the Check-ins section.",
    },
    {
      title: "View Your Timeline",
      body: "Cycle Timeline shows the full performance cycle — where you are and what's coming next.",
    },
    {
      title: "Meet Alex, Your AI Assistant",
      body: "See the chat bubble in the bottom-right? That's Alex! Ask anything — goals, feedback, or how the system works.",
    },
  ],
  manager: [
    {
      title: "Welcome, Manager! 🌟",
      body: "I'm Pip! You have two modes: Manager View to lead your team, and Employee View for your own performance goals.",
    },
    {
      title: "Switch Personas",
      body: "Use the Manager / Employee toggle at the top of the sidebar to switch between your two roles seamlessly.",
    },
    {
      title: "Assign Team Goals",
      body: "In Manager View, go to Team Goal Assignment to set goals for your direct reports.",
    },
    {
      title: "Review Approvals",
      body: "Team Approvals is where you approve or reject goal submissions and check-in requests from your team.",
    },
    {
      title: "Track Team Performance",
      body: "Team Progress Overview and Team Ranking & Graph give you a bird's-eye view of your team's health.",
    },
    {
      title: "Your Own Goals Too",
      body: "Switch to Employee View to manage your personal goals, check-ins, and progress — just like any employee.",
    },
  ],
  hr: [
    {
      title: "Welcome to HR Console! 🏢",
      body: "I'm Pip! As an HR admin, you have visibility across the entire organization's performance cycle.",
    },
    {
      title: "Dashboard Overview",
      body: "Your Dashboard shows org-wide goal completion, check-in rates, and performance health at a glance.",
    },
    {
      title: "Team Rankings",
      body: "Team Ranking & Graph helps you identify top performers and teams that need attention or coaching.",
    },
    {
      title: "Check-in Monitoring",
      body: "Check-in Monitoring lets you track manager cadence and flag where coaching conversations are lacking.",
    },
    {
      title: "Your Role",
      body: "You're the guardian of a fair, consistent process. Use your access to intervene early and support managers.",
    },
  ],
  "region-admin": [
    {
      title: "Welcome, Regional Leader! 🗺️",
      body: "I'm Pip! You have a cross-regional view to monitor performance trends across multiple teams.",
    },
    {
      title: "Regional Dashboard",
      body: "Your Dashboard surfaces aggregate performance data — goal completion rates, check-in health, and team summaries.",
    },
    {
      title: "Team Analytics",
      body: "Team Analytics breaks down performance by region, team, and manager so you can spot patterns quickly.",
    },
    {
      title: "Check-in Monitoring",
      body: "Monitor check-in completion rates across your region to ensure consistent manager-employee engagement.",
    },
    {
      title: "Strategic View",
      body: "Use your data to identify coaching gaps, celebrate top-performing teams, and guide regional strategy.",
    },
  ],
};

const STORAGE_KEY = (role: TutorialBuddyRole) => `pip_tutorial_done_${role}`;

/* ── Pip SVG character ── */
function PipCharacter({ blinking }: { blinking: boolean }) {
  return (
    <svg
      width="44"
      height="44"
      viewBox="0 0 44 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Body */}
      <rect x="8" y="18" width="28" height="20" rx="6" fill="var(--color-primary)" />
      {/* Head */}
      <rect x="10" y="6" width="24" height="18" rx="7" fill="var(--color-primary)" />
      {/* Face highlight */}
      <rect x="12" y="8" width="20" height="14" rx="5" fill="var(--color-button-text)" opacity="0.12" />
      {/* Left eye */}
      <ellipse
        cx="17"
        cy="15"
        rx="3"
        ry={blinking ? 0.5 : 3}
        fill="var(--color-button-text)"
        style={{ transition: "ry 0.05s" }}
      />
      {/* Right eye */}
      <ellipse
        cx="27"
        cy="15"
        rx="3"
        ry={blinking ? 0.5 : 3}
        fill="var(--color-button-text)"
        style={{ transition: "ry 0.05s" }}
      />
      {/* Eye shine L */}
      {!blinking && <circle cx="18.2" cy="13.5" r="1" fill="var(--color-primary)" opacity="0.7" />}
      {/* Eye shine R */}
      {!blinking && <circle cx="28.2" cy="13.5" r="1" fill="var(--color-primary)" opacity="0.7" />}
      {/* Smile */}
      <path
        d="M16 20 Q22 24 28 20"
        stroke="var(--color-button-text)"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
        opacity="0.9"
      />
      {/* Antenna */}
      <line x1="22" y1="6" x2="22" y2="2" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="22" cy="1.5" r="2" fill="var(--color-primary)" />
      {/* Belly panel */}
      <rect x="16" y="24" width="12" height="8" rx="3" fill="var(--color-button-text)" opacity="0.15" />
      <circle cx="22" cy="28" r="2" fill="var(--color-button-text)" opacity="0.4" />
      {/* Legs */}
      <rect x="13" y="37" width="6" height="5" rx="2" fill="var(--color-primary)" />
      <rect x="25" y="37" width="6" height="5" rx="2" fill="var(--color-primary)" />
    </svg>
  );
}

export default function TutorialBuddy({ role, userName }: TutorialBuddyProps) {
  const steps = STEPS[role];
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [blinking, setBlinking] = useState(false);
  const [bouncing, setBouncing] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  /* Read localStorage after mount */
  useEffect(() => {
    try {
      const done = window.localStorage.getItem(STORAGE_KEY(role));
      if (!done) {
        setOpen(true);
      }
    } catch {
      setOpen(true);
    }
    setVisible(true);
  }, [role]);

  /* Blink animation every ~4s */
  useEffect(() => {
    const tick = () => {
      setBlinking(true);
      setTimeout(() => setBlinking(false), 120);
    };
    const id = setInterval(tick, 4000 + Math.random() * 2000);
    return () => clearInterval(id);
  }, []);

  /* Bounce animation every ~6s when closed */
  useEffect(() => {
    if (open) return;
    const tick = () => {
      setBouncing(true);
      setTimeout(() => setBouncing(false), 600);
    };
    const id = setInterval(tick, 6000);
    return () => clearInterval(id);
  }, [open]);

  function handleNext() {
    if (step < steps.length - 1) {
      setStep((s) => s + 1);
    } else {
      finish();
    }
  }

  function handlePrev() {
    setStep((s) => Math.max(0, s - 1));
  }

  function finish() {
    setOpen(false);
    try {
      window.localStorage.setItem(STORAGE_KEY(role), "1");
    } catch {
      /* ignore */
    }
  }

  function handleDismiss() {
    setDismissed(true);
    finish();
  }

  function reopen() {
    setStep(0);
    setOpen(true);
  }

  if (!visible || dismissed) return null;

  const current = steps[step];
  const isLast = step === steps.length - 1;
  const greeting = userName ? `Hey ${userName.split(" ")[0]}! ` : "";

  return (
    <>
      <div
        style={{
          position: "fixed",
          bottom: "1.5rem",
          left: "1.5rem",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: "0.5rem",
          pointerEvents: "none",
        }}
      >
        {/* Speech bubble */}
        {open && (
          <div
            style={{
              pointerEvents: "all",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-lg, 12px)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.14)",
              width: "min(280px, calc(100vw - 3rem))",
              padding: "1rem",
              animation: "pipSlideUp 0.2s ease",
              position: "relative",
            }}
          >
            {/* Close button */}
            <button
              onClick={handleDismiss}
              aria-label="Dismiss tutorial"
              style={{
                position: "absolute",
                top: "0.5rem",
                right: "0.5rem",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--color-text-muted)",
                lineHeight: 1,
                padding: "2px 4px",
                fontSize: "0.75rem",
                borderRadius: "4px",
              }}
            >
              ✕
            </button>

            {/* Step indicator */}
            <div style={{ display: "flex", gap: "4px", marginBottom: "0.6rem" }}>
              {steps.map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: i === step ? "16px" : "6px",
                    height: "6px",
                    borderRadius: "3px",
                    background: i === step
                      ? "var(--color-primary)"
                      : "var(--color-border)",
                    transition: "width 0.2s ease, background 0.2s ease",
                  }}
                />
              ))}
            </div>

            {/* Content */}
            <p style={{ fontWeight: 600, fontSize: "0.82rem", color: "var(--color-text)", marginBottom: "0.35rem", lineHeight: 1.3 }}>
              {step === 0 && greeting}{current.title}
            </p>
            <p style={{ fontSize: "0.78rem", color: "var(--color-text-muted, var(--color-text))", lineHeight: 1.5, marginBottom: "0.75rem" }}>
              {current.body}
            </p>

            {/* Navigation */}
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              {step > 0 && (
                <button
                  onClick={handlePrev}
                  style={{
                    background: "var(--color-surface-muted, var(--color-bg))",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm, 6px)",
                    padding: "0.3rem 0.65rem",
                    fontSize: "0.75rem",
                    cursor: "pointer",
                    color: "var(--color-text)",
                    fontWeight: 500,
                  }}
                >
                  ← Back
                </button>
              )}
              <button
                onClick={handleNext}
                style={{
                  background: "var(--color-primary)",
                  border: "none",
                  borderRadius: "var(--radius-sm, 6px)",
                  padding: "0.3rem 0.75rem",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  color: "var(--color-button-text)",
                  fontWeight: 600,
                  marginLeft: step > 0 ? 0 : "auto",
                  display: "block",
                }}
              >
                {isLast ? "Got it! 🎉" : "Next →"}
              </button>
            </div>

            {/* Bubble tail */}
            <div
              style={{
                position: "absolute",
                bottom: "-8px",
                left: "28px",
                width: 0,
                height: 0,
                borderLeft: "8px solid transparent",
                borderRight: "8px solid transparent",
                borderTop: "8px solid var(--color-surface)",
                filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.06))",
              }}
            />
          </div>
        )}

        {/* Character */}
        <button
          onClick={open ? finish : reopen}
          aria-label={open ? "Close tutorial" : "Open tutorial"}
          style={{
            pointerEvents: "all",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: bouncing ? "translateY(-6px)" : "translateY(0)",
            transition: "transform 0.15s ease",
            animation: open ? "pipWave 0.6s ease" : undefined,
            filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.18))",
          }}
        >
          <PipCharacter blinking={blinking} />
          {/* Pulse ring when closed */}
          {!open && (
            <span
              style={{
                position: "absolute",
                width: "52px",
                height: "52px",
                borderRadius: "50%",
                border: "2px solid var(--color-primary)",
                animation: "pipPulse 2s ease infinite",
                opacity: 0.5,
              }}
            />
          )}
        </button>
      </div>

      <style>{`
        @keyframes pipSlideUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pipPulse {
          0%   { transform: scale(1);   opacity: 0.5; }
          70%  { transform: scale(1.4); opacity: 0; }
          100% { transform: scale(1.4); opacity: 0; }
        }
        @keyframes pipWave {
          0%   { transform: rotate(0deg); }
          20%  { transform: rotate(-12deg); }
          40%  { transform: rotate(10deg); }
          60%  { transform: rotate(-8deg); }
          80%  { transform: rotate(6deg); }
          100% { transform: rotate(0deg); }
        }
      `}</style>
    </>
  );
}

"use client";

import { KeyboardEvent, useEffect, useRef, useState } from "react";
import Button from "../Button";
import Card from "../Card";
import Input from "../Input";
import Spinner from "../Spinner";
import AiModeToggle from "@/src/components/patterns/AiModeToggle";
import { useAiMode } from "@/src/context/AiModeContext";

/* ─── types ───────────────────────────────────────────────────────────── */

type Message  = { role: "user" | "assistant"; content: string };
type CompRole = "employee" | "manager" | "hr" | "leadership" | "region-admin";
type ApiRole  = "employee" | "manager" | "hr" | "guest";
type AppMode  = "tutorial" | "chat";
type Status   = "idle" | "loading" | "streaming";

export interface CompanionProps {
  role: CompRole;
  userName?: string;
  /** "lp" uses the landing-page warm palette; "default" uses app CSS vars */
  theme?: "default" | "lp";
}

interface TutorialStep {
  title:   string;
  body:    string;
  target?: string; // CSS selector of the element to spotlight
}

/* ─── theme tokens ────────────────────────────────────────────────────── */

const LP = {
  fab:        "#e67e22",
  fabText:    "#fff",
  headerBg:   "#4a2c2a",
  headerText: "#fdf2e9",
  panelBg:    "#fdf2e9",
  border:     "rgba(74,44,42,0.18)",
  msgUserBg:  "#e67e22",
  msgUserTxt: "#fff",
  msgBotBg:   "rgba(74,44,42,0.06)",
  msgBotTxt:  "#4a2c2a",
  inputBg:    "#fff",
  inputTxt:   "#4a2c2a",
  muted:      "#8e6d6b",
};

const DEF = {
  fab:        "var(--color-primary)",
  fabText:    "var(--color-button-text)",
  headerBg:   "var(--color-primary)",
  headerText: "var(--color-button-text)",
  panelBg:    "var(--color-surface)",
  border:     "var(--color-border)",
  msgUserBg:  "var(--color-primary)",
  msgUserTxt: "var(--color-button-text)",
  msgBotBg:   "var(--color-bg)",
  msgBotTxt:  "var(--color-text)",
  inputBg:    "var(--color-bg)",
  inputTxt:   "var(--color-text)",
  muted:      "var(--color-text-muted)",
};

/* ─── tutorial content ────────────────────────────────────────────────── */

const TUTORIAL: Record<CompRole, TutorialStep[]> = {
  employee: [
    {
      title: "Hey, welcome to HR Console! 👋",
      body:  "I'm Pip, your performance guide. I'll give you a quick tour — then I'll stick around as your AI assistant. Let's go!",
    },
    {
      title: "Goals Workspace",
      body:  "Start here to create your goals. Draft them, refine with AI suggestions, then submit for your manager's approval.",
      target: "[data-tutorial='nav-goals']",
    },
    {
      title: "Progress Updates",
      body:  "Log how your goals are going here. Regular updates keep your manager informed and build your performance record.",
      target: "[data-tutorial='nav-progress']",
    },
    {
      title: "Check-ins",
      body:  "Plan and schedule structured conversations with your manager. This is where coaching happens.",
      target: "[data-tutorial='nav-checkins']",
    },
    {
      title: "Cycle Timeline",
      body:  "See the full performance cycle at a glance — what phase you're in, what's coming, and key deadlines.",
      target: "[data-tutorial='nav-timeline']",
    },
    {
      title: "You're all set! 🎉",
      body:  "That's the tour. You can always click me to chat — I can help with goals, feedback, or anything in the system.",
    },
  ],
  manager: [
    {
      title: "Welcome, Manager! 👋",
      body:  "I'm Pip. You've got two modes: Manager View to lead your team, and Employee View for your own goals. Quick tour?",
    },
    {
      title: "Manager / Employee Switch",
      body:  "Use these buttons to flip between personas. Manager View is for your team; Employee View is for your personal cycle.",
      target: "[data-tutorial='persona-switch']",
    },
    {
      title: "Team Goal Assignment",
      body:  "Assign goals to your direct reports here and track alignment with company objectives.",
      target: "[data-tutorial='nav-team-goals']",
    },
    {
      title: "Team Approvals",
      body:  "Your team's goal submissions and check-in requests land here. Approve or reject with feedback.",
      target: "[data-tutorial='nav-team-approvals']",
    },
    {
      title: "Team Progress & Rankings",
      body:  "See how each team member is tracking and spot who needs a nudge or recognition.",
      target: "[data-tutorial='nav-team-progress']",
    },
    {
      title: "You're all set! 🎉",
      body:  "Switch to Employee View any time to manage your own goals. Click me whenever you need help.",
    },
  ],
  hr: [
    {
      title: "Welcome to HR Console! 👋",
      body:  "I'm Pip. As HR, you have org-wide visibility. Let me show you around quickly.",
    },
    {
      title: "Your Dashboard",
      body:  "This is your command centre — org-wide goal completion rates, check-in health, and performance signals.",
      target: "[data-tutorial='nav-dashboard']",
    },
    {
      title: "Team Ranking & Graph",
      body:  "See which teams and managers are excelling and which need attention or coaching support.",
      target: "[data-tutorial='nav-team-analytics']",
    },
    {
      title: "Check-in Monitoring",
      body:  "Track manager cadence across the org. Flag managers who aren't having regular conversations with their reports.",
      target: "[data-tutorial='nav-checkins']",
    },
    {
      title: "You're all set! 🎉",
      body:  "You're the guardian of a fair, consistent process. Click me anytime you need help or insights.",
    },
  ],
  leadership: [
    {
      title: "Welcome, Leadership! 👋",
      body:  "I'm Pip. You have an organization-level view across managers, teams, and cycle health. Quick tour?",
    },
    {
      title: "Leadership Dashboard",
      body:  "Use this view for strategic snapshots: goal completion, check-in cadence, and performance signals across the org.",
      target: "[data-tutorial='nav-dashboard']",
    },
    {
      title: "Team Analytics",
      body:  "Drill into manager and team performance to identify momentum, risk, and support opportunities.",
      target: "[data-tutorial='nav-team-analytics']",
    },
    {
      title: "Check-in Monitoring",
      body:  "Track coaching cadence and consistency so leadership can unblock execution early.",
      target: "[data-tutorial='nav-checkins']",
    },
    {
      title: "You're all set! 🎉",
      body:  "Use your strategic view to guide decisions and support managers. I'm here whenever you need help.",
    },
  ],
  "region-admin": [
    {
      title: "Welcome, Leadership! 👋",
      body:  "I'm Pip. This legacy role now uses leadership access. Let me walk you through what's available.",
    },
    {
      title: "Leadership Dashboard",
      body:  "Use this view for strategic snapshots: goal completion, check-in cadence, and performance signals across the org.",
      target: "[data-tutorial='nav-dashboard']",
    },
    {
      title: "Team Analytics",
      body:  "Drill into manager and team performance to identify momentum, risk, and support opportunities.",
      target: "[data-tutorial='nav-team-analytics']",
    },
    {
      title: "Check-in Monitoring",
      body:  "Track coaching cadence and consistency so leadership can unblock execution early.",
      target: "[data-tutorial='nav-checkins']",
    },
    {
      title: "You're all set! 🎉",
      body:  "Use your strategic view to guide decisions and support managers. I'm here whenever you need help.",
    },
  ],
};

/* ─── chat greetings (shown after tutorial completes) ─────────────────── */

const GREETINGS: Record<CompRole, string> = {
  employee:       "Tour done! I'm Pip 👋 Ask me anything about your goals, progress, or check-ins.",
  manager:        "Tour done! I'm Pip 👋 Ask me anything about team approvals, check-ins, or your own cycle.",
  hr:             "Tour done! I'm Pip 👋 Ask me anything about governance monitoring, policy workflows, or cycle health.",
  leadership:     "Tour done! I'm Pip 👋 Ask me anything about organization analytics, team performance, or strategic cycle insights.",
  "region-admin": "Tour done! I'm Pip 👋 Ask me anything about organization analytics, team performance, or strategic cycle insights.",
};

const API_ROLE: Record<CompRole, ApiRole> = {
  employee:       "employee",
  manager:        "manager",
  hr:             "hr",
  leadership:     "manager",
  "region-admin": "hr",
};

const STORAGE_KEY = (role: CompRole) => `pip_v2_done_${role}`;

/* ─── Pip SVG character ───────────────────────────────────────────────── */

function PipFace({ blinking, color, textColor }: { blinking: boolean; color: string; textColor: string }) {
  return (
    <svg width="28" height="28" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Body */}
      <rect x="8"  y="18" width="28" height="20" rx="6" fill={color} />
      {/* Head */}
      <rect x="10" y="6"  width="24" height="18" rx="7" fill={color} />
      {/* Face highlight */}
      <rect x="12" y="8"  width="20" height="14" rx="5" fill={textColor} opacity="0.12" />
      {/* Eyes */}
      <ellipse cx="17" cy="15" rx="3" ry={blinking ? 0.4 : 3} fill={textColor} style={{ transition: "ry 0.06s" }} />
      <ellipse cx="27" cy="15" rx="3" ry={blinking ? 0.4 : 3} fill={textColor} style={{ transition: "ry 0.06s" }} />
      {/* Eye shine */}
      {!blinking && <circle cx="18.2" cy="13.5" r="1" fill={color} opacity="0.6" />}
      {!blinking && <circle cx="28.2" cy="13.5" r="1" fill={color} opacity="0.6" />}
      {/* Smile */}
      <path d="M16 20 Q22 24 28 20" stroke={textColor} strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.9" />
      {/* Antenna */}
      <line x1="22" y1="6" x2="22" y2="2" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx="22" cy="1.5" r="2" fill={color} />
      {/* Belly panel */}
      <rect x="16" y="24" width="12" height="8" rx="3" fill={textColor} opacity="0.15" />
      <circle cx="22" cy="28" r="2" fill={textColor} opacity="0.4" />
      {/* Legs */}
      <rect x="13" y="37" width="6" height="5" rx="2" fill={color} />
      <rect x="25" y="37" width="6" height="5" rx="2" fill={color} />
    </svg>
  );
}

/* ─── spotlight overlay ───────────────────────────────────────────────── */

function Spotlight({ selector }: { selector: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) return;

    const update = () => setRect(el.getBoundingClientRect());
    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [selector]);

  if (!rect || rect.width === 0) return null;

  const pad = 6;

  return (
    <div
      aria-hidden="true"
      style={{
        position:     "fixed",
        left:         rect.left - pad,
        top:          rect.top  - pad,
        width:        rect.width  + pad * 2,
        height:       rect.height + pad * 2,
        borderRadius: "10px",
        boxShadow:    "0 0 0 3px var(--color-primary), 0 0 0 9999px rgba(0,0,0,0.38)",
        pointerEvents:"none",
        zIndex:       9997,
        animation:    "pipSpotPulse 1.8s ease-in-out infinite",
      }}
    />
  );
}

/* ─── main component ──────────────────────────────────────────────────── */

export default function Companion({ role, userName, theme = "default" }: CompanionProps) {
  const t       = theme === "lp" ? LP : DEF;
  const steps   = TUTORIAL[role];
  const apiRole = API_ROLE[role];
  const aiMode = useAiMode();

  /* mode & visibility */
  const [mode,      setMode]     = useState<AppMode>("tutorial");
  const [panelOpen, setPanelOpen] = useState(false);
  const [visible,   setVisible]  = useState(false);

  /* tutorial state */
  const [tutStep,   setTutStep]  = useState(0);

  /* chat state */
  const [messages,  setMessages] = useState<Message[]>([]);
  const [input,     setInput]    = useState("");
  const [status,    setStatus]   = useState<Status>("idle");

  /* animation state */
  const [blinking,  setBlinking] = useState(false);
  const [bouncing,  setBouncing] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  /* ── initialise from localStorage ── */
  useEffect(() => {
    try {
      const done = window.localStorage.getItem(STORAGE_KEY(role));
      if (done) {
        setMode("chat");
        setMessages([{ role: "assistant", content: GREETINGS[role] }]);
      } else {
        setPanelOpen(true); // auto-open tutorial on first visit
      }
    } catch {
      setPanelOpen(true);
    }
    setVisible(true);
  }, [role]);

  /* ── scroll chat to bottom ── */
  useEffect(() => {
    if (panelOpen && mode === "chat") {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, panelOpen, mode]);

  /* ── blink every ~4s ── */
  useEffect(() => {
    const tick = () => {
      setBlinking(true);
      setTimeout(() => setBlinking(false), 110);
    };
    const id = setInterval(tick, 4000 + Math.random() * 2000);
    return () => clearInterval(id);
  }, []);

  /* ── bounce nudge when panel closed ── */
  useEffect(() => {
    if (panelOpen) return;
    const tick = () => {
      setBouncing(true);
      setTimeout(() => setBouncing(false), 500);
    };
    const id = setInterval(tick, 7000);
    return () => clearInterval(id);
  }, [panelOpen]);

  /* ── tutorial navigation ── */
  function nextStep() {
    if (tutStep < steps.length - 1) {
      setTutStep((s) => s + 1);
    } else {
      completeTutorial();
    }
  }

  function prevStep() {
    setTutStep((s) => Math.max(0, s - 1));
  }

  function completeTutorial() {
    try { window.localStorage.setItem(STORAGE_KEY(role), "1"); } catch { /* ignore */ }
    setMode("chat");
    setPanelOpen(false);
    setMessages([{ role: "assistant", content: GREETINGS[role] }]);
  }

  function skipTutorial() {
    completeTutorial();
  }

  /* ── chat send ── */
  async function send() {
    const text = input.trim();
    if (!text || status !== "idle") return;

    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setStatus("loading");

    try {
      const requestContext = next.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/ai/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          message: text,
          role: apiRole,
          context: requestContext,
          mode: aiMode.mode,
          messages: next,
          userName,
        }),
      });

      if (!res.body) throw new Error("No stream body");

      const reader      = res.body.getReader();
      const decoder     = new TextDecoder();
      let   accumulated = "";
      let   started     = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        if (!started) { started = true; setStatus("streaming"); }
        setMessages((prev) => {
          const upd = [...prev];
          upd[upd.length - 1] = { role: "assistant", content: accumulated };
          return upd;
        });
      }

      if (!accumulated) {
        setMessages((prev) => {
          const upd = [...prev];
          upd[upd.length - 1] = { role: "assistant", content: "Sorry, I couldn't process that." };
          return upd;
        });
      }
    } catch {
      setMessages((prev) => {
        const upd  = [...prev];
        const last = upd[upd.length - 1];
        const err  = "Oops! Something went wrong. Try again in a moment.";
        if (last?.role === "assistant" && !last.content) {
          upd[upd.length - 1] = { role: "assistant", content: err };
        } else {
          upd.push({ role: "assistant", content: err });
        }
        return upd;
      });
    } finally {
      setStatus("idle");
    }
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function togglePanel() {
    setPanelOpen((o) => !o);
  }

  if (!visible) return null;

  const currentStep   = steps[tutStep];
  const isLastStep    = tutStep === steps.length - 1;
  const hasSpotlight  = mode === "tutorial" && panelOpen && !!currentStep.target;
  const greeting      = userName ? `Hey ${userName.split(" ")[0]}! ` : "";

  return (
    <>
      {/* ── spotlight ── */}
      {hasSpotlight && <Spotlight selector={currentStep.target!} />}

      {/* ── FAB ── */}
      <button
        onClick={togglePanel}
        aria-label={panelOpen ? "Close Pip" : mode === "tutorial" ? "Open tutorial" : "Chat with Pip"}
        style={{
          position:       "fixed",
          bottom:         "1.5rem",
          right:          "1.5rem",
          zIndex:         10000,
          width:          "52px",
          height:         "52px",
          borderRadius:   "50%",
          background:     t.fab,
          color:          t.fabText,
          border:         "none",
          cursor:         "pointer",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          boxShadow:      "0 4px 20px rgba(0,0,0,0.2)",
          transform:      bouncing ? "translateY(-6px)" : "translateY(0)",
          transition:     "transform 0.18s ease, box-shadow 0.15s ease",
        }}
      >
        {panelOpen ? (
          /* close X */
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="2" y1="2" x2="14" y2="14" />
            <line x1="14" y1="2" x2="2" y2="14" />
          </svg>
        ) : (
          <PipFace blinking={blinking} color={t.fabText} textColor={t.fab} />
        )}

        {/* pulse ring when closed during tutorial */}
        {!panelOpen && mode === "tutorial" && (
          <span
            aria-hidden="true"
            style={{
              position:     "absolute",
              inset:        "-4px",
              borderRadius: "50%",
              border:       `2px solid ${t.fab}`,
              animation:    "pipFabPulse 2s ease infinite",
              pointerEvents:"none",
            }}
          />
        )}
      </button>

      {/* ── tutorial panel ── */}
      {mode === "tutorial" && panelOpen && (
        <div
          style={{
            position:  "fixed",
            bottom:    "5.5rem",
            right:     "1.5rem",
            zIndex:    10000,
            width:     "min(300px, calc(100vw - 2rem))",
            animation: "pipSlideUp 0.18s ease",
          }}
        >
          <Card
            style={{
              background:  t.panelBg,
              borderColor: t.border,
              overflow:    "hidden",
            }}
          >
            {/* header */}
            <div
              style={{
                margin:      "calc(-1 * var(--space-3)) calc(-1 * var(--space-4)) var(--space-3)",
                padding:     "0.6rem 1rem",
                background:  t.headerBg,
                display:     "flex",
                alignItems:  "center",
                justifyContent: "space-between",
                borderBottom: `1px solid ${t.border}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <PipFace blinking={false} color={t.headerText} textColor={t.headerBg} />
                <div>
                  <p style={{ fontWeight: 600, fontSize: "0.83rem", color: t.headerText, lineHeight: 1.2 }}>Pip</p>
                  <p style={{ fontSize: "0.67rem", color: t.headerText, opacity: 0.7 }}>Quick tour · step {tutStep + 1} of {steps.length}</p>
                </div>
              </div>
              <button
                onClick={skipTutorial}
                style={{ background: "none", border: "none", cursor: "pointer", color: t.headerText, opacity: 0.65, fontSize: "0.7rem", padding: "2px 4px" }}
              >
                Skip
              </button>
            </div>

            {/* step dots */}
            <div style={{ display: "flex", gap: "4px", marginBottom: "0.65rem" }}>
              {steps.map((_, i) => (
                <div
                  key={i}
                  style={{
                    width:      i === tutStep ? "18px" : "6px",
                    height:     "6px",
                    borderRadius: "3px",
                    background:  i <= tutStep ? t.headerBg : t.border,
                    transition: "width 0.2s ease, background 0.2s ease",
                  }}
                />
              ))}
            </div>

            {/* content */}
            <p style={{ fontWeight: 600, fontSize: "0.83rem", color: t.msgBotTxt, marginBottom: "0.3rem", lineHeight: 1.3 }}>
              {tutStep === 0 && greeting}{currentStep.title}
            </p>
            <p style={{ fontSize: "0.79rem", color: t.muted, lineHeight: 1.55, marginBottom: "0.8rem" }}>
              {currentStep.body}
            </p>

            {/* target hint */}
            {currentStep.target && (
              <p style={{ fontSize: "0.7rem", color: t.headerBg, marginBottom: "0.7rem", display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: t.headerBg, flexShrink: 0 }} />
                See highlighted area ↗
              </p>
            )}

            {/* nav buttons */}
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {tutStep > 0 && (
                <button
                  onClick={prevStep}
                  style={{
                    background:   t.panelBg,
                    border:       `1px solid ${t.border}`,
                    borderRadius: "var(--radius-sm, 6px)",
                    padding:      "0.3rem 0.65rem",
                    fontSize:     "0.75rem",
                    cursor:       "pointer",
                    color:        t.msgBotTxt,
                    fontWeight:   500,
                  }}
                >
                  ← Back
                </button>
              )}
              <button
                onClick={nextStep}
                style={{
                  background:   t.headerBg,
                  border:       "none",
                  borderRadius: "var(--radius-sm, 6px)",
                  padding:      "0.3rem 0.75rem",
                  fontSize:     "0.75rem",
                  cursor:       "pointer",
                  color:        t.headerText,
                  fontWeight:   600,
                  marginLeft:   tutStep > 0 ? 0 : "auto",
                  display:      "block",
                }}
              >
                {isLastStep ? "Got it! 🎉" : "Next →"}
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* ── chat panel ── */}
      {mode === "chat" && panelOpen && (
        <div
          style={{
            position:  "fixed",
            bottom:    "5.5rem",
            right:     "1.5rem",
            zIndex:    10000,
            width:     "min(360px, calc(100vw - 2rem))",
            maxHeight: "calc(100vh - 8rem)",
            animation: "pipSlideUp 0.18s ease",
          }}
        >
          <Card
            className="flex flex-col overflow-hidden"
            style={{ maxHeight: "calc(100vh - 8rem)", background: t.panelBg, borderColor: t.border }}
            footer={
              <div className="flex gap-[var(--space-2)] w-full" style={{ background: t.panelBg }}>
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Ask Pip anything…"
                  className="flex-1"
                  disabled={status !== "idle"}
                  style={{ background: t.inputBg, color: t.inputTxt, borderColor: t.border }}
                />
                <Button
                  size="sm"
                  variant="primary"
                  onClick={send}
                  disabled={!input.trim() || status !== "idle"}
                  loading={status === "loading"}
                >
                  Send
                </Button>
              </div>
            }
          >
            {/* header */}
            <div
              style={{
                margin:         "calc(-1 * var(--space-3)) calc(-1 * var(--space-4)) var(--space-3)",
                padding:        "0.6rem 1rem",
                background:     t.headerBg,
                display:        "flex",
                alignItems:     "center",
                justifyContent: "space-between",
                borderBottom:   `1px solid ${t.border}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <PipFace blinking={false} color={t.headerText} textColor={t.headerBg} />
                <div>
                  <p style={{ fontWeight: 600, fontSize: "0.83rem", color: t.headerText, lineHeight: 1.2 }}>Pip</p>
                  <p style={{ fontSize: "0.67rem", color: t.headerText, opacity: 0.7, textTransform: "capitalize" }}>
                    {role === "region-admin" ? "leadership" : role} workspace · HR Console
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <AiModeToggle />
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
              </div>
            </div>

            {/* messages */}
            <div style={{ overflowY: "auto", maxHeight: "320px", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {messages.map((m, i) => {
                const isStreamingThis = status === "streaming" && i === messages.length - 1 && m.role === "assistant";
                if (m.role === "assistant" && !m.content && status === "loading") return null;
                return (
                  <div
                    key={i}
                    style={{
                      alignSelf:    m.role === "user" ? "flex-end" : "flex-start",
                      background:   m.role === "user" ? t.msgUserBg : t.msgBotBg,
                      color:        m.role === "user" ? t.msgUserTxt : t.msgBotTxt,
                      border:       m.role === "user" ? "none" : `1px solid ${t.border}`,
                      borderRadius: "var(--radius-sm)",
                      padding:      "0.5rem 0.75rem",
                      fontSize:     "0.8rem",
                      lineHeight:   1.55,
                      whiteSpace:   "pre-wrap",
                      maxWidth:     "85%",
                    }}
                  >
                    {m.content}
                    {isStreamingThis && (
                      <span style={{ display: "inline-block", width: "2px", height: "0.85em", background: "currentColor", marginLeft: "1px", verticalAlign: "text-bottom", animation: "cbCursor 0.8s steps(1) infinite" }} />
                    )}
                  </div>
                );
              })}

              {status === "loading" && (
                <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.5rem 0.75rem" }}>
                  <Spinner size="sm" />
                  <span style={{ fontSize: "0.75rem", color: t.muted }}>Pip is thinking…</span>
                </div>
              )}

              {/* replay tutorial link */}
              {messages.length === 1 && (
                <button
                  onClick={() => { setMode("tutorial"); setTutStep(0); setPanelOpen(true); }}
                  style={{ alignSelf: "flex-start", background: "none", border: "none", cursor: "pointer", fontSize: "0.72rem", color: t.headerBg, padding: "0 0.75rem 0.25rem", textDecoration: "underline", textUnderlineOffset: "2px" }}
                >
                  Replay the tour
                </button>
              )}

              <div ref={bottomRef} />
            </div>
          </Card>
        </div>
      )}

      <style>{`
        @keyframes pipSlideUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pipFabPulse {
          0%   { transform: scale(1);   opacity: 0.6; }
          70%  { transform: scale(1.5); opacity: 0; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes pipSpotPulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.7; }
        }
        @keyframes cbCursor {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0; }
        }
      `}</style>
    </>
  );
}

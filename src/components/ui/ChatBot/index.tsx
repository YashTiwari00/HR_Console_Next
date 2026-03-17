"use client";

import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { Button, Card, Input, Spinner } from "@/src/components/ui";

type Message = { role: "user" | "assistant"; content: string };
type ChatRole = "employee" | "manager" | "hr" | "guest";
type Status = "idle" | "loading" | "streaming";

export interface ChatBotProps {
  role?: ChatRole;
  userName?: string;
  /** "lp" uses the landing-page warm palette; "default" uses app CSS vars */
  theme?: "default" | "lp";
}

/* ---------- theme tokens ---------- */

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

/* ---------- greetings ---------- */

const GREETINGS: Record<ChatRole, string> = {
  employee: "Hey! I'm Alex 👋 I can help with your goals, progress updates, and check-ins. What do you need?",
  manager:  "Hey! I'm Alex 👋 I can help with team approvals, check-ins, and your own performance cycle. What do you need?",
  hr:       "Hey! I'm Alex 👋 I can help with team assignments, the approval queue, and cycle governance. What do you need?",
  guest:    "Hey there! I'm Alex 👋 Ask me anything about HR Console — what it does, how it works, or how to get started.",
};

/* ---------- component ---------- */

export default function ChatBot({ role = "guest", userName, theme = "default" }: ChatBotProps) {
  const t = theme === "lp" ? LP : DEF;
  const [open, setOpen]         = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: GREETINGS[role] },
  ]);
  const [input, setInput]       = useState("");
  const [status, setStatus]     = useState<Status>("idle");
  const bottomRef               = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  async function send() {
    const text = input.trim();
    if (!text || status !== "idle") return;

    const next: Message[] = [...messages, { role: "user", content: text }];
    // Append empty assistant placeholder — will be filled as stream arrives
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setStatus("loading");

    try {
      const res = await fetch("/api/ai/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ messages: next, role, userName }),
      });

      if (!res.body) throw new Error("No stream body");

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let started     = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        accumulated += decoder.decode(value, { stream: true });

        if (!started) { started = true; setStatus("streaming"); }

        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: accumulated };
          return updated;
        });
      }

      if (!accumulated) {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: "Sorry, I couldn't process that." };
          return updated;
        });
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        const errMsg = "Oops! Something went wrong. Try again in a moment.";
        if (last?.role === "assistant" && !last.content) {
          updated[updated.length - 1] = { role: "assistant", content: errMsg };
        } else {
          updated.push({ role: "assistant", content: errMsg });
        }
        return updated;
      });
    } finally {
      setStatus("idle");
    }
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close Alex" : "Chat with Alex"}
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
          boxShadow:      "0 4px 20px rgba(0,0,0,0.18)",
          transition:     "transform 0.15s ease, opacity 0.15s ease",
        }}
      >
        {open ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="2" y1="2" x2="14" y2="14" /><line x1="14" y1="2" x2="2" y2="14" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 2h16a1 1 0 011 1v10a1 1 0 01-1 1H5l-4 4V3a1 1 0 011-1z" />
          </svg>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position:  "fixed",
            bottom:    "5.5rem",
            right:     "1.5rem",
            zIndex:    10000,
            width:     "min(360px, calc(100vw - 2rem))",
            maxHeight: "calc(100vh - 8rem)",
            animation: "cbSlideUp 0.18s ease",
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
                  placeholder="Ask Alex anything…"
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
                padding:        "0.75rem 1rem",
                background:     t.headerBg,
                display:        "flex",
                alignItems:     "center",
                justifyContent: "space-between",
                borderBottom:   `1px solid ${t.border}`,
              }}
            >
              <div>
                <p style={{ fontWeight: 600, fontSize: "0.85rem", color: t.headerText, lineHeight: 1.2 }}>Alex</p>
                <p style={{ fontSize: "0.68rem", color: t.headerText, opacity: 0.7, textTransform: "capitalize" }}>
                  {role} workspace · HR Console
                </p>
              </div>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
            </div>

            {/* messages */}
            <div style={{ overflowY: "auto", maxHeight: "320px", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {messages.map((m, i) => {
                const isStreamingThis = status === "streaming" && i === messages.length - 1 && m.role === "assistant";
                // Skip empty placeholder while still loading (no content yet)
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

              {/* spinner while waiting for first token */}
              {status === "loading" && (
                <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.5rem 0.75rem" }}>
                  <Spinner size="sm" />
                  <span style={{ fontSize: "0.75rem", color: t.muted }}>Alex is typing…</span>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          </Card>
        </div>
      )}

      <style>{`
        @keyframes cbSlideUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes cbCursor {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
      `}</style>
    </>
  );
}

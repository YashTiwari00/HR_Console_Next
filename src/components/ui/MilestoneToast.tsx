"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MILESTONE_MESSAGES } from "@/lib/milestones";

export interface MilestoneToastProps {
  milestoneType: string;
  goalTitle?: string;
  onDismiss: () => void;
  autoDissmissMs?: number;
}

type MilestoneColor = "success" | "primary" | "warning" | "info";

type MilestoneMessage = {
  title: string;
  body: string;
  emoji: string;
  color: MilestoneColor;
};

const COLOR_MAP: Record<MilestoneColor, string> = {
  success: "var(--color-success)",
  primary: "var(--color-primary)",
  warning: "var(--color-warning)",
  info: "var(--color-info, var(--color-primary))",
};

function truncateText(value: string, maxLength: number) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

export function MilestoneToast({
  milestoneType,
  goalTitle,
  onDismiss,
  autoDissmissMs = 5000,
}: MilestoneToastProps) {
  const toastRef = useRef<HTMLDivElement | null>(null);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissedRef = useRef(false);
  const [visible, setVisible] = useState(false);

  const message = useMemo(() => {
    const lookup = MILESTONE_MESSAGES as Record<string, MilestoneMessage>;
    return lookup[String(milestoneType || "").trim()] || null;
  }, [milestoneType]);

  const resolvedAutoDismissMs = useMemo(() => {
    const numeric = Number(autoDissmissMs);
    if (!Number.isFinite(numeric)) return 5000;
    if (numeric < 0) return 5000;
    return Math.floor(numeric);
  }, [autoDissmissMs]);

  const resolvedGoalTitle = useMemo(() => {
    const fallback = "your goal";
    const input = String(goalTitle || "").trim();
    return truncateText(input || fallback, 40);
  }, [goalTitle]);

  const resolvedBody = useMemo(() => {
    if (!message) return "";
    return message.body.replace("{goalTitle}", resolvedGoalTitle);
  }, [message, resolvedGoalTitle]);

  const runDismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;

    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }

    setVisible(false);

    dismissTimerRef.current = setTimeout(() => {
      onDismiss();
    }, 300);
  }, [onDismiss]);

  useEffect(() => {
    if (!message) return undefined;

    const frameId = window.requestAnimationFrame(() => {
      setVisible(true);
      toastRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [message]);

  useEffect(() => {
    if (!message || resolvedAutoDismissMs <= 0) return undefined;

    autoTimerRef.current = setTimeout(() => {
      runDismiss();
    }, resolvedAutoDismissMs);

    return () => {
      if (autoTimerRef.current) {
        clearTimeout(autoTimerRef.current);
        autoTimerRef.current = null;
      }
    };
  }, [message, resolvedAutoDismissMs, runDismiss]);

  useEffect(() => {
    return () => {
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []);

  if (!message) return null;

  const accentColor = COLOR_MAP[message.color] || COLOR_MAP.primary;

  return (
    <>
      <div
        ref={toastRef}
        tabIndex={-1}
        role="alert"
        aria-live="polite"
        className={[
          "fixed bottom-4 left-2 right-2 z-[9999] w-[calc(100vw-16px)]",
          "sm:left-auto sm:right-4 sm:w-[320px]",
          "rounded-xl border bg-[var(--color-surface-raised)]",
          "border-[var(--color-border)] shadow-[var(--shadow-lg)]",
          "outline-none transition-all duration-300",
          visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
        ].join(" ")}
        style={{ borderLeft: `4px solid ${accentColor}` }}
      >
        <div className="p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2">
              <span className="text-2xl leading-none" aria-hidden="true">
                {message.emoji}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--color-text)]">{message.title}</p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">{resolvedBody}</p>
              </div>
            </div>

            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={runDismiss}
              className="shrink-0 rounded px-1 text-sm leading-none text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            >
              ×
            </button>
          </div>
        </div>

        {resolvedAutoDismissMs > 0 && (
          <div className="h-[2px] w-full bg-[var(--color-surface-muted)]">
            <div
              className="h-full"
              style={{
                backgroundColor: accentColor,
                animationName: "milestone-toast-drain",
                animationDuration: `${resolvedAutoDismissMs}ms`,
                animationTimingFunction: "linear",
                animationFillMode: "forwards",
              }}
            />
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes milestone-toast-drain {
          from {
            width: 100%;
          }
          to {
            width: 0%;
          }
        }
      `}</style>
    </>
  );
}

export default MilestoneToast;

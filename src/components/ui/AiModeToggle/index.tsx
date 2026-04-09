"use client";

import { useMemo } from "react";
import Tooltip from "@/src/components/ui/Tooltip";
import { useAiMode } from "@/src/context/AiModeContext";
import { cn } from "@/src/lib/cn";

type ModeOption = {
  id: "suggestion" | "decision_support";
  label: string;
  description: string;
  icon: JSX.Element;
};

function SuggestionIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 18h6m-5 3h4m-6.6-6.1A6.5 6.5 0 1 1 16.6 15c-.8.8-1.2 1.5-1.4 2.2h-6.4c-.2-.7-.6-1.4-1.4-2.3Z"
      />
    </svg>
  );
}

function DeepAnalysisIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 19h16" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16v-4" />
    </svg>
  );
}

export default function AiModeToggle() {
  const { mode, setMode, canUseDecisionSupport } = useAiMode();

  const options = useMemo<ModeOption[]>(
    () => [
      {
        id: "suggestion",
        label: "Suggestion",
        description: "Suggestion mode gives short, friendly guidance with concise next steps.",
        icon: <SuggestionIcon />,
      },
      {
        id: "decision_support",
        label: "Deep Analysis",
        description: "Deep Analysis mode provides structured decision support with explainability.",
        icon: <DeepAnalysisIcon />,
      },
    ],
    []
  );

  if (!canUseDecisionSupport) {
    return null;
  }

  return (
    <div
      role="group"
      aria-label="AI response mode"
      className="inline-flex items-center gap-[var(--space-1)] rounded-[999px] border border-[var(--color-border)] bg-[var(--color-surface)] p-[2px]"
    >
      {options.map((option) => {
        const isActive = mode === option.id;

        return (
          <Tooltip key={option.id} content={option.description} position="top">
            <button
              type="button"
              aria-label={option.label}
              aria-pressed={isActive}
              onClick={() => setMode(option.id)}
              className={cn(
                "inline-flex items-center gap-[6px] rounded-[999px] px-[10px] py-[6px]",
                "font-medium leading-none",
                "transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]",
                "focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]",
                isActive
                  ? "bg-[var(--color-primary)] text-[var(--color-button-text)]"
                  : "bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
              )}
              style={{ fontSize: "var(--font-size-sm)" }}
            >
              {option.icon}
              <span>{option.label}</span>
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
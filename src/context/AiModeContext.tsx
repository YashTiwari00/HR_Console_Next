"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  type AiMode,
  DEFAULT_MODE,
  ROLES_ALLOWED_DECISION_SUPPORT,
} from "@/lib/ai/modes";

const AI_MODE_STORAGE_KEY = "hr_console_ai_mode";

interface AiModeContextValue {
  mode: AiMode;
  setMode: (mode: AiMode) => void;
  canUseDecisionSupport: boolean;
}

interface AiModeProviderProps {
  role: string;
  children: ReactNode;
}

const AiModeContext = createContext<AiModeContextValue | null>(null);

function isAiMode(value: string | null): value is AiMode {
  return value === "suggestion" || value === "decision_support";
}

function readStoredAiMode(): AiMode {
  if (typeof window === "undefined") {
    return DEFAULT_MODE;
  }

  const storedMode = window.localStorage.getItem(AI_MODE_STORAGE_KEY);
  if (isAiMode(storedMode)) {
    return storedMode;
  }

  return DEFAULT_MODE;
}

function canRoleUseDecisionSupport(role: string): boolean {
  const normalizedRole = String(role || "").trim().toLowerCase();
  return ROLES_ALLOWED_DECISION_SUPPORT.includes(
    normalizedRole as (typeof ROLES_ALLOWED_DECISION_SUPPORT)[number]
  );
}

export function AiModeProvider({ role, children }: AiModeProviderProps) {
  const [mode, setModeState] = useState<AiMode>(() => readStoredAiMode());

  const canUseDecisionSupport = useMemo(() => canRoleUseDecisionSupport(role), [role]);

  useEffect(() => {
    if (mode === "decision_support" && !canUseDecisionSupport) {
      setModeState(DEFAULT_MODE);
      window.localStorage.setItem(AI_MODE_STORAGE_KEY, DEFAULT_MODE);
      return;
    }

    window.localStorage.setItem(AI_MODE_STORAGE_KEY, mode);
  }, [canUseDecisionSupport, mode]);

  const setMode = useCallback(
    (nextMode: AiMode) => {
      const resolvedMode = nextMode === "decision_support" && !canUseDecisionSupport
        ? DEFAULT_MODE
        : nextMode;

      setModeState(resolvedMode);
      window.localStorage.setItem(AI_MODE_STORAGE_KEY, resolvedMode);
    },
    [canUseDecisionSupport]
  );

  const value = useMemo<AiModeContextValue>(
    () => ({
      mode,
      setMode,
      canUseDecisionSupport,
    }),
    [canUseDecisionSupport, mode, setMode]
  );

  return <AiModeContext.Provider value={value}>{children}</AiModeContext.Provider>;
}

export function useAiMode(): AiModeContextValue {
  const context = useContext(AiModeContext);

  if (!context) {
    throw new Error("useAiMode must be used within AiModeProvider");
  }

  return context;
}
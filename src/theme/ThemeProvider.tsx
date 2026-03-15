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

export type ThemePreference = "light" | "dark" | "system";
export type EffectiveTheme = "light" | "dark";

const THEME_STORAGE_KEY = "hr-console-theme-preference";
const THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)";

interface ThemeContextValue {
  themePreference: ThemePreference;
  effectiveTheme: EffectiveTheme;
  setThemePreference: (theme: ThemePreference) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function getSystemTheme(): EffectiveTheme {
  if (typeof window === "undefined") {
    return "light";
  }

  return window.matchMedia(THEME_MEDIA_QUERY).matches ? "dark" : "light";
}

function resolveEffectiveTheme(preference: ThemePreference): EffectiveTheme {
  if (preference === "system") {
    return getSystemTheme();
  }

  return preference;
}

function readThemePreference(): ThemePreference {
  if (typeof window === "undefined") {
    return "light";
  }

  const storedPreference = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (isThemePreference(storedPreference)) {
    return storedPreference;
  }

  return "light";
}

function getInitialThemeState() {
  return {
    themePreference: "light" as ThemePreference,
    systemTheme: "light" as EffectiveTheme,
  };
}

function applyRootTheme(effectiveTheme: EffectiveTheme) {
  const root = document.documentElement;
  root.classList.toggle("dark", effectiveTheme === "dark");
  root.dataset.theme = effectiveTheme;
  root.style.colorScheme = effectiveTheme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(
    getInitialThemeState().themePreference
  );
  const [systemTheme, setSystemTheme] = useState<EffectiveTheme>(
    getInitialThemeState().systemTheme
  );

  const effectiveTheme = useMemo<EffectiveTheme>(() => {
    if (themePreference === "system") {
      return systemTheme;
    }

    return themePreference;
  }, [systemTheme, themePreference]);

  useEffect(() => {
    setThemePreferenceState(readThemePreference());
    setSystemTheme(getSystemTheme());
  }, []);

  useEffect(() => {
    applyRootTheme(effectiveTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, themePreference);
  }, [effectiveTheme, themePreference]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(THEME_MEDIA_QUERY);

    const updateSystemTheme = () => {
      setSystemTheme(mediaQuery.matches ? "dark" : "light");
    };

    updateSystemTheme();

    mediaQuery.addEventListener("change", updateSystemTheme);
    return () => {
      mediaQuery.removeEventListener("change", updateSystemTheme);
    };
  }, []);

  const setThemePreference = useCallback((theme: ThemePreference) => {
    setThemePreferenceState(theme);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemePreferenceState((currentPreference) => {
      const currentEffectiveTheme = resolveEffectiveTheme(currentPreference);
      return currentEffectiveTheme === "dark" ? "light" : "dark";
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      themePreference,
      effectiveTheme,
      setThemePreference,
      toggleTheme,
    }),
    [effectiveTheme, setThemePreference, themePreference, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}

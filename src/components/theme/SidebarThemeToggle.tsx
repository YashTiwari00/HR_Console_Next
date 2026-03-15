"use client";

import { Button } from "@/src/components/ui";
import { useTheme } from "@/src/theme/ThemeProvider";

export default function SidebarThemeToggle() {
  const { effectiveTheme, toggleTheme } = useTheme();
  const isDarkTheme = effectiveTheme === "dark";
  const actionLabel = isDarkTheme ? "Switch to light theme" : "Switch to dark theme";

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={toggleTheme}
      aria-label={actionLabel}
      title={actionLabel}
      className="h-8 w-8 min-w-8 p-0"
    >
      {isDarkTheme ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 1 0 9.8 9.8z"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="4" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v2.5M12 19.5V22M4.93 4.93l1.77 1.77M17.3 17.3l1.77 1.77M2 12h2.5M19.5 12H22M4.93 19.07l1.77-1.77M17.3 6.7l1.77-1.77" />
        </svg>
      )}
    </Button>
  );
}

import { cn } from "@/src/lib/cn";

export interface StreakBadgeProps {
  streak: number;
  cycleNames?: string[];
  loading?: boolean;
  className?: string;
}

type TierStyle = {
  accent: string;
  ringClass: string;
  glow: string;
  message: string;
};

function getTierStyle(streak: number): TierStyle {
  if (streak >= 10) {
    return {
      accent: "var(--color-success)",
      ringClass: "border-[var(--color-success)]",
      glow: "0 0 12px color-mix(in srgb, var(--color-success) 30%, transparent)",
      message: "Legend status 👑",
    };
  }

  if (streak >= 7) {
    return {
      accent: "var(--color-success)",
      ringClass: "border-[var(--color-success)]",
      glow: "0 0 12px color-mix(in srgb, var(--color-success) 30%, transparent)",
      message: "Incredible consistency!",
    };
  }

  if (streak >= 4) {
    return {
      accent: "var(--color-warning)",
      ringClass: "border-[var(--color-warning)]",
      glow: "none",
      message: "On fire! 🔥",
    };
  }

  if (streak >= 2) {
    return {
      accent: "var(--color-primary)",
      ringClass: "border-[var(--color-primary)]",
      glow: "none",
      message: "Building momentum!",
    };
  }

  return {
    accent: "var(--color-text-muted)",
    ringClass: "border-[var(--color-border)]",
    glow: "none",
    message: "Keep going!",
  };
}

function StreakBadgeSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3",
        className
      )}
      aria-hidden="true"
    >
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 animate-pulse rounded-full bg-[var(--color-surface-muted)]" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="h-6 w-12 animate-pulse rounded bg-[var(--color-surface-muted)]" />
          <div className="h-3 w-20 animate-pulse rounded bg-[var(--color-surface-muted)]" />
          <div className="h-3 w-24 animate-pulse rounded bg-[var(--color-surface-muted)]" />
        </div>
      </div>
    </div>
  );
}

export function StreakBadge({ streak, cycleNames, loading = false, className }: StreakBadgeProps) {
  if (loading || streak <= 0) {
    return <StreakBadgeSkeleton className={className} />;
  }

  const tier = getTierStyle(streak);
  const cycleTitle = Array.isArray(cycleNames) && cycleNames.length > 0 ? cycleNames.join(", ") : undefined;

  return (
    <div
      className={cn(
        "rounded-lg border bg-[var(--color-surface)] p-3",
        "transition-shadow duration-200",
        tier.ringClass,
        className
      )}
      title={cycleTitle}
      aria-label={`Check-in streak: ${streak} quarters`}
      style={{ boxShadow: tier.glow }}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl leading-none" aria-hidden="true">
          🔥
        </span>

        <div className="min-w-0">
          <p className="text-2xl font-bold leading-none" style={{ color: tier.accent }}>
            {streak}
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">Quarter Streak</p>
          <p className="mt-1 text-xs font-medium" style={{ color: tier.accent }}>
            {tier.message}
          </p>
        </div>
      </div>
    </div>
  );
}

export default StreakBadge;

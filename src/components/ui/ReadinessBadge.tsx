import { CSSProperties, HTMLAttributes } from "react";
import { cn } from "@/src/lib/cn";

export interface ReadinessBadgeProps {
  label: "Early Stage" | "Developing" | "Ready" | "Exceeding";
  description?: string;
  source?: "snapshot" | "derived";
  size?: "sm" | "md" | "lg";
  showDescription?: boolean;
  className?: string;
}

type ReadinessTone = {
  backgroundColor: string;
  color: string;
  borderColor: string;
};

const toneByLabel: Record<ReadinessBadgeProps["label"], ReadinessTone> = {
  "Early Stage": {
    backgroundColor: "var(--color-muted-subtle)",
    color: "var(--color-muted)",
    borderColor: "var(--color-border)",
  },
  Developing: {
    backgroundColor: "var(--color-info-subtle)",
    color: "var(--color-info)",
    borderColor: "var(--color-info)",
  },
  Ready: {
    backgroundColor: "var(--color-success-subtle)",
    color: "var(--color-success)",
    borderColor: "var(--color-success)",
  },
  Exceeding: {
    backgroundColor: "var(--color-primary-subtle)",
    color: "var(--color-primary)",
    borderColor: "var(--color-primary)",
  },
};

const sizeByVariant: Record<NonNullable<ReadinessBadgeProps["size"]>, { text: string; box: string; icon: number }> = {
  sm: { text: "text-xs", box: "px-2 py-0.5", icon: 12 },
  md: { text: "text-sm", box: "px-3 py-1", icon: 14 },
  lg: { text: "text-base", box: "px-4 py-2", icon: 16 },
};

function EarlyStageIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="7" cy="13" r="2.6" />
      <path d="M10 12l4-4m0 0h-3m3 0v3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DevelopingIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 13l5-4 7-4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="9" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="16" cy="5" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ReadyIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="10" cy="10" r="7" />
      <path d="M6.8 10.2l2.2 2.2 4.2-4.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ExceedingIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M10 3.5l1.9 4 4.4.6-3.2 3.2.8 4.4-3.9-2.1-3.9 2.1.8-4.4-3.2-3.2 4.4-.6 1.9-4Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconForLabel({ label, size }: { label: ReadinessBadgeProps["label"]; size: number }) {
  if (label === "Early Stage") return <EarlyStageIcon size={size} />;
  if (label === "Developing") return <DevelopingIcon size={size} />;
  if (label === "Ready") return <ReadyIcon size={size} />;
  return <ExceedingIcon size={size} />;
}

export function ReadinessBadge({
  label,
  description,
  source = "snapshot",
  size = "md",
  showDescription = false,
  className,
  ...props
}: ReadinessBadgeProps & Omit<HTMLAttributes<HTMLDivElement>, "className">) {
  const tone = toneByLabel[label];
  const sizing = sizeByVariant[size];

  const pillStyle: CSSProperties = {
    backgroundColor: tone.backgroundColor,
    color: tone.color,
    borderColor: tone.borderColor,
  };

  return (
    <div className={cn("inline-flex flex-col items-start", className)} role="status" aria-label={`Readiness level: ${label}`} {...props}>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap",
          sizing.text,
          sizing.box
        )}
        style={pillStyle}
      >
        <IconForLabel label={label} size={sizing.icon} />
        <span>{label}</span>
        {source === "derived" && (
          <span className="text-xs italic" style={{ color: "var(--color-text-muted)" }}>
            (estimated)
          </span>
        )}
      </span>

      {showDescription && description ? (
        <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
          {description}
        </p>
      ) : null}
    </div>
  );
}

export default ReadinessBadge;

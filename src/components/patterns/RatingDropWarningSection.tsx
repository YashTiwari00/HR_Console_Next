"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Card } from "@/src/components/ui";

export type RatingDropWarningItem = {
  employeeId: string;
  employeeName: string;
  previousRatingLabel: "EE" | "DE" | "ME" | "SME" | "NI" | null;
  currentRatingLabel: "EE" | "DE" | "ME" | "SME" | "NI" | null;
  dropSeverity: "HIGH RISK" | "MODERATE" | "UNKNOWN";
  shortMessage: string;
};

export interface RatingDropWarningSectionProps {
  title: string;
  description?: string;
  items: RatingDropWarningItem[];
  initialVisibleCount?: number;
}

function severityVariant(severity: RatingDropWarningItem["dropSeverity"]) {
  if (severity === "HIGH RISK") return "danger" as const;
  if (severity === "MODERATE") return "warning" as const;
  return "info" as const;
}

export default function RatingDropWarningSection({
  title,
  description,
  items,
  initialVisibleCount = 4,
}: RatingDropWarningSectionProps) {
  const [expanded, setExpanded] = useState(false);

  const safeItems = useMemo(() => (Array.isArray(items) ? items.filter(Boolean) : []), [items]);
  if (safeItems.length === 0) {
    return null;
  }

  const visibleCount = Math.max(1, initialVisibleCount);
  const showCollapse = safeItems.length > visibleCount;
  const visibleItems = expanded ? safeItems : safeItems.slice(0, visibleCount);

  return (
    <Card title={title} description={description}>
      <div className="space-y-2">
        {visibleItems.map((item) => {
          const fromLabel = item.previousRatingLabel || "N/A";
          const toLabel = item.currentRatingLabel || "N/A";

          return (
            <div
              key={item.employeeId}
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="body-sm font-medium text-[var(--color-text)]">{item.employeeName}</p>
                <Badge variant={severityVariant(item.dropSeverity)}>{item.dropSeverity === "HIGH RISK" ? "High" : "Moderate"}</Badge>
              </div>
              <p className="caption mt-1">was {fromLabel}, now {toLabel}</p>
              <p className="body-sm mt-1 text-[var(--color-text)]">{item.shortMessage}</p>
            </div>
          );
        })}

        {showCollapse && (
          <div className="pt-1">
            <Button type="button" size="sm" variant="secondary" onClick={() => setExpanded((prev) => !prev)}>
              {expanded ? "Show fewer" : `Show all alerts (${safeItems.length})`}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

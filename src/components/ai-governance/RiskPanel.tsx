"use client";

import { Alert, Badge, Card } from "@/src/components/ui";
import { Grid } from "@/src/components/layout";
import type { NearBudgetRow, NearLimitRow, OverBudgetRow } from "@/src/components/ai-governance/types";

interface RiskPanelProps {
  nearLimitUsers: NearLimitRow[];
  nearBudgetUsers: NearBudgetRow[];
  overBudgetUsers: OverBudgetRow[];
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function RiskList<T extends { userId: string }>(props: {
  title: string;
  rows: T[];
  variant: "warning" | "error" | "info";
  renderMeta: (row: T) => string;
}) {
  const { title, rows, variant, renderMeta } = props;

  return (
    <Card title={title}>
      <div className="space-y-2">
        {rows.length === 0 && <p className="caption">No users in this segment.</p>}

        {rows.slice(0, 8).map((row, idx) => (
          <div
            key={`${row.userId}-${idx}`}
            className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="body-sm font-medium truncate">{row.userId}</p>
              <Badge variant={variant === "error" ? "error" : variant === "warning" ? "warning" : "default"}>
                {variant === "error" ? "High" : variant === "warning" ? "Watch" : "Info"}
              </Badge>
            </div>
            <p className="caption mt-1">{renderMeta(row)}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function RiskPanel({ nearLimitUsers = [], nearBudgetUsers = [], overBudgetUsers = [] }: RiskPanelProps) {
  const hasRisk = nearLimitUsers.length > 0 || nearBudgetUsers.length > 0 || overBudgetUsers.length > 0;

  return (
    <div className="space-y-4">
      {hasRisk && (
        <Alert
          variant={overBudgetUsers.length > 0 ? "error" : "warning"}
          title={overBudgetUsers.length > 0 ? "Budget Breach Detected" : "Active Governance Risks"}
          description={`${nearLimitUsers.length} near-limit rows, ${nearBudgetUsers.length} near-budget users, ${overBudgetUsers.length} over-budget users.`}
        />
      )}

      <Grid cols={1} colsLg={3} gap="3">
        <RiskList
          title="Near Limit"
          rows={nearLimitUsers}
          variant="warning"
          renderMeta={(row) => `${row.featureType} at ${Number(row.usagePercent || 0).toFixed(1)}% of cap`}
        />

        <RiskList
          title="Near Budget"
          rows={nearBudgetUsers}
          variant="info"
          renderMeta={(row) => {
            const usagePercent = Number(row.usagePercent || 0).toFixed(1);
            return `${formatCurrency(Number(row.totalCost || 0))} (${usagePercent}% of budget)`;
          }}
        />

        <RiskList
          title="Over Budget"
          rows={overBudgetUsers}
          variant="error"
          renderMeta={(row) => {
            const usagePercent = Number(row.usagePercent || 0).toFixed(1);
            return `${formatCurrency(Number(row.totalCost || 0))} (${usagePercent}% of budget)`;
          }}
        />
      </Grid>
    </div>
  );
}

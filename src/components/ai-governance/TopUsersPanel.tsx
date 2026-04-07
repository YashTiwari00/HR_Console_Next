"use client";

import { useMemo } from "react";
import { Grid } from "@/src/components/layout";
import { DataTable } from "@/src/components/patterns";
import type { DataTableColumn } from "@/src/components/patterns";
import { Badge, Card } from "@/src/components/ui";
import type { TopSpenderRow, UserRow } from "@/src/components/ai-governance/types";

interface TopUsersPanelProps {
  topUsers: UserRow[];
  topSpenders: TopSpenderRow[];
  loading?: boolean;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export default function TopUsersPanel({ topUsers = [], topSpenders = [], loading = false }: TopUsersPanelProps) {
  const userColumns = useMemo<DataTableColumn<UserRow>[]>(
    () => [
      {
        key: "userId",
        header: "User",
      },
      {
        key: "featureType",
        header: "Feature",
      },
      {
        key: "used",
        header: "Used",
        align: "center",
      },
      {
        key: "remaining",
        header: "Remaining",
        align: "center",
        render: (_value: unknown, row: UserRow) => (
          <Badge variant={Number(row.remaining) <= 1 ? "warning" : "default"}>{row.remaining}</Badge>
        ),
      },
      {
        key: "lastUsedAt",
        header: "Last Used",
        render: (_value: unknown, row: UserRow) => (
          <span className="caption">{row.lastUsedAt ? new Date(String(row.lastUsedAt)).toUTCString() : "n/a"}</span>
        ),
      },
    ],
    []
  );

  const spenderColumns = useMemo<DataTableColumn<TopSpenderRow>[]>(
    () => [
      {
        key: "userId",
        header: "User",
      },
      {
        key: "role",
        header: "Role",
        render: (value: unknown) => <span className="caption uppercase">{String(value || "unknown")}</span>,
      },
      {
        key: "totalCost",
        header: "Total Cost",
        align: "right",
        render: (value: unknown) => formatCurrency(Number(value || 0)),
      },
      {
        key: "budget",
        header: "Budget",
        align: "right",
        render: (value: unknown) =>
          Number(value) > 0 ? formatCurrency(Number(value || 0)) : <span className="caption">n/a</span>,
      },
      {
        key: "risk",
        header: "Risk",
        align: "center",
        render: (_value: unknown, row: TopSpenderRow) => {
          if (row.overBudget) return <Badge variant="error">Over</Badge>;
          if (row.nearBudget) return <Badge variant="warning">Near</Badge>;
          return <Badge variant="success">OK</Badge>;
        },
      },
    ],
    []
  );

  return (
    <Grid cols={1} colsLg={2} gap="3">
      <Card title="Top Usage Rows" description="Highest usage user-feature combinations.">
        <DataTable
          columns={userColumns}
          rows={topUsers as UserRow[]}
          loading={loading}
          rowKey={(row) => `${row.userId}-${row.featureType}-${row.cycleId || "none"}`}
          emptyMessage="No user usage rows available."
        />
      </Card>

      <Card title="Top Spenders" description="Highest estimated AI spend by user-cycle.">
        <DataTable
          columns={spenderColumns}
          rows={(topSpenders || []).slice(0, 25) as TopSpenderRow[]}
          loading={loading}
          rowKey={(row) => `${row.userId}-${row.cycleId || "none"}`}
          emptyMessage="No spend rows available."
        />
      </Card>
    </Grid>
  );
}

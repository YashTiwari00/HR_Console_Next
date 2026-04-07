"use client";

import { useMemo } from "react";
import { Grid } from "@/src/components/layout";
import { DataTable } from "@/src/components/patterns";
import type { DataTableColumn } from "@/src/components/patterns";
import { Badge, Card } from "@/src/components/ui";
import type { FeatureRow } from "@/src/components/ai-governance/types";

interface CostByFeatureRow {
  featureType: string;
  totalCost: number;
}

interface FeatureBreakdownProps {
  rows: FeatureRow[];
  totalCostByFeature?: CostByFeatureRow[];
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

export default function FeatureBreakdown({ rows, totalCostByFeature = [], loading = false }: FeatureBreakdownProps) {
  const costByFeature = useMemo(() => {
    const map = new Map();
    for (const row of totalCostByFeature || []) {
      map.set(String(row.featureType || ""), Number(row.totalCost || 0));
    }
    return map;
  }, [totalCostByFeature]);

  const columns = useMemo<DataTableColumn<FeatureRow>[]>(
    () => [
      {
        key: "featureType",
        header: "Feature",
      },
      {
        key: "rows",
        header: "Rows",
        align: "center",
      },
      {
        key: "totalUsed",
        header: "Usage",
        align: "center",
      },
      {
        key: "nearCapUsers",
        header: "Near Cap",
        align: "center",
        render: (_value: unknown, row: FeatureRow) => (
          <Badge variant={Number(row.nearCapUsers) > 0 ? "warning" : "success"}>{row.nearCapUsers}</Badge>
        ),
      },
      {
        key: "featureCost",
        header: "Est. Cost",
        align: "right",
        render: (_value: unknown, row: FeatureRow) => formatCurrency(costByFeature.get(row.featureType) || 0),
      },
    ],
    [costByFeature]
  );

  const topUsage = [...(rows || [])]
    .sort((a, b) => Number(b.totalUsed || 0) - Number(a.totalUsed || 0))
    .slice(0, 6);

  const usageMax = Math.max(1, ...topUsage.map((row) => Number(row.totalUsed || 0)));

  return (
    <Grid cols={1} colsLg={3} gap="3">
      <Card
        title="Feature Breakdown"
        description="Usage and near-limit pressure by AI capability."
        className="lg:col-span-2"
      >
        <DataTable
          columns={columns}
          rows={(rows || []) as FeatureRow[]}
          loading={loading}
          rowKey={(row) => String(row.featureType)}
          emptyMessage="No feature usage rows available."
        />
      </Card>

      <Card title="Usage Shape" description="Top features by request volume.">
        <div className="space-y-3">
          {topUsage.length === 0 && <p className="caption">No feature usage data available.</p>}

          {topUsage.map((row) => {
            const used = Number(row.totalUsed || 0);
            const percent = Math.min(100, Math.round((used / usageMax) * 100));

            return (
              <div key={row.featureType} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="body-sm font-medium truncate">{row.featureType}</span>
                  <span className="caption">{used}</span>
                </div>
                <div className="h-2 rounded-full bg-[var(--color-surface-muted)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-primary),color-mix(in_srgb,var(--color-primary)_45%,var(--color-warning)))]"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </Grid>
  );
}

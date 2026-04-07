"use client";

import { Grid } from "@/src/components/layout";
import { Card } from "@/src/components/ui";
import type { HrAiGovernanceOverview } from "@/app/employee/_lib/pmsClient";

interface KpiCardsProps {
  overview: HrAiGovernanceOverview;
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

export default function KpiCards({ overview, loading = false }: KpiCardsProps) {
  const totalRows = (overview.totalsByFeature || []).reduce((sum, item) => sum + Number(item.rows || 0), 0);
  const totalUsed = (overview.totalsByFeature || []).reduce((sum, item) => sum + Number(item.totalUsed || 0), 0);
  const totalCost = (overview.totalCostByFeature || []).reduce((sum, item) => sum + Number(item.totalCost || 0), 0);
  const riskCount =
    Number(overview.totalNearLimitUsers || 0) +
    Number((overview.nearBudgetUsers || []).length) +
    Number((overview.overBudgetUsers || []).length);

  return (
    <Grid cols={1} colsMd={2} colsLg={4} gap="3">
      <Card className="bg-[linear-gradient(130deg,color-mix(in_srgb,var(--color-primary)_12%,var(--color-surface))_0%,var(--color-surface)_65%)]">
        <p className="caption uppercase tracking-[0.08em]">Tracked Rows</p>
        <p className="heading-xl mt-2">{loading ? "..." : totalRows}</p>
      </Card>

      <Card className="bg-[linear-gradient(130deg,color-mix(in_srgb,var(--color-success)_16%,var(--color-surface))_0%,var(--color-surface)_65%)]">
        <p className="caption uppercase tracking-[0.08em]">Total AI Uses</p>
        <p className="heading-xl mt-2">{loading ? "..." : totalUsed}</p>
      </Card>

      <Card className="bg-[linear-gradient(130deg,color-mix(in_srgb,var(--color-info)_18%,var(--color-surface))_0%,var(--color-surface)_65%)]">
        <p className="caption uppercase tracking-[0.08em]">Estimated Spend</p>
        <p className="heading-xl mt-2">{loading ? "..." : formatCurrency(totalCost)}</p>
      </Card>

      <Card className="bg-[linear-gradient(130deg,color-mix(in_srgb,var(--color-warning)_22%,var(--color-surface))_0%,var(--color-surface)_65%)]">
        <p className="caption uppercase tracking-[0.08em]">Active Risks</p>
        <p className="heading-xl mt-2">{loading ? "..." : riskCount}</p>
      </Card>
    </Grid>
  );
}

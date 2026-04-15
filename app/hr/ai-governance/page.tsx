"use client";

import { useCallback, useEffect, useState } from "react";
import { Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Card } from "@/src/components/ui";
import {
  FeatureBreakdown,
  FiltersBar,
  KpiCards,
  RiskPanel,
  TopUsersPanel,
} from "@/src/components/ai-governance";
import { fetchHrAiGovernanceOverview, HrAiGovernanceOverview } from "@/app/employee/_lib/pmsClient";
import { buildCsv, dateStamp, downloadCsvFile } from "@/src/lib/csvExport";

export default function HrAiGovernancePage() {
  const [cycleId, setCycleId] = useState("");
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState<HrAiGovernanceOverview>({
    totalsByFeature: [],
    topUsers: [],
  });

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await fetchHrAiGovernanceOverview(cycleId || undefined, role || undefined);
      setOverview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load AI governance data.");
    } finally {
      setLoading(false);
    }
  }, [cycleId, role]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  function handleExportFeatureBreakdownCsv() {
    const csv = buildCsv(overview.totalsByFeature || [], [
      { key: "featureType", header: "Feature", value: (row) => row.featureType || "" },
      { key: "requestCount", header: "Requests", value: (row) => row.requestCount ?? 0 },
      { key: "tokenInput", header: "Input Tokens", value: (row) => row.tokenInput ?? 0 },
      { key: "tokenOutput", header: "Output Tokens", value: (row) => row.tokenOutput ?? 0 },
      { key: "estimatedCostUsd", header: "Estimated Cost USD", value: (row) => row.estimatedCostUsd ?? 0 },
    ]);
    downloadCsvFile(csv, `hr-ai-governance-features-${dateStamp()}.csv`);
  }

  function handleExportTopUsersCsv() {
    const csv = buildCsv(overview.topUsers || [], [
      { key: "userId", header: "User ID", value: (row) => row.userId || "" },
      { key: "name", header: "Name", value: (row) => row.name || "" },
      { key: "role", header: "Role", value: (row) => row.role || "" },
      { key: "featureType", header: "Feature", value: (row) => row.featureType || "" },
      { key: "requestCount", header: "Requests", value: (row) => row.requestCount ?? 0 },
      { key: "estimatedCostUsd", header: "Estimated Cost USD", value: (row) => row.estimatedCostUsd ?? 0 },
    ]);
    downloadCsvFile(csv, `hr-ai-governance-top-users-${dateStamp()}.csv`);
  }

  function handleExportRiskCsv() {
    const riskRows = [
      ...(overview.nearLimitUsers || []).map((row) => ({ type: "near_limit", ...row })),
      ...(overview.nearBudgetUsers || []).map((row) => ({ type: "near_budget", ...row })),
      ...(overview.overBudgetUsers || []).map((row) => ({ type: "over_budget", ...row })),
    ];
    const csv = buildCsv(riskRows, [
      { key: "type", header: "Risk Type", value: (row) => row.type },
      { key: "userId", header: "User ID", value: (row) => row.userId || "" },
      { key: "name", header: "Name", value: (row) => row.name || "" },
      { key: "role", header: "Role", value: (row) => row.role || "" },
      { key: "featureType", header: "Feature", value: (row) => row.featureType || "" },
      { key: "remainingBudgetPct", header: "Remaining Budget %", value: (row) => row.remainingBudgetPct ?? "" },
      { key: "remainingRequestPct", header: "Remaining Request %", value: (row) => row.remainingRequestPct ?? "" },
      { key: "estimatedCostUsd", header: "Estimated Cost USD", value: (row) => row.estimatedCostUsd ?? 0 },
    ]);
    downloadCsvFile(csv, `hr-ai-governance-risk-${dateStamp()}.csv`);
  }

  return (
    <Stack gap="4">
      <PageHeader
        title="AI Governance"
        subtitle="Decision-oriented governance view for usage pressure, spend trends, and policy risk hotspots."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={handleExportFeatureBreakdownCsv} disabled={loading || (overview.totalsByFeature || []).length === 0}>
              Download CSV: Features
            </Button>
            <Button variant="secondary" size="sm" onClick={handleExportRiskCsv} disabled={loading}>
              Download CSV: Risk
            </Button>
            <Button variant="secondary" size="sm" onClick={handleExportTopUsersCsv} disabled={loading || (overview.topUsers || []).length === 0}>
              Download CSV: Top Users
            </Button>
            <Button variant="secondary" onClick={loadOverview} disabled={loading}>
              Refresh
            </Button>
          </div>
        }
      />

      {error && <Alert variant="error" title="Unable to load" description={error} onDismiss={() => setError("")} />}

      <Card className="overflow-hidden border-[color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))]">
        <div className="rounded-[var(--radius-md)] bg-[radial-gradient(1200px_400px_at_10%_-20%,color-mix(in_srgb,var(--color-primary)_18%,transparent),transparent),linear-gradient(120deg,color-mix(in_srgb,var(--color-warning)_16%,var(--color-surface))_0%,var(--color-surface)_65%)] p-4 md:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default">Policy-aware</Badge>
            <Badge variant="default">Near-limit detection</Badge>
            <Badge variant="default">Budget intelligence</Badge>
            {overview.role && <Badge variant="warning">Role: {overview.role}</Badge>}
          </div>
          <p className="body-sm mt-3 max-w-3xl text-[var(--color-text-muted)]">
            Use this workspace to detect emerging overuse patterns, identify budget stress early, and prioritize interventions by role and cycle.
          </p>
        </div>
      </Card>

      <FiltersBar
        cycleId={cycleId}
        role={role}
        loading={loading}
        onCycleIdChange={setCycleId}
        onRoleChange={setRole}
        onApply={loadOverview}
        onRefresh={loadOverview}
      />

      <KpiCards overview={overview} loading={loading} />

      <FeatureBreakdown
        rows={overview.totalsByFeature || []}
        totalCostByFeature={overview.totalCostByFeature || []}
        loading={loading}
      />

      <RiskPanel
        nearLimitUsers={overview.nearLimitUsers || []}
        nearBudgetUsers={overview.nearBudgetUsers || []}
        overBudgetUsers={overview.overBudgetUsers || []}
      />

      <TopUsersPanel
        topUsers={overview.topUsers || []}
        topSpenders={overview.topSpenders || []}
        loading={loading}
      />
    </Stack>
  );
}

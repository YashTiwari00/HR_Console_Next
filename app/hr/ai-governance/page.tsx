"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Grid, Stack } from "@/src/components/layout";
import { DataTable, PageHeader } from "@/src/components/patterns";
import type { DataTableColumn } from "@/src/components/patterns";
import { Alert, Badge, Button, Card, Input } from "@/src/components/ui";
import { fetchHrAiGovernanceOverview, HrAiGovernanceOverview } from "@/app/employee/_lib/pmsClient";

interface FeatureRow extends Record<string, unknown> {
  featureType: string;
  capPerUser: number;
  totalUsed: number;
  nearCapUsers: number;
  rows: number;
}

interface UserRow extends Record<string, unknown> {
  userId: string;
  featureType: string;
  cycleId?: string;
  used: number;
  cap: number;
  remaining: number;
  nearCap: boolean;
  warning: boolean;
  lastUsedAt?: string | null;
}

export default function HrAiGovernancePage() {
  const [cycleId, setCycleId] = useState("");
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
      const data = await fetchHrAiGovernanceOverview(cycleId || undefined);
      setOverview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load AI governance data.");
    } finally {
      setLoading(false);
    }
  }, [cycleId]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const totals = useMemo(() => {
    return (overview.totalsByFeature || []).reduce(
      (acc, item) => {
        acc.totalEvents += Number(item.rows || 0);
        acc.totalUsed += Number(item.totalUsed || 0);
        acc.nearCapUsers += Number(item.nearCapUsers || 0);
        return acc;
      },
      { totalEvents: 0, totalUsed: 0, nearCapUsers: 0 }
    );
  }, [overview.totalsByFeature]);

  const featureColumns = useMemo<DataTableColumn<FeatureRow>[]>(
    () => [
      {
        key: "featureType",
        header: "Feature",
      },
      {
        key: "rows",
        header: "User Rows",
        align: "center",
      },
      {
        key: "totalUsed",
        header: "Total Used",
        align: "center",
      },
      {
        key: "nearCapUsers",
        header: "Near Cap Users",
        align: "center",
        render: (_value: unknown, row: FeatureRow) => (
          <Badge variant={Number(row.nearCapUsers) > 0 ? "warning" : "success"}>
            {row.nearCapUsers}
          </Badge>
        ),
      },
      {
        key: "capPerUser",
        header: "Cap / User",
        align: "center",
      },
    ],
    []
  );

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
          <Badge variant={Number(row.remaining) <= 1 ? "warning" : "default"}>
            {row.remaining}
          </Badge>
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

  return (
    <Stack gap="4">
      <PageHeader
        title="AI Governance"
        subtitle="Monitor AI usage, near-cap users, and budget risk signals by feature."
        actions={
          <Button variant="secondary" onClick={loadOverview} disabled={loading}>
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="error" title="Unable to load" description={error} onDismiss={() => setError("")} />}

      <Card title="Filters" description="Optional cycle filter for focused governance tracking.">
        <div className="flex flex-wrap items-end gap-2">
          <Input
            label="Cycle ID"
            value={cycleId}
            onChange={(event) => setCycleId(event.target.value)}
            placeholder="Q2-2026"
          />
          <Button onClick={loadOverview} disabled={loading}>Apply</Button>
        </div>
      </Card>

      <Grid cols={1} colsMd={3} gap="3">
        <Card title="Tracked Rows">
          <p className="heading-xl">{loading ? "..." : totals.totalEvents}</p>
        </Card>
        <Card title="Total AI Uses">
          <p className="heading-xl">{loading ? "..." : totals.totalUsed}</p>
        </Card>
        <Card title="Near Cap Users">
          <p className="heading-xl">{loading ? "..." : totals.nearCapUsers}</p>
        </Card>
      </Grid>

      {totals.nearCapUsers > 0 && (
        <Alert
          variant="warning"
          title="Budget Warning"
          description={`${totals.nearCapUsers} user-feature combinations are near cap. Consider guidance or policy adjustments.`}
        />
      )}

      <Card title="Feature Summary" description="Aggregated usage by AI feature type.">
        <DataTable
          columns={featureColumns}
          rows={(overview.totalsByFeature || []) as FeatureRow[]}
          loading={loading}
          rowKey={(row) => `${row.featureType}`}
          emptyMessage="No feature usage rows available."
        />
      </Card>

      <Card title="Top Usage Rows" description="Highest usage user-feature rows for governance review.">
        <DataTable
          columns={userColumns}
          rows={(overview.topUsers || []) as UserRow[]}
          loading={loading}
          rowKey={(row) => `${row.userId}-${row.featureType}-${row.cycleId || "none"}`}
          emptyMessage="No user usage rows available."
        />
      </Card>
    </Stack>
  );
}

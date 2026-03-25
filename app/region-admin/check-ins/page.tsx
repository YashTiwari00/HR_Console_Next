"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Grid, Stack } from "@/src/components/layout";
import { DataTable, PageHeader } from "@/src/components/patterns";
import type { DataTableColumn } from "@/src/components/patterns";
import { Alert, Badge, Button, Card } from "@/src/components/ui";
import {
  HrManagerSummary,
  fetchRegionAdminOverview,
} from "@/app/employee/_lib/pmsClient";

interface ManagerCadenceRow extends Record<string, unknown> {
  managerId: string;
  managerName: string;
  managerEmail: string;
  teamSize: number;
  plannedCheckIns: number;
  completedCheckIns: number;
  pendingCheckInApprovals: number;
}

export default function RegionAdminCheckInsPage() {
  const [region, setRegion] = useState("");
  const [rows, setRows] = useState<HrManagerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const overview = await fetchRegionAdminOverview();
      setRegion(overview.region || "Unassigned");
      setRows(overview.managers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load region manager check-in monitoring.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.managers += 1;
        acc.planned += row.plannedCheckIns;
        acc.completed += row.completedCheckIns;
        acc.pending += row.pendingCheckInApprovals;
        return acc;
      },
      { managers: 0, planned: 0, completed: 0, pending: 0 }
    );
  }, [rows]);

  const cadenceRows = useMemo<ManagerCadenceRow[]>(
    () =>
      rows.map((item) => ({
        managerId: item.managerId,
        managerName: item.managerName,
        managerEmail: item.managerEmail,
        teamSize: item.teamSize,
        plannedCheckIns: item.plannedCheckIns,
        completedCheckIns: item.completedCheckIns,
        pendingCheckInApprovals: item.pendingCheckInApprovals,
      })),
    [rows]
  );

  const columns = useMemo<DataTableColumn<ManagerCadenceRow>[]>(
    () => [
      {
        key: "managerName",
        header: "Manager",
        render: (_value: unknown, row: ManagerCadenceRow) => (
          <div>
            <p className="body-sm font-medium text-[var(--color-text)]">{row.managerName}</p>
            <p className="caption">{row.managerEmail}</p>
          </div>
        ),
      },
      {
        key: "teamSize",
        header: "Team Size",
        align: "center",
      },
      {
        key: "plannedCheckIns",
        header: "Planned",
        align: "center",
      },
      {
        key: "completedCheckIns",
        header: "Completed",
        align: "center",
      },
      {
        key: "pendingCheckInApprovals",
        header: "Pending Review",
        align: "center",
        render: (_value: unknown, row: ManagerCadenceRow) => (
          <Badge variant={row.pendingCheckInApprovals > 0 ? "warning" : "success"}>
            {row.pendingCheckInApprovals}
          </Badge>
        ),
      },
    ],
    []
  );

  return (
    <Stack gap="4">
      <PageHeader
        title="Check-in Monitoring"
        subtitle={`Track check-in cadence across managers in ${region || "your region"}.`}
        actions={
          <Button variant="secondary" onClick={loadRows} disabled={loading}>
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="error" title="Unable to load" description={error} onDismiss={() => setError("")} />}

      <Grid cols={1} colsMd={4} gap="3">
        <Card title="Managers">
          <p className="heading-xl">{loading ? "..." : totals.managers}</p>
        </Card>
        <Card title="Planned Check-ins">
          <p className="heading-xl">{loading ? "..." : totals.planned}</p>
        </Card>
        <Card title="Completed Check-ins">
          <p className="heading-xl">{loading ? "..." : totals.completed}</p>
        </Card>
        <Card title="Pending Review Check-ins">
          <p className="heading-xl">{loading ? "..." : totals.pending}</p>
        </Card>
      </Grid>

      <Card title="Manager Cadence Table" description="Read-only monitoring for manager-level check-in execution.">
        <DataTable
          columns={columns}
          rows={cadenceRows}
          loading={loading}
          rowKey={(row) => row.managerId}
          emptyMessage="No manager cadence data available for this region."
        />
      </Card>
    </Stack>
  );
}

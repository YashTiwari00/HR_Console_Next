"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Grid, Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Card } from "@/src/components/ui";
import {
  LeadershipSuccessionSnapshot,
  LeadershipOverview,
  fetchLeadershipOverview,
  fetchLeadershipSuccessionSnapshot,
} from "@/app/employee/_lib/pmsClient";

function numberCell(value: number | string) {
  return <span className="body-sm font-medium text-[var(--color-text)]">{value}</span>;
}

export default function LeadershipDashboardPage() {
  const [overview, setOverview] = useState<LeadershipOverview | null>(null);
  const [succession, setSuccession] = useState<LeadershipSuccessionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [overviewData, successionData] = await Promise.all([
        fetchLeadershipOverview(),
        fetchLeadershipSuccessionSnapshot(),
      ]);

      setOverview(overviewData);
      setSuccession(successionData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load leadership overview.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const summary = overview?.summary;

  const qualityBandMap = useMemo(() => {
    const rows = overview?.managerQualityBands || [];
    return {
      strong: rows.find((item) => item.band === "strong")?.managers || 0,
      watch: rows.find((item) => item.band === "watch")?.managers || 0,
      critical: rows.find((item) => item.band === "critical")?.managers || 0,
    };
  }, [overview?.managerQualityBands]);

  return (
    <Stack gap="5">
      <PageHeader
        title="Leadership Command Center"
        subtitle="Decision-safe organization aggregates across execution quality and risk."
      />

      {error && <Alert variant="error" title={error} />}

      <Grid cols={1} colsMd={2} colsLg={4} gap="4">
        <Card>
          <p className="caption">Population</p>
          <p className="h2 mt-[var(--space-1)] text-[var(--color-text)]">
            {loading ? "..." : `${summary?.employees || 0} employees`}
          </p>
          <p className="caption mt-[var(--space-1)]">{summary?.managers || 0} managers</p>
        </Card>

        <Card>
          <p className="caption">Execution Quality</p>
          <p className="h2 mt-[var(--space-1)] text-[var(--color-text)]">
            {loading ? "..." : `${summary?.avgProgressPercent || 0}%`}
          </p>
          <p className="caption mt-[var(--space-1)]">Avg active goal progress</p>
        </Card>

        <Card>
          <p className="caption">Cadence Health</p>
          <p className="h2 mt-[var(--space-1)] text-[var(--color-text)]">
            {loading ? "..." : `${summary?.checkInCompletionRate || 0}%`}
          </p>
          <p className="caption mt-[var(--space-1)]">Check-in completion rate</p>
        </Card>

        <Card>
          <p className="caption">Risk Snapshot</p>
          <p className="h2 mt-[var(--space-1)] text-[var(--color-text)]">
            {loading ? "..." : `${summary?.atRiskGoals || 0}`}
          </p>
          <p className="caption mt-[var(--space-1)]">Goals currently at risk</p>
        </Card>
      </Grid>

      <Grid cols={1} colsLg={2} gap="4">
        <Card>
          <div className="flex items-center justify-between gap-[var(--space-2)]">
            <h2 className="h4 text-[var(--color-text)]">Cycle Trends</h2>
            <Badge variant="info">Aggregate only</Badge>
          </div>

          <div className="mt-[var(--space-3)] overflow-x-auto">
            <table className="w-full text-left body-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="py-2 pr-3">Cycle</th>
                  <th className="py-2 pr-3">Goals</th>
                  <th className="py-2 pr-3">Avg Progress</th>
                  <th className="py-2">Check-ins</th>
                </tr>
              </thead>
              <tbody>
                {(overview?.trendsByCycle || []).slice(0, 8).map((row) => (
                  <tr key={row.cycleId} className="border-b border-[var(--color-border)]">
                    <td className="py-2 pr-3">{row.cycleId}</td>
                    <td className="py-2 pr-3">{numberCell(row.goals)}</td>
                    <td className="py-2 pr-3">{numberCell(`${row.avgProgressPercent}%`)}</td>
                    <td className="py-2">{numberCell(`${row.checkInCompletionRate}%`)}</td>
                  </tr>
                ))}
                {!loading && (overview?.trendsByCycle || []).length === 0 && (
                  <tr>
                    <td className="py-3 caption" colSpan={4}>No cycle data available.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <h2 className="h4 text-[var(--color-text)]">Manager Quality Bands</h2>
          <p className="caption mt-[var(--space-1)]">Based on check-in completion performance.</p>

          <Grid cols={1} colsMd={3} gap="3" className="mt-[var(--space-3)]">
            <Card className="bg-[var(--color-bg)]">
              <p className="caption">Strong</p>
              <p className="h3 mt-[var(--space-1)] text-[var(--color-success)]">{qualityBandMap.strong}</p>
            </Card>
            <Card className="bg-[var(--color-bg)]">
              <p className="caption">Watch</p>
              <p className="h3 mt-[var(--space-1)] text-[var(--color-warning)]">{qualityBandMap.watch}</p>
            </Card>
            <Card className="bg-[var(--color-bg)]">
              <p className="caption">Critical</p>
              <p className="h3 mt-[var(--space-1)] text-[var(--color-danger)]">{qualityBandMap.critical}</p>
            </Card>
          </Grid>

          <div className="mt-[var(--space-4)]">
            <h3 className="h5 text-[var(--color-text)]">Metric Registry</h3>
            <div className="mt-[var(--space-2)] flex flex-wrap gap-[var(--space-2)]">
              {(overview?.metricDefinitions || []).map((item) => (
                <Badge key={item.key} variant="default">{item.label}</Badge>
              ))}
            </div>
          </div>
        </Card>
      </Grid>

      <Card>
        <h2 className="h4 text-[var(--color-text)]">Department Risk View</h2>
        <p className="caption mt-[var(--space-1)]">No employee identifiers are exposed in leadership scope.</p>

        <div className="mt-[var(--space-3)] overflow-x-auto">
          <table className="w-full text-left body-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="py-2 pr-3">Department</th>
                <th className="py-2 pr-3">Employees</th>
                <th className="py-2 pr-3">Managers</th>
                <th className="py-2 pr-3">Goals</th>
                <th className="py-2 pr-3">Avg Progress</th>
                <th className="py-2 pr-3">Check-ins</th>
                <th className="py-2">At Risk</th>
              </tr>
            </thead>
            <tbody>
              {(overview?.departmentRows || []).slice(0, 15).map((row) => (
                <tr key={row.department} className="border-b border-[var(--color-border)]">
                  <td className="py-2 pr-3">{row.department}</td>
                  <td className="py-2 pr-3">{numberCell(row.employees)}</td>
                  <td className="py-2 pr-3">{numberCell(row.managers)}</td>
                  <td className="py-2 pr-3">{numberCell(row.goals)}</td>
                  <td className="py-2 pr-3">{numberCell(`${row.avgProgressPercent}%`)}</td>
                  <td className="py-2 pr-3">{numberCell(`${row.checkInCompletionRate}%`)}</td>
                  <td className="py-2">{numberCell(row.atRiskGoals)}</td>
                </tr>
              ))}
              {!loading && (overview?.departmentRows || []).length === 0 && (
                <tr>
                  <td className="py-3 caption" colSpan={7}>No department aggregate rows available.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h2 className="h4 text-[var(--color-text)]">Succession Snapshot</h2>
        <p className="caption mt-[var(--space-1)]">Aggregated readiness view with no employee identifiers.</p>

        <Grid cols={1} colsMd={3} gap="3" className="mt-[var(--space-3)]">
          <Card className="bg-[var(--color-bg)]">
            <p className="caption">Ready Now</p>
            <p className="h3 mt-[var(--space-1)] text-[var(--color-success)]">
              {loading ? "..." : succession?.readinessCounts.ready_now || 0}
            </p>
          </Card>
          <Card className="bg-[var(--color-bg)]">
            <p className="caption">Ready 1-2 Years</p>
            <p className="h3 mt-[var(--space-1)] text-[var(--color-primary)]">
              {loading ? "..." : succession?.readinessCounts.ready_1_2_years || 0}
            </p>
          </Card>
          <Card className="bg-[var(--color-bg)]">
            <p className="caption">Emerging</p>
            <p className="h3 mt-[var(--space-1)] text-[var(--color-warning)]">
              {loading ? "..." : succession?.readinessCounts.emerging || 0}
            </p>
          </Card>
        </Grid>

        <div className="mt-[var(--space-3)] overflow-x-auto">
          <table className="w-full text-left body-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="py-2 pr-3">Department</th>
                <th className="py-2 pr-3">Employees</th>
                <th className="py-2 pr-3">Ready Now</th>
                <th className="py-2 pr-3">Ready Soon</th>
                <th className="py-2">Readiness %</th>
              </tr>
            </thead>
            <tbody>
              {(succession?.departmentBenchStrength || []).slice(0, 10).map((row) => (
                <tr key={row.department} className="border-b border-[var(--color-border)]">
                  <td className="py-2 pr-3">{row.department}</td>
                  <td className="py-2 pr-3">{numberCell(row.totalEmployees)}</td>
                  <td className="py-2 pr-3">{numberCell(row.readyNow)}</td>
                  <td className="py-2 pr-3">{numberCell(row.readySoon)}</td>
                  <td className="py-2">{numberCell(`${row.readyPct}%`)}</td>
                </tr>
              ))}
              {!loading && (succession?.departmentBenchStrength || []).length === 0 && (
                <tr>
                  <td className="py-3 caption" colSpan={5}>No succession aggregate rows available.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </Stack>
  );
}

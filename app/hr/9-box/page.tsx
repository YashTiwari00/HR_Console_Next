"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Grid, Stack } from "@/src/components/layout";
import { AiModeToggle, PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Card, Input } from "@/src/components/ui";
import { useAiMode } from "@/src/context/AiModeContext";
import { HrNineBoxSnapshot, fetchHrNineBoxSnapshot } from "@/app/employee/_lib/pmsClient";

const DEEP_MODE_NUDGE_SESSION_KEY = "hr_console_deep_mode_nudge_shown";

const PERFORMANCE_ORDER = ["high", "medium", "low"] as const;
const POTENTIAL_ORDER = ["high", "medium", "low"] as const;

function toneForCell(count: number) {
  if (count >= 8) return "success" as const;
  if (count >= 3) return "info" as const;
  return "default" as const;
}

export default function HrNineBoxPage() {
  const aiMode = useAiMode();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showDeepModeNudge, setShowDeepModeNudge] = useState(false);
  const [cycleId, setCycleId] = useState("");
  const [department, setDepartment] = useState("");
  const [snapshot, setSnapshot] = useState<HrNineBoxSnapshot>({
    totalEmployees: 0,
    readinessCounts: { ready_now: 0, ready_1_2_years: 0, emerging: 0 },
    matrixRows: [],
    employees: [],
  });

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await fetchHrNineBoxSnapshot({
        cycleId: cycleId.trim() || undefined,
        department: department.trim() || undefined,
      }, aiMode.mode);
      setSnapshot(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load 9-box snapshot.");
    } finally {
      setLoading(false);
    }
  }, [aiMode.mode, cycleId, department]);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    try {
      const alreadyShown = window.sessionStorage.getItem(DEEP_MODE_NUDGE_SESSION_KEY);
      if (!alreadyShown && aiMode.mode === "suggestion") {
        setShowDeepModeNudge(true);
        window.sessionStorage.setItem(DEEP_MODE_NUDGE_SESSION_KEY, "1");
      }
    } catch {
      // Ignore sessionStorage failures and continue without banner persistence.
    }
  }, [aiMode.mode]);

  const matrixMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of snapshot.matrixRows || []) {
      map.set(`${row.potentialBand}_${row.performanceBand}`, Number(row.count || 0));
    }
    return map;
  }, [snapshot.matrixRows]);

  return (
    <Stack gap="4">
      <PageHeader
        title="9-Box Talent Map"
        subtitle="HR snapshot of performance-potential distribution and succession readiness bands."
        actions={
          <Button variant="secondary" onClick={loadSnapshot} disabled={loading}>
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="error" title="Unable to load" description={error} onDismiss={() => setError("")} />}

      <Card
        title="AI Analysis Mode"
        description="Switch analysis depth for this page without opening the AI assistant panel."
      >
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <p className="caption">
            Current mode: <span className="font-medium text-[var(--color-text)]">{aiMode.mode === "decision_support" ? "Deep Analysis" : "Suggestion"}</span>
          </p>
          <AiModeToggle />
        </div>
      </Card>

      {showDeepModeNudge && (
        <Alert
          variant="info"
          title="Deep Analysis Available"
          description="Deep Analysis Mode gives richer insights on this page. Use the AI Analysis Mode switch above."
          onDismiss={() => setShowDeepModeNudge(false)}
        />
      )}

      <Card title="Filters" description="Optional cycle and department filters.">
        <div className="grid gap-3 md:grid-cols-3">
          <Input
            label="Cycle ID"
            value={cycleId}
            onChange={(event) => setCycleId(event.target.value)}
            placeholder="Q2-2026"
          />
          <Input
            label="Department"
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
            placeholder="engineering"
          />
          <div className="flex items-end">
            <Button onClick={loadSnapshot} disabled={loading}>Apply</Button>
          </div>
        </div>
      </Card>

      <Grid cols={1} colsMd={4} gap="3">
        <Card title="Employees">
          <p className="heading-xl">{loading ? "..." : snapshot.totalEmployees}</p>
        </Card>
        <Card title="Ready Now">
          <p className="heading-xl">{loading ? "..." : snapshot.readinessCounts.ready_now}</p>
        </Card>
        <Card title="Ready 1-2 Years">
          <p className="heading-xl">{loading ? "..." : snapshot.readinessCounts.ready_1_2_years}</p>
        </Card>
        <Card title="Emerging">
          <p className="heading-xl">{loading ? "..." : snapshot.readinessCounts.emerging}</p>
        </Card>
      </Grid>

      {aiMode.mode === "decision_support" && snapshot.decisionSupport && (
        <Card
          title="Deep Analysis Insights"
          description="Decision-support signals generated for HR calibration and succession planning."
        >
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="caption mb-2">Risk Departments</p>
              <div className="space-y-2">
                {(snapshot.decisionSupport.riskDepartments || []).slice(0, 5).map((row) => (
                  <div key={row.department} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-2">
                    <p className="body-sm font-medium text-[var(--color-text)]">{row.department}</p>
                    <p className="caption">Bench Strength: {row.benchStrengthPct}%</p>
                    <p className="caption">Low Performance: {row.lowPerformancePct}%</p>
                  </div>
                ))}
                {(snapshot.decisionSupport.riskDepartments || []).length === 0 && (
                  <p className="caption">No high-risk departments detected for current filter.</p>
                )}
              </div>
            </div>

            <div>
              <p className="caption mb-2">Highest Density Cells</p>
              <div className="space-y-2">
                {(snapshot.decisionSupport.highestDensityCells || []).map((row) => (
                  <div key={row.boxKey} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-2">
                    <p className="body-sm font-medium text-[var(--color-text)]">{row.boxKey.replace("_", " / ")}</p>
                    <p className="caption">Count: {row.count}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="caption mb-2">Recommended Actions</p>
              <div className="space-y-2">
                {(snapshot.decisionSupport.recommendations || []).map((item) => (
                  <p key={item} className="caption rounded-[var(--radius-sm)] border border-[var(--color-border)] p-2">
                    {item}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card title="9-Box Matrix" description="Potential by performance distribution.">
        <div className="overflow-x-auto">
          <table className="w-full text-left body-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="py-2 pr-3">Potential \ Performance</th>
                {PERFORMANCE_ORDER.map((band) => (
                  <th key={band} className="py-2 pr-3 capitalize">{band}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {POTENTIAL_ORDER.map((potentialBand) => (
                <tr key={potentialBand} className="border-b border-[var(--color-border)]">
                  <td className="py-2 pr-3 capitalize font-medium">{potentialBand}</td>
                  {PERFORMANCE_ORDER.map((performanceBand) => {
                    const count = matrixMap.get(`${potentialBand}_${performanceBand}`) || 0;
                    return (
                      <td key={`${potentialBand}_${performanceBand}`} className="py-2 pr-3">
                        <Badge variant={toneForCell(count)}>{count}</Badge>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Employee Talent Rows" description="Detailed rows for calibration and succession planning.">
        <div className="overflow-x-auto">
          <table className="w-full text-left body-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="py-2 pr-3">Employee</th>
                <th className="py-2 pr-3">Department</th>
                <th className="py-2 pr-3">Score</th>
                <th className="py-2 pr-3">Trend</th>
                <th className="py-2 pr-3">Performance</th>
                <th className="py-2 pr-3">Potential</th>
                <th className="py-2">Readiness</th>
              </tr>
            </thead>
            <tbody>
              {(snapshot.employees || []).slice(0, 200).map((row) => (
                <tr key={row.employeeId} className="border-b border-[var(--color-border)]">
                  <td className="py-2 pr-3">{row.employeeName}</td>
                  <td className="py-2 pr-3">{row.department}</td>
                  <td className="py-2 pr-3">{row.scoreX100}</td>
                  <td className="py-2 pr-3">{row.trendLabel} ({row.trendDeltaPercent}%)</td>
                  <td className="py-2 pr-3"><Badge variant="default">{row.performanceBand}</Badge></td>
                  <td className="py-2 pr-3"><Badge variant="info">{row.potentialBand}</Badge></td>
                  <td className="py-2"><Badge variant={row.readinessBand === "ready_now" ? "success" : row.readinessBand === "ready_1_2_years" ? "info" : "warning"}>{row.readinessBand}</Badge></td>
                </tr>
              ))}
              {!loading && (snapshot.employees || []).length === 0 && (
                <tr>
                  <td className="py-3 caption" colSpan={7}>No talent rows available for current filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </Stack>
  );
}

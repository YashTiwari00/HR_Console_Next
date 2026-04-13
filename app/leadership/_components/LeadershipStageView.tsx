"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Container, Grid, Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Card } from "@/src/components/ui";
import {
  LeadershipSuccessionSnapshot,
  LeadershipOverview,
  fetchLeadershipOverview,
  fetchLeadershipSuccessionSnapshot,
} from "@/app/employee/_lib/pmsClient";

export type LeadershipStage = "command" | "overview" | "execution" | "risk" | "succession" | "talent";

function numberCell(value: number | string) {
  return <span className="body-sm font-medium text-[var(--color-text)]">{value}</span>;
}

const processItems = [
  {
    title: "Overview",
    subtitle: "Organization coverage and baseline health",
    href: "/leadership/overview",
  },
  {
    title: "Execution",
    subtitle: "Goal and check-in quality cadence",
    href: "/leadership/execution",
  },
  {
    title: "Risk",
    subtitle: "Department risk and successor gaps",
    href: "/leadership/risk",
  },
  {
    title: "Succession",
    subtitle: "Readiness distribution and bench strength",
    href: "/leadership/succession",
  },
  {
    title: "Talent",
    subtitle: "Critical roles and high-potential pools",
    href: "/leadership/talent",
  },
];

function getStageMeta(stage: LeadershipStage) {
  if (stage === "overview") {
    return {
      title: "Leadership Process 1/5 - Overview",
      subtitle: "Organization-level baseline across population, active cycles, and coverage.",
    };
  }

  if (stage === "execution") {
    return {
      title: "Leadership Process 2/5 - Execution",
      subtitle: "Track execution quality, cadence health, and manager-level delivery behavior.",
    };
  }

  if (stage === "risk") {
    return {
      title: "Leadership Process 3/5 - Risk",
      subtitle: "Identify departments and critical roles with elevated continuity risk.",
    };
  }

  if (stage === "succession") {
    return {
      title: "Leadership Process 4/5 - Succession",
      subtitle: "Review readiness bands, bench strength, and 9-box distribution.",
    };
  }

  if (stage === "talent") {
    return {
      title: "Leadership Process 5/5 - Talent",
      subtitle: "Prioritize high-potential pools and close critical successor coverage gaps.",
    };
  }

  return {
    title: "Leadership Command Center",
    subtitle: "Step-based process from overview to talent decisions.",
  };
}

export default function LeadershipStageView({ stage }: { stage: LeadershipStage }) {
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
  const stageMeta = getStageMeta(stage);

  const qualityBandMap = useMemo(() => {
    const rows = overview?.managerQualityBands || [];
    return {
      strong: rows.find((item) => item.band === "strong")?.managers || 0,
      watch: rows.find((item) => item.band === "watch")?.managers || 0,
      critical: rows.find((item) => item.band === "critical")?.managers || 0,
    };
  }, [overview?.managerQualityBands]);

  const criticalSummary = succession?.criticalRolesWithoutSuccessors;

  const matrixRows = useMemo(() => {
    return [...(succession?.matrixRows || [])].sort((a, b) => b.count - a.count);
  }, [succession?.matrixRows]);

  const showOverview = stage === "command" || stage === "overview";
  const showExecution = stage === "command" || stage === "execution";
  const showRisk = stage === "command" || stage === "risk";
  const showSuccession = stage === "command" || stage === "succession";
  const showNineBox = stage === "command" || stage === "succession";
  const showTalent = stage === "command" || stage === "talent";

  return (
    <Container maxWidth="xl">
      <Stack gap="6">
        <PageHeader title={stageMeta.title} subtitle={stageMeta.subtitle} />

        {error && <Alert variant="error" title={error} />}

        {stage === "command" && (
          <Card>
            <Stack gap="3" align="start">
              <h2 className="h4 text-[var(--color-text)]">Leadership Process</h2>
              <Grid cols={1} colsMd={2} colsLg={5} gap="3" className="w-full">
                {processItems.map((item, index) => (
                  <Link key={item.title} href={item.href} className="no-underline">
                    <Card className="h-full bg-[var(--color-bg)] transition-colors duration-150 hover:bg-[var(--color-surface-muted)]">
                      <Stack gap="1" align="start">
                        <p className="caption">Step {index + 1}</p>
                        <p className="body-sm font-semibold text-[var(--color-text)]">{item.title}</p>
                        <p className="caption">{item.subtitle}</p>
                      </Stack>
                    </Card>
                  </Link>
                ))}
              </Grid>
            </Stack>
          </Card>
        )}

        {showOverview && (
          <Grid cols={1} colsMd={2} colsLg={4} gap="4">
            <Card>
              <Stack gap="1" align="start">
                <p className="caption">Population</p>
                <p className="h2 text-[var(--color-text)]">{loading ? "..." : `${summary?.employees || 0} employees`}</p>
                <p className="caption">{summary?.managers || 0} managers</p>
                <p className="caption">{summary?.activeCycles || 0} active cycles</p>
              </Stack>
            </Card>

            <Card>
              <Stack gap="1" align="start">
                <p className="caption">Execution Quality</p>
                <p className="h2 text-[var(--color-text)]">{loading ? "..." : `${summary?.avgProgressPercent || 0}%`}</p>
                <p className="caption">Avg active goal progress</p>
              </Stack>
            </Card>

            <Card>
              <Stack gap="1" align="start">
                <p className="caption">Cadence Health</p>
                <p className="h2 text-[var(--color-text)]">{loading ? "..." : `${summary?.checkInCompletionRate || 0}%`}</p>
                <p className="caption">Check-in completion rate</p>
              </Stack>
            </Card>

            <Card>
              <Stack gap="1" align="start">
                <p className="caption">Risk Snapshot</p>
                <p className="h2 text-[var(--color-text)]">{loading ? "..." : `${summary?.atRiskGoals || 0}`}</p>
                <p className="caption">Goals currently at risk</p>
              </Stack>
            </Card>
          </Grid>
        )}

        {showExecution && (
          <Grid cols={1} colsLg={2} gap="4">
            <Card>
              <Stack gap="3" align="start">
                <div className="flex w-full items-center justify-between gap-[var(--space-2)]">
                  <h2 className="h4 text-[var(--color-text)]">Cycle Trends</h2>
                  <Badge variant="info">Aggregate only</Badge>
                </div>

                <div className="w-full overflow-x-auto">
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
              </Stack>
            </Card>

            <Card>
              <Stack gap="3" align="start">
                <Stack gap="1" align="start">
                  <h2 className="h4 text-[var(--color-text)]">Manager Quality Bands</h2>
                  <p className="caption">Based on check-in completion performance.</p>
                </Stack>

                <Grid cols={1} colsMd={3} gap="3">
                  <Card className="bg-[var(--color-bg)]">
                    <Stack gap="1" align="start">
                      <p className="caption">Strong</p>
                      <p className="h3 text-[var(--color-success)]">{qualityBandMap.strong}</p>
                    </Stack>
                  </Card>
                  <Card className="bg-[var(--color-bg)]">
                    <Stack gap="1" align="start">
                      <p className="caption">Watch</p>
                      <p className="h3 text-[var(--color-warning)]">{qualityBandMap.watch}</p>
                    </Stack>
                  </Card>
                  <Card className="bg-[var(--color-bg)]">
                    <Stack gap="1" align="start">
                      <p className="caption">Critical</p>
                      <p className="h3 text-[var(--color-danger)]">{qualityBandMap.critical}</p>
                    </Stack>
                  </Card>
                </Grid>

                <Stack gap="2" align="start">
                  <h3 className="h5 text-[var(--color-text)]">Metric Registry</h3>
                  <div className="flex flex-wrap gap-[var(--space-2)]">
                    {(overview?.metricDefinitions || []).map((item) => (
                      <Badge key={item.key} variant="default">{item.label}</Badge>
                    ))}
                  </div>
                </Stack>
              </Stack>
            </Card>
          </Grid>
        )}

        {showRisk && (
          <Card>
            <Stack gap="3" align="start">
              <Stack gap="1" align="start">
                <h2 className="h4 text-[var(--color-text)]">Department Risk View</h2>
                <p className="caption">No employee identifiers are exposed in leadership scope.</p>
              </Stack>

              <div className="w-full overflow-x-auto">
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
            </Stack>
          </Card>
        )}

        {showSuccession && (
          <Card>
            <Stack gap="3" align="start">
              <Stack gap="1" align="start">
                <h2 className="h4 text-[var(--color-text)]">Succession Snapshot</h2>
                <p className="caption">Aggregated readiness view with no employee identifiers.</p>
              </Stack>

              <Grid cols={1} colsMd={3} gap="3">
                <Card className="bg-[var(--color-bg)]">
                  <Stack gap="1" align="start">
                    <p className="caption">Ready Now</p>
                    <p className="h3 text-[var(--color-success)]">{loading ? "..." : succession?.readinessCounts.ready_now || 0}</p>
                  </Stack>
                </Card>
                <Card className="bg-[var(--color-bg)]">
                  <Stack gap="1" align="start">
                    <p className="caption">Ready 1-2 Years</p>
                    <p className="h3 text-[var(--color-primary)]">{loading ? "..." : succession?.readinessCounts.ready_1_2_years || 0}</p>
                  </Stack>
                </Card>
                <Card className="bg-[var(--color-bg)]">
                  <Stack gap="1" align="start">
                    <p className="caption">Emerging</p>
                    <p className="h3 text-[var(--color-warning)]">{loading ? "..." : succession?.readinessCounts.emerging || 0}</p>
                  </Stack>
                </Card>
              </Grid>

              <Grid cols={1} colsMd={2} gap="3">
                <Card className="bg-[var(--color-bg)]">
                  <Stack gap="1" align="start">
                    <p className="caption">Ready Successor %</p>
                    <p className="h3 text-[var(--color-success)]">{loading ? "..." : `${succession?.readySuccessorPct || 0}%`}</p>
                  </Stack>
                </Card>
                <Card className="bg-[var(--color-bg)]">
                  <Stack gap="1" align="start">
                    <p className="caption">Ready Soon %</p>
                    <p className="h3 text-[var(--color-primary)]">{loading ? "..." : `${succession?.readySoonPct || 0}%`}</p>
                  </Stack>
                </Card>
              </Grid>

              <div className="w-full overflow-x-auto">
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
            </Stack>
          </Card>
        )}

        {showNineBox && (
          <Grid cols={1} colsLg={2} gap="4">
            <Card>
              <Stack gap="3" align="start">
                <Stack gap="1" align="start">
                  <h2 className="h4 text-[var(--color-text)]">9-Box Distribution</h2>
                  <p className="caption">Potential vs performance distribution across leadership scope.</p>
                </Stack>

                <div className="w-full overflow-x-auto">
                  <table className="w-full text-left body-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border)]">
                        <th className="py-2 pr-3">Box</th>
                        <th className="py-2 pr-3">Potential</th>
                        <th className="py-2 pr-3">Performance</th>
                        <th className="py-2">Employees</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matrixRows.map((row) => (
                        <tr key={row.boxKey} className="border-b border-[var(--color-border)]">
                          <td className="py-2 pr-3">{row.boxKey}</td>
                          <td className="py-2 pr-3">{row.potentialBand}</td>
                          <td className="py-2 pr-3">{row.performanceBand}</td>
                          <td className="py-2">{numberCell(row.count)}</td>
                        </tr>
                      ))}
                      {!loading && matrixRows.length === 0 && (
                        <tr>
                          <td className="py-3 caption" colSpan={4}>No 9-box distribution data available.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Stack>
            </Card>

            <Card>
              <Stack gap="3" align="start">
                <Stack gap="1" align="start">
                  <h2 className="h4 text-[var(--color-text)]">Risk Departments</h2>
                  <p className="caption">Departments with lower immediate successor readiness.</p>
                </Stack>

                <div className="w-full overflow-x-auto">
                  <table className="w-full text-left body-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border)]">
                        <th className="py-2 pr-3">Department</th>
                        <th className="py-2 pr-3">Employees</th>
                        <th className="py-2 pr-3">Ready Now</th>
                        <th className="py-2 pr-3">Ready Soon</th>
                        <th className="py-2">Ready %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(succession?.riskDepartments || []).slice(0, 10).map((row) => (
                        <tr key={row.department} className="border-b border-[var(--color-border)]">
                          <td className="py-2 pr-3">{row.department}</td>
                          <td className="py-2 pr-3">{numberCell(row.totalEmployees)}</td>
                          <td className="py-2 pr-3">{numberCell(row.readyNow)}</td>
                          <td className="py-2 pr-3">{numberCell(row.readySoon)}</td>
                          <td className="py-2">{numberCell(`${row.readyPct}%`)}</td>
                        </tr>
                      ))}
                      {!loading && (succession?.riskDepartments || []).length === 0 && (
                        <tr>
                          <td className="py-3 caption" colSpan={5}>No risk department aggregates available.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Stack>
            </Card>
          </Grid>
        )}

        {showTalent && (
          <Grid cols={1} colsLg={2} gap="4">
            <Card>
              <Stack gap="3" align="start">
                <Stack gap="1" align="start">
                  <h2 className="h4 text-[var(--color-text)]">Critical Role Coverage</h2>
                  <p className="caption">Tracks critical roles currently missing identified successors.</p>
                </Stack>

                <Grid cols={1} colsMd={3} gap="3">
                  <Card className="bg-[var(--color-bg)]">
                    <Stack gap="1" align="start">
                      <p className="caption">Critical Roles</p>
                      <p className="h3 text-[var(--color-text)]">{loading ? "..." : criticalSummary?.totalCriticalRoles || 0}</p>
                    </Stack>
                  </Card>
                  <Card className="bg-[var(--color-bg)]">
                    <Stack gap="1" align="start">
                      <p className="caption">Without Successor</p>
                      <p className="h3 text-[var(--color-danger)]">{loading ? "..." : criticalSummary?.withoutSuccessors || 0}</p>
                    </Stack>
                  </Card>
                  <Card className="bg-[var(--color-bg)]">
                    <Stack gap="1" align="start">
                      <p className="caption">Gap %</p>
                      <p className="h3 text-[var(--color-warning)]">{loading ? "..." : `${criticalSummary?.withoutSuccessorPct || 0}%`}</p>
                    </Stack>
                  </Card>
                </Grid>

                <div className="w-full overflow-x-auto">
                  <table className="w-full text-left body-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border)]">
                        <th className="py-2 pr-3">Role</th>
                        <th className="py-2 pr-3">Critical</th>
                        <th className="py-2 pr-3">No Successor</th>
                        <th className="py-2">Gap %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(criticalSummary?.byRole || []).slice(0, 8).map((row) => (
                        <tr key={row.role} className="border-b border-[var(--color-border)]">
                          <td className="py-2 pr-3">{row.role}</td>
                          <td className="py-2 pr-3">{numberCell(row.totalCriticalRoles)}</td>
                          <td className="py-2 pr-3">{numberCell(row.withoutSuccessors)}</td>
                          <td className="py-2">{numberCell(`${row.withoutSuccessorPct}%`)}</td>
                        </tr>
                      ))}
                      {!loading && (criticalSummary?.byRole || []).length === 0 && (
                        <tr>
                          <td className="py-3 caption" colSpan={4}>No critical role breakdown available.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Stack>
            </Card>

            <Card>
              <Stack gap="3" align="start">
                <Stack gap="1" align="start">
                  <h2 className="h4 text-[var(--color-text)]">High-Potential Spotlight</h2>
                  <p className="caption">Aggregate heatmap of high-potential pools by department and BU.</p>
                </Stack>

                <div className="w-full overflow-x-auto">
                  <table className="w-full text-left body-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border)]">
                        <th className="py-2 pr-3">Department</th>
                        <th className="py-2 pr-3">Business Unit</th>
                        <th className="py-2 pr-3">Employees</th>
                        <th className="py-2 pr-3">Avg Readiness</th>
                        <th className="py-2">Ready Successors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(succession?.topHighPotentialEmployees || []).slice(0, 10).map((row) => (
                        <tr key={`${row.department}-${row.businessUnit}`} className="border-b border-[var(--color-border)]">
                          <td className="py-2 pr-3">{row.department}</td>
                          <td className="py-2 pr-3">{row.businessUnit || "-"}</td>
                          <td className="py-2 pr-3">{numberCell(row.employeeCount)}</td>
                          <td className="py-2 pr-3">{numberCell(row.avgReadinessScore)}</td>
                          <td className="py-2">{numberCell(row.readySuccessors)}</td>
                        </tr>
                      ))}
                      {!loading && (succession?.topHighPotentialEmployees || []).length === 0 && (
                        <tr>
                          <td className="py-3 caption" colSpan={5}>No high-potential aggregate rows available.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Stack>
            </Card>
          </Grid>
        )}
      </Stack>
    </Container>
  );
}

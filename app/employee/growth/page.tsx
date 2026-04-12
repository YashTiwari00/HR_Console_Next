"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { requestJson } from "@/app/employee/_lib/pmsClient";
import { Grid, Stack } from "@/src/components/layout";
import PageHeader from "@/src/components/patterns/PageHeader";
import CareerPathwayPanel from "@/src/components/patterns/CareerPathwayPanel";
import TnaSkillCard from "@/src/components/patterns/TnaSkillCard";
import Alert from "@/src/components/ui/Alert";
import Badge from "@/src/components/ui/Badge";
import Card from "@/src/components/ui/Card";
import CycleHistoryTimeline from "@/src/components/ui/CycleHistoryTimeline";
import NotificationBell from "@/src/components/ui/NotificationBell";
import ReadinessBadge from "@/src/components/ui/ReadinessBadge";

type TrendLabel = "new" | "stable" | "improving" | "declining";
type ReadinessLabel = "Early Stage" | "Developing" | "Ready" | "Exceeding";
type ReadinessSource = "snapshot" | "derived";
type TnaSignal = "rating" | "self_review" | "progress";

interface GrowthCycleHistoryItem {
  cycleId: string;
  cycleName: string;
  scoreLabel: string;
  computedAt: string;
}

interface GrowthTnaItem {
  area: string;
  signal: string;
  cycleId?: string;
}

interface RecentGoalItem {
  $id: string;
  title: string;
  cycleId: string;
  progressPercent: number;
  status?: string;
}

interface GrowthSummaryData {
  employeeId: string;
  employeeName: string;
  role: string;
  department: string;
  cycleHistory: GrowthCycleHistoryItem[];
  latestReadiness: {
    label: string;
    description: string;
    source: string;
  } | null;
  tnaItems: GrowthTnaItem[];
  recentGoals: RecentGoalItem[];
  selfReviewSummary: {
    totalSubmitted: number;
    latestCycleId: string | null;
  } | null;
  dataAvailable: {
    hasCycleHistory: boolean;
    hasTalentSnapshot: boolean;
    hasTnaItems: boolean;
  };
}

interface GrowthSummaryResponse {
  data?: GrowthSummaryData;
}

interface TrajectoryCycle {
  cycleId: string;
  cycleName: string;
  scoreLabel: string | null;
  computedAt: string;
}

interface TrajectoryData {
  cycles: TrajectoryCycle[];
  trendLabel: TrendLabel;
}

interface TrajectoryResponse {
  data?: TrajectoryData;
}

function normalizeReadinessLabel(value: string | undefined): ReadinessLabel {
  if (value === "Developing" || value === "Ready" || value === "Exceeding") {
    return value;
  }

  return "Early Stage";
}

function normalizeReadinessSource(value: string | undefined): ReadinessSource {
  return value === "derived" ? "derived" : "snapshot";
}

function normalizeTrend(value: string | undefined): TrendLabel {
  if (value === "stable" || value === "improving" || value === "declining") {
    return value;
  }

  return "new";
}

function normalizeTnaSignal(value: string | undefined): TnaSignal {
  if (value === "rating" || value === "self_review") {
    return value;
  }

  return "progress";
}

function EmptyJourneyIllustration() {
  return (
    <svg viewBox="0 0 160 120" width="120" height="96" fill="none" aria-hidden="true">
      <circle cx="80" cy="58" r="26" fill="var(--color-primary-subtle)" stroke="var(--color-primary)" strokeWidth="2" />
      <path d="M80 38v20" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" />
      <path d="M80 58l12 8" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" />
      <path d="M80 86c14-14 21-26 21-35a21 21 0 1 0-42 0c0 9 7 21 21 35Z" fill="var(--color-primary-subtle)" stroke="var(--color-primary)" strokeWidth="2" />
    </svg>
  );
}

function SkeletonCards() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={`growth-skeleton-${index}`}>
          <div className="space-y-3">
            <div className="h-5 w-1/2 animate-pulse rounded bg-[var(--color-surface-muted)]" />
            <div className="h-4 w-full animate-pulse rounded bg-[var(--color-surface-muted)]" />
            <div className="h-20 w-full animate-pulse rounded bg-[var(--color-surface-muted)]" />
          </div>
        </Card>
      ))}
    </div>
  );
}

export default function EmployeeGrowthPage() {
  const [growthData, setGrowthData] = useState<GrowthSummaryData | null>(null);
  const [trajectory, setTrajectory] = useState<TrajectoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [growthResult, trajectoryResult] = await Promise.allSettled([
        requestJson("/api/growth/summary"),
        requestJson("/api/analytics/employee-trajectory"),
      ]);

      if (growthResult.status === "fulfilled") {
        const payload = growthResult.value as GrowthSummaryResponse;
        setGrowthData(payload?.data || null);
      } else {
        setGrowthData(null);
        setError("Could not load growth data");
      }

      if (trajectoryResult.status === "fulfilled") {
        const payload = trajectoryResult.value as TrajectoryResponse;
        setTrajectory(payload?.data || null);
      } else {
        setTrajectory(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    document.title = "My Growth | HR Console";
  }, []);

  const growthEnabled = process.env.NEXT_PUBLIC_ENABLE_GROWTH_HUB === "true";

  const timelineCycles = useMemo(() => {
    const source = Array.isArray(trajectory?.cycles) ? trajectory.cycles : [];
    return source.map((cycle) => ({
      cycleId: String(cycle?.cycleId || ""),
      cycleName: String(cycle?.cycleName || ""),
      scoreLabel: String(cycle?.scoreLabel || ""),
      computedAt: String(cycle?.computedAt || ""),
    }));
  }, [trajectory]);

  const cycleNameById = useMemo(() => {
    const map = new Map<string, string>();

    (trajectory?.cycles || []).forEach((cycle) => {
      const id = String(cycle?.cycleId || "").trim();
      const name = String(cycle?.cycleName || "").trim();
      if (id && name) map.set(id, name);
    });

    (growthData?.cycleHistory || []).forEach((cycle) => {
      const id = String(cycle?.cycleId || "").trim();
      const name = String(cycle?.cycleName || "").trim();
      if (id && name && !map.has(id)) map.set(id, name);
    });

    return map;
  }, [growthData?.cycleHistory, trajectory?.cycles]);

  const currentCycleId =
    String(trajectory?.cycles?.[0]?.cycleId || "").trim() ||
    String(growthData?.cycleHistory?.[0]?.cycleId || "").trim();

  const activeGoals = (growthData?.recentGoals || []).filter(
    (goal) => String(goal?.status || "").toLowerCase() === "approved"
  );

  const avgProgress =
    activeGoals.length > 0
      ? Math.round(
          activeGoals.reduce((sum, goal) => {
            const progress = Number(goal?.progressPercent);
            return sum + (Number.isFinite(progress) ? progress : 0);
          }, 0) / activeGoals.length
        )
      : null;

  const isOnboarding =
    growthData?.dataAvailable?.hasCycleHistory === false &&
    growthData?.dataAvailable?.hasTnaItems === false &&
    (growthData?.recentGoals?.length ?? 0) === 0;

  const cycleAtGlanceMetrics = (
    <Grid cols={1} colsMd={3} gap="3" className="gap-[var(--space-4)]">
      <Card className="h-full border-[color-mix(in_srgb,var(--color-border)_70%,transparent)] bg-[var(--color-surface-muted)]">
        <Stack gap="1" align="center" justify="center" className="h-full min-h-[132px] text-center">
          <p className="text-3xl font-bold text-[var(--color-primary)]">{activeGoals.length}</p>
          <p className="text-xs text-[var(--color-text-muted)]">Active Goals</p>
        </Stack>
      </Card>

      <Card className="h-full border-[color-mix(in_srgb,var(--color-border)_70%,transparent)] bg-[var(--color-surface-muted)]">
        <Stack gap="1" align="center" justify="center" className="h-full min-h-[132px] text-center">
          <p className="text-3xl font-bold text-[var(--color-primary)]">
            {avgProgress === null ? "—" : `${avgProgress}%`}
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">Avg. Progress</p>
        </Stack>
      </Card>

      <Card className="h-full border-[color-mix(in_srgb,var(--color-border)_70%,transparent)] bg-[var(--color-surface-muted)]">
        <Stack gap="1" align="center" justify="center" className="h-full min-h-[132px] text-center">
          <p className="text-3xl font-bold text-[var(--color-primary)]">
            {Number(growthData?.selfReviewSummary?.totalSubmitted || 0)}
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">Self-Reviews Submitted</p>
        </Stack>
      </Card>
    </Grid>
  );

  return (
    <div className="space-y-[var(--space-6)]">
      <PageHeader
        title="My Growth"
        subtitle="Track your journey, build skills, and unlock your next career step"
        actions={<NotificationBell />}
      />

      {!growthEnabled ? (
        <div className="p-8 text-center text-[var(--color-text-muted)]">
          <p>The Growth Hub is not yet enabled for your organisation.</p>
          <p className="mt-2 text-xs">Contact your HR administrator to enable this feature.</p>
        </div>
      ) : null}

      {!growthEnabled ? null : loading ? (
        <SkeletonCards />
      ) : (
        <>
          {error ? (
            <div className="space-y-[var(--space-2)]">
              <Alert
                variant="error"
                title="Could not load growth data"
                description={error}
              />
              <button
                type="button"
                className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-[var(--space-3)] py-[var(--space-1)] text-xs text-[var(--color-text)]"
                onClick={() => void loadData()}
              >
                Try again
              </button>
            </div>
          ) : null}

          {isOnboarding ? (
            <Card>
              <div className="flex flex-col items-center gap-[var(--space-3)] py-[var(--space-6)] text-center">
                <EmptyJourneyIllustration />
                <h2 className="text-xl font-semibold text-[var(--color-text)]">Your growth journey starts here</h2>
                <p className="max-w-2xl text-sm text-[var(--color-text-muted)]">
                  Set your goals, complete your first cycle, and this page will come alive with your personalised career pathway, skill development areas, and readiness score.
                </p>
                <Link href="/employee/goals" className="text-sm font-medium text-[var(--color-primary)] underline">
                  Set your goals -&gt;
                </Link>
              </div>
            </Card>
          ) : (
            <>
              <Card className="border-[color-mix(in_srgb,var(--color-primary)_35%,var(--color-border))] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-primary-subtle)_62%,var(--color-surface))_0%,var(--color-surface)_100%)] shadow-[0_16px_40px_color-mix(in_srgb,var(--color-primary)_22%,transparent)]">
                <div className="space-y-[var(--space-4)] p-[var(--space-6)]">
                  <div className="grid grid-cols-1 gap-[var(--space-4)] lg:grid-cols-2 lg:items-start">
                    <div className="space-y-[var(--space-3)]">
                      <h2 className="h3 text-[var(--color-text)]">Your Performance Journey</h2>
                      <p className="body-sm text-[var(--color-text-muted)]">
                        Understand how your cycle progress, check-ins, and readiness are evolving so you can take your next career step with confidence.
                      </p>
                      <Link
                        href="/employee/progress"
                        className="inline-flex items-center justify-center gap-[var(--space-2)] rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-[var(--space-4)] py-[var(--space-2)] body-sm font-medium text-[var(--color-button-text)] shadow-[var(--shadow-sm)] transition-[background-color,box-shadow,transform] hover:-translate-y-px hover:bg-[var(--color-primary-hover)] hover:shadow-[0_4px_18px_color-mix(in_srgb,var(--color-primary)_45%,transparent)]"
                      >
                        Update Progress
                      </Link>
                    </div>

                    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-4)]">
                      <div className="flex items-center justify-between gap-[var(--space-2)]">
                        <p className="body-sm font-medium text-[var(--color-text)]">Current Stage</p>
                        <Badge variant="info">Early Stage</Badge>
                      </div>
                      <ul className="mt-[var(--space-2)] space-y-[var(--space-1)] text-sm text-[var(--color-text-muted)]">
                        <li className="flex items-start gap-[var(--space-2)]">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-primary)]" aria-hidden="true" />
                          <span>{loading ? "Loading cycle trend..." : `${timelineCycles.length} recorded cycle ${timelineCycles.length === 1 ? "entry" : "entries"}`}</span>
                        </li>
                        <li className="flex items-start gap-[var(--space-2)]">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-primary)]" aria-hidden="true" />
                          <span>{loading ? "Loading readiness signal..." : growthData?.latestReadiness?.description || "Readiness signals update as your cycle data grows."}</span>
                        </li>
                        <li className="flex items-start gap-[var(--space-2)]">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-primary)]" aria-hidden="true" />
                          <span>{loading ? "Loading goal momentum..." : `${activeGoals.length} active approved ${activeGoals.length === 1 ? "goal" : "goals"} in motion`}</span>
                        </li>
                      </ul>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-[var(--space-4)] lg:grid-cols-5">
                    <div className="lg:col-span-3">
                      <CycleHistoryTimeline
                        cycles={timelineCycles}
                        trendLabel={normalizeTrend(trajectory?.trendLabel)}
                        loading={loading}
                      />
                    </div>

                    <div className="lg:col-span-2">
                      <ReadinessBadge
                        label={normalizeReadinessLabel(growthData?.latestReadiness?.label)}
                        description={growthData?.latestReadiness?.description || ""}
                        source={normalizeReadinessSource(growthData?.latestReadiness?.source)}
                        size="lg"
                        showDescription={true}
                      />
                      <p className="mt-2 text-xs text-[var(--color-text-muted)]">Readiness for your next career step</p>
                    </div>
                  </div>
                </div>
              </Card>

              <Stack gap="3" className="gap-[var(--space-6)]">
                {growthData?.dataAvailable?.hasCycleHistory === true ||
                String(growthData?.role || "").trim() ? (
                  <CareerPathwayPanel
                    role={String(growthData?.role || "")}
                    department={String(growthData?.department || "")}
                    cycleId={currentCycleId}
                    cycleHistory={(growthData?.cycleHistory || []).map((cycle) => ({
                      cycleName: String(cycle?.cycleName || ""),
                      scoreLabel: String(cycle?.scoreLabel || ""),
                    }))}
                    tnaItems={(growthData?.tnaItems || []).map((item) => ({
                      area: String(item?.area || ""),
                      signal: normalizeTnaSignal(item?.signal),
                    }))}
                    readinessLabel={normalizeReadinessLabel(growthData?.latestReadiness?.label)}
                  />
                ) : (
                  <Card title="Career Pathway" description="AI-powered suggestions based on your role and performance journey">
                    <Stack gap="2" align="start">
                      <p className="text-sm text-[var(--color-text-muted)]">
                        Complete your first cycle to unlock AI pathway suggestions.
                      </p>
                      <Link href="/employee/progress" className="text-sm font-medium text-[var(--color-primary)] underline">
                        Update progress
                      </Link>
                    </Stack>
                  </Card>
                )}

                <Card>
                  <Stack gap="3" align="start" className="w-full gap-[var(--space-4)]">
                    <div className="flex w-full items-start justify-between gap-[var(--space-3)] border-b border-[color-mix(in_srgb,var(--color-border)_70%,transparent)] pb-[var(--space-2)]">
                      <div>
                        <h3 className="heading-lg text-[var(--color-text)] tracking-tight">Skills to Develop</h3>
                        <p className="caption">Based on your performance reviews and self-assessments</p>
                      </div>
                      <Link
                        href="/employee/growth"
                        className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-[var(--space-3)] py-[var(--space-2)] body-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-muted)]"
                      >
                        View All Skills
                      </Link>
                    </div>

                    {(growthData?.tnaItems?.length || 0) > 0 ? (
                      <div className="w-full space-y-3">
                        {(growthData?.tnaItems || []).map((item, index) => (
                          <TnaSkillCard
                            key={`${item.area}-${index}`}
                            area={String(item?.area || "")}
                            signal={normalizeTnaSignal(item?.signal)}
                            cycleId={String(item?.cycleId || "")}
                            cycleName={cycleNameById.get(String(item?.cycleId || "").trim())}
                            index={index}
                          />
                        ))}
                      </div>
                    ) : growthData?.dataAvailable?.hasTnaItems === false ? (
                      <Stack gap="2" align="center" className="w-full py-[var(--space-4)] text-center">
                        <p className="text-sm text-[var(--color-text-muted)]">
                          No skill suggestions yet. Complete reviews and progress updates to generate development areas.
                        </p>
                        <Link href="/employee/progress" className="text-sm font-medium text-[var(--color-primary)] underline">
                          Add progress update
                        </Link>
                      </Stack>
                    ) : null}
                  </Stack>
                </Card>

                <Card title="This Cycle At a Glance">
                  {cycleAtGlanceMetrics}
                </Card>
              </Stack>
            </>
          )}

          {isOnboarding ? (
            <Card title="This Cycle At a Glance">
              {cycleAtGlanceMetrics}
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { requestJson } from "@/app/employee/_lib/pmsClient";
import PageHeader from "@/src/components/patterns/PageHeader";
import CareerPathwayPanel from "@/src/components/patterns/CareerPathwayPanel";
import TnaSkillCard from "@/src/components/patterns/TnaSkillCard";
import Alert from "@/src/components/ui/Alert";
import Card from "@/src/components/ui/Card";
import CycleHistoryTimeline from "@/src/components/ui/CycleHistoryTimeline";
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

  return (
    <div className="space-y-4">
      <PageHeader
        title="My Growth"
        subtitle="Track your journey, build skills, and unlock your next career step."
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
            <div className="mb-2 space-y-2">
              <Alert
                variant="error"
                title="Could not load growth data"
                description={error}
              />
              <button
                type="button"
                className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text)]"
                onClick={() => void loadData()}
              >
                Try again
              </button>
            </div>
          ) : null}

          {isOnboarding ? (
            <Card>
              <div className="flex flex-col items-center gap-3 py-6 text-center">
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
              <Card title="Your Performance Journey">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
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
              </Card>

              <Card
                title="Career Pathway"
                description="AI-powered suggestions based on your role and performance journey"
              >
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
                  <p className="text-sm italic text-[var(--color-text-muted)]">
                    Career pathway suggestions will appear after your first performance cycle.
                  </p>
                )}
              </Card>

              <Card
                title="Skills to Develop"
                description="Based on your performance reviews and self-assessments"
              >
                {(growthData?.tnaItems?.length || 0) > 0 ? (
                  <div className="space-y-3">
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
                  <p className="py-6 text-center text-sm italic text-[var(--color-text-muted)]">
                    No development areas identified yet. Complete a full cycle to see personalised skill suggestions.
                  </p>
                ) : null}
              </Card>
            </>
          )}

          <Card title="This Cycle At a Glance">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 text-center">
                <p className="text-3xl font-bold text-[var(--color-primary)]">{activeGoals.length}</p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">Active Goals</p>
              </div>

              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 text-center">
                <p className="text-3xl font-bold text-[var(--color-primary)]">
                  {avgProgress === null ? "—" : `${avgProgress}%`}
                </p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">Avg. Progress</p>
              </div>

              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 text-center">
                <p className="text-3xl font-bold text-[var(--color-primary)]">
                  {Number(growthData?.selfReviewSummary?.totalSubmitted || 0)}
                </p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">Self-Reviews Submitted</p>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

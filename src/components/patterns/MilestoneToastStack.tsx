"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requestJson } from "@/app/employee/_lib/pmsClient";
import MilestoneToast from "@/src/components/ui/MilestoneToast";

interface MilestoneToastStackProps {
  enabled?: boolean;
}

interface MilestoneDocument {
  $id: string;
  milestoneType: string;
  referenceId?: string;
  triggeredAt?: string;
  $createdAt?: string;
}

function toTime(value: string | undefined) {
  const ts = new Date(String(value || "")).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

function isUuid36(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isGoalTitleMilestone(milestoneType: string) {
  return milestoneType.startsWith("progress_") || milestoneType === "checkin_completed";
}

function extractGoalTitle(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const shaped = payload as { data?: { title?: unknown }; title?: unknown };
  const fromData = typeof shaped.data?.title === "string" ? shaped.data.title : "";
  if (fromData.trim()) return fromData.trim();
  const fromRoot = typeof shaped.title === "string" ? shaped.title : "";
  return fromRoot.trim();
}

export function MilestoneToastStack({ enabled = true }: MilestoneToastStackProps) {
  const gamificationEnabled =
    String(process.env.NEXT_PUBLIC_ENABLE_GAMIFICATION || "").trim().toLowerCase() === "true";

  if (!enabled || !gamificationEnabled) {
    return null;
  }

  const [milestones, setMilestones] = useState<MilestoneDocument[]>([]);
  const [queue, setQueue] = useState<string[]>([]);
  const [activeToast, setActiveToast] = useState<MilestoneDocument | null>(null);
  const [goalTitleByReferenceId, setGoalTitleByReferenceId] = useState<Record<string, string>>({});
  const goalTitleCacheRef = useRef<Map<string, string>>(new Map());
  const gapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const milestonesById = useMemo(() => {
    const next = new Map<string, MilestoneDocument>();
    milestones.forEach((item) => {
      next.set(item.$id, item);
    });
    return next;
  }, [milestones]);

  useEffect(() => {
    let active = true;

    async function loadMilestones() {
      try {
        const payload = (await requestJson("/api/milestones")) as {
          milestones?: MilestoneDocument[];
        };

        if (!active) return;

        const rows = Array.isArray(payload?.milestones) ? payload.milestones : [];
        const sorted = [...rows].sort((a, b) => {
          const bTs = toTime(b.triggeredAt || b.$createdAt);
          const aTs = toTime(a.triggeredAt || a.$createdAt);
          return bTs - aTs;
        });

        setMilestones(sorted);
        const nextQueue = sorted.map((item) => item.$id).filter(Boolean);
        setQueue(nextQueue);
        setActiveToast(nextQueue.length > 0 ? sorted[0] || null : null);
      } catch (error) {
        console.warn("[MilestoneToastStack] failed to fetch milestones:", error);
      }
    }

    loadMilestones();

    return () => {
      active = false;
      if (gapTimerRef.current) {
        clearTimeout(gapTimerRef.current);
        gapTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const referenceIds = Array.from(
      new Set(
        milestones
          .filter((item) => isGoalTitleMilestone(String(item.milestoneType || "")))
          .map((item) => String(item.referenceId || "").trim())
          .filter((id) => Boolean(id) && isUuid36(id) && !goalTitleCacheRef.current.has(id))
      )
    );

    if (referenceIds.length === 0) return;

    let active = true;

    async function loadGoalTitles() {
      const result = await Promise.allSettled(
        referenceIds.map(async (goalId) => {
          const payload = await requestJson(`/api/goals/${encodeURIComponent(goalId)}`);
          const title = extractGoalTitle(payload);
          if (title) {
            return { goalId, title };
          }
          return null;
        })
      );

      if (!active) return;

      const nextPatch: Record<string, string> = {};
      result.forEach((item) => {
        if (item.status !== "fulfilled" || !item.value) return;
        goalTitleCacheRef.current.set(item.value.goalId, item.value.title);
        nextPatch[item.value.goalId] = item.value.title;
      });

      if (Object.keys(nextPatch).length > 0) {
        setGoalTitleByReferenceId((prev) => ({ ...prev, ...nextPatch }));
      }
    }

    loadGoalTitles();

    return () => {
      active = false;
    };
  }, [milestones]);

  useEffect(() => {
    if (activeToast) return;
    if (queue.length === 0) return;
    setActiveToast(milestonesById.get(queue[0]) || null);
  }, [activeToast, milestonesById, queue]);

  const handleDismiss = useCallback(() => {
    if (!activeToast) return;

    const dismissedId = String(activeToast.$id || "").trim();
    if (!dismissedId) return;

    requestJson("/api/milestones", {
      method: "PATCH",
      body: JSON.stringify({ milestoneIds: [dismissedId] }),
    }).catch(() => {
      // Acknowledgement should not block queue advancement.
    });

    setActiveToast(null);
    setQueue((prev) => {
      const nextQueue = prev.filter((id) => id !== dismissedId);

      if (gapTimerRef.current) {
        clearTimeout(gapTimerRef.current);
      }

      gapTimerRef.current = setTimeout(() => {
        const nextId = nextQueue[0];
        setActiveToast(nextId ? milestonesById.get(nextId) || null : null);
      }, 400);

      return nextQueue;
    });
  }, [activeToast, milestonesById]);

  if (!activeToast) return null;

  const activeType = String(activeToast.milestoneType || "").trim();
  const activeReferenceId = String(activeToast.referenceId || "").trim();
  const goalTitle = isGoalTitleMilestone(activeType)
    ? goalTitleByReferenceId[activeReferenceId]
    : undefined;

  return (
    <MilestoneToast
      milestoneType={activeType}
      goalTitle={goalTitle}
      autoDissmissMs={5000}
      onDismiss={handleDismiss}
    />
  );
}

export default MilestoneToastStack;

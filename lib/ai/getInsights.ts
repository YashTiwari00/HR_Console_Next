import type { CheckInItem, GoalItem, ProgressUpdateItem } from "@/app/employee/_lib/pmsClient";

export type InsightType = "risk" | "suggestion" | "positive";
export type InsightPriority = "high" | "medium" | "low";

export interface InsightItem {
  type: InsightType;
  message: string;
  priority: InsightPriority;
}

function parseCycleWindow(cycle: string) {
  const match = String(cycle || "").trim().toUpperCase().match(/^Q([1-4])-(\d{4})$/);
  if (!match) return null;

  const quarter = Number.parseInt(match[1], 10);
  const year = Number.parseInt(match[2], 10);
  if (!quarter || !year) return null;

  const startMonth = (quarter - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, startMonth + 3, 1, 0, 0, 0, 0));

  return { start, end };
}

function ratioElapsed(cycle: string) {
  const window = parseCycleWindow(cycle);
  if (!window) return 0;

  const now = Date.now();
  const start = window.start.getTime();
  const end = window.end.getTime();

  if (now <= start) return 0;
  if (now >= end) return 1;

  return (now - start) / (end - start);
}

function avgProgress(goals: GoalItem[]) {
  if (goals.length === 0) return 0;

  const total = goals.reduce((sum, goal) => {
    const value = Number(goal.progressPercent ?? goal.processPercent ?? 0);
    return sum + (Number.isNaN(value) ? 0 : value);
  }, 0);

  return total / goals.length;
}

function mostRecentCheckInDate(checkIns: CheckInItem[]) {
  if (checkIns.length === 0) return null;

  const timestamps = checkIns
    .map((item) => new Date(String(item.scheduledAt || "")).getTime())
    .filter((value) => !Number.isNaN(value));

  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps));
}

function mostRecentProgressDate(progressUpdates: ProgressUpdateItem[]) {
  if (progressUpdates.length === 0) return null;

  const timestamps = progressUpdates
    .map((item) => new Date(String(item.createdAt || "")).getTime())
    .filter((value) => !Number.isNaN(value));

  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps));
}

export function getInsights(
  goals: GoalItem[],
  checkIns: CheckInItem[],
  progressUpdates: ProgressUpdateItem[]
): InsightItem[] {
  const insights: InsightItem[] = [];

  const cycle = goals[0]?.cycleId || "";
  const elapsed = ratioElapsed(cycle);
  const averageProgress = avgProgress(goals);

  if (goals.length > 0 && averageProgress < 30 && elapsed > 0.5) {
    insights.push({
      type: "risk",
      message: "You are falling behind on your goals.",
      priority: "high",
    });
  }

  const recentCheckIn = mostRecentCheckInDate(checkIns);
  const recentProgress = mostRecentProgressDate(progressUpdates);
  const latestActivity = recentCheckIn && recentProgress
    ? recentCheckIn > recentProgress
      ? recentCheckIn
      : recentProgress
    : recentCheckIn || recentProgress;

  const inactivityWindowDays = 21;

  if (goals.length > 0) {
    if (!latestActivity) {
      insights.push({
        type: "suggestion",
        message: "You should schedule a check-in.",
        priority: "medium",
      });
    } else {
      const msSinceActivity = Date.now() - latestActivity.getTime();
      const daysSinceActivity = msSinceActivity / (1000 * 60 * 60 * 24);

      if (daysSinceActivity > inactivityWindowDays) {
        insights.push({
          type: "suggestion",
          message: "You should schedule a check-in.",
          priority: "medium",
        });
      }
    }
  }

  const allHighProgress = goals.length > 0 && goals.every((goal) => Number(goal.progressPercent ?? 0) > 80);

  if (allHighProgress) {
    insights.push({
      type: "positive",
      message: "Great progress, you are on track.",
      priority: "low",
    });
  }

  if (insights.length === 0) {
    insights.push({
      type: "suggestion",
      message: "Keep logging progress and check-ins to maintain momentum.",
      priority: "low",
    });
  }

  return insights;
}

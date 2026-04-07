import { appwriteConfig } from "@/lib/appwrite";
import { CHECKIN_STATUSES } from "@/lib/appwriteSchema";
import { Query, databaseId } from "@/lib/appwriteServer";

export type DecisionRiskLevel = "low" | "medium" | "high";

export interface DecisionExplainability {
  reason: string;
  confidence: number;
  based_on: string[];
}

export interface DecisionRiskItem extends DecisionExplainability {
  id: string;
  level: DecisionRiskLevel;
  message: string;
}

export interface DecisionInsightItem extends DecisionExplainability {
  id: string;
  message: string;
  flag?: string;
}

export interface DecisionRecommendationItem {
  id: string;
  message: string;
  priority: DecisionRiskLevel;
}

export interface DecisionAnalysisResult {
  employeeId: string;
  cycleId: string;
  overallRiskLevel: DecisionRiskLevel;
  topRecommendation: string;
  risks: DecisionRiskItem[];
  insights: DecisionInsightItem[];
  recommendations: DecisionRecommendationItem[];
}

type GoalRow = {
  $id: string;
  title?: string;
  employeeId?: string;
  cycleId?: string;
  contributionPercent?: number;
  aopAligned?: boolean;
  progressPercent?: number;
  processPercent?: number;
};

type ProgressRow = {
  $id?: string;
  goalId?: string;
  percentComplete?: number;
  progressPercent?: number;
  createdAt?: string;
  $createdAt?: string;
};

type CheckInRow = {
  $id?: string;
  goalId?: string;
  status?: string;
  scheduledAt?: string;
  isFinalCheckIn?: boolean;
};

type ListDocumentsResult<T> = {
  documents?: T[];
};

type DatabasesClient = {
  listDocuments: (
    databaseIdValue: string,
    collectionId: string,
    queries?: unknown[]
  ) => Promise<ListDocumentsResult<unknown>>;
};

interface AnalyzeOptions {
  databases?: DatabasesClient;
  missedCheckInThreshold?: number;
  now?: Date;
}

const DEFAULT_THRESHOLD = 2;
const DB_ID = String(databaseId || "").trim();

function clampConfidence(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function toNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toProgressPercent(goal: GoalRow, latestProgress: ProgressRow | null) {
  if (latestProgress) {
    return toNumber(
      latestProgress.progressPercent ?? latestProgress.percentComplete,
      toNumber(goal.progressPercent ?? goal.processPercent, 0)
    );
  }

  return toNumber(goal.progressPercent ?? goal.processPercent, 0);
}

function toDateValue(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return null;
  const timestamp = new Date(text).valueOf();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function isMissingCollectionError(error: unknown, collectionId: string) {
  const message = String((error as Error)?.message || "").toLowerCase();
  const normalizedCollectionId = String(collectionId || "").trim().toLowerCase();

  return (
    message.includes("collection") &&
    message.includes("could not be found") &&
    (!normalizedCollectionId || message.includes(normalizedCollectionId))
  );
}

async function listGoalsSafe(databases: DatabasesClient, employeeId: string, cycleId: string) {
  if (!DB_ID) return [];

  try {
    const response = await databases.listDocuments(
      DB_ID,
      appwriteConfig.goalsCollectionId,
      [
        Query.equal("employeeId", employeeId),
        Query.equal("cycleId", cycleId),
        Query.limit(200),
      ]
    );

    return Array.isArray(response?.documents) ? (response.documents as GoalRow[]) : [];
  } catch (error) {
    if (isMissingCollectionError(error, appwriteConfig.goalsCollectionId)) return [];
    throw error;
  }
}

async function listProgressSafe(databases: DatabasesClient, goalIds: string[]) {
  if (goalIds.length === 0) return [] as ProgressRow[];
  if (!DB_ID) return [];

  try {
    const response = await databases.listDocuments(
      DB_ID,
      appwriteConfig.progressUpdatesCollectionId,
      [Query.equal("goalId", goalIds), Query.limit(500)]
    );

    return Array.isArray(response?.documents) ? (response.documents as ProgressRow[]) : [];
  } catch (error) {
    if (isMissingCollectionError(error, appwriteConfig.progressUpdatesCollectionId)) return [];
    throw error;
  }
}

async function listCheckInsSafe(databases: DatabasesClient, employeeId: string) {
  if (!DB_ID) return [];

  try {
    const response = await databases.listDocuments(
      DB_ID,
      appwriteConfig.checkInsCollectionId,
      [Query.equal("employeeId", employeeId), Query.limit(500)]
    );

    return Array.isArray(response?.documents) ? (response.documents as CheckInRow[]) : [];
  } catch (error) {
    if (isMissingCollectionError(error, appwriteConfig.checkInsCollectionId)) return [];
    throw error;
  }
}

function deriveProgressTrend(points: number[]) {
  if (points.length < 3) {
    return { declining: false, confidence: 0 };
  }

  let declineCount = 0;
  for (let index = 1; index < points.length; index += 1) {
    if (points[index] < points[index - 1]) {
      declineCount += 1;
    }
  }

  const start = points[0];
  const end = points[points.length - 1];
  const declining = end < start && declineCount >= Math.ceil((points.length - 1) / 2);
  const confidence = clampConfidence(0.45 + (declineCount / Math.max(points.length - 1, 1)) * 0.4);

  return { declining, confidence };
}

function highestRiskLevel(risks: DecisionRiskItem[]): DecisionRiskLevel {
  if (risks.some((risk) => risk.level === "high")) return "high";
  if (risks.some((risk) => risk.level === "medium")) return "medium";
  return "low";
}

function addUniqueRecommendation(
  recommendations: DecisionRecommendationItem[],
  item: DecisionRecommendationItem
) {
  if (recommendations.some((recommendation) => recommendation.id === item.id)) return;
  recommendations.push(item);
}

export async function analyzeEmployeePerformance(
  employeeId: string,
  cycleId: string,
  options: AnalyzeOptions = {}
): Promise<DecisionAnalysisResult> {
  const normalizedEmployeeId = String(employeeId || "").trim();
  const normalizedCycleId = String(cycleId || "").trim();
  const now = options.now || new Date();

  const safeEmpty: DecisionAnalysisResult = {
    employeeId: normalizedEmployeeId,
    cycleId: normalizedCycleId,
    overallRiskLevel: "low",
    topRecommendation: "No immediate intervention required.",
    risks: [],
    insights: [],
    recommendations: [],
  };

  if (!normalizedEmployeeId || !normalizedCycleId || !options.databases) {
    return safeEmpty;
  }

  const missedThreshold = Number.isFinite(options.missedCheckInThreshold)
    ? Math.max(1, Math.floor(Number(options.missedCheckInThreshold)))
    : DEFAULT_THRESHOLD;

  const goals = await listGoalsSafe(options.databases, normalizedEmployeeId, normalizedCycleId);
  const goalIds = goals.map((goal) => String(goal.$id || "").trim()).filter(Boolean);

  const [progressRows, checkInsRaw] = await Promise.all([
    listProgressSafe(options.databases, goalIds),
    listCheckInsSafe(options.databases, normalizedEmployeeId),
  ]);

  const progressByGoal = new Map<string, ProgressRow[]>();
  for (const row of progressRows) {
    const goalId = String(row?.goalId || "").trim();
    if (!goalId) continue;

    const list = progressByGoal.get(goalId) || [];
    list.push(row);
    progressByGoal.set(goalId, list);
  }

  for (const [goalId, rows] of progressByGoal.entries()) {
    const sorted = rows
      .slice()
      .sort((a, b) => (toDateValue(a.createdAt || a.$createdAt) || 0) - (toDateValue(b.createdAt || b.$createdAt) || 0));
    progressByGoal.set(goalId, sorted);
  }

  const checkIns = checkInsRaw.filter((item) => {
    const goalId = String(item?.goalId || "").trim();
    return goalId ? goalIds.includes(goalId) : false;
  });

  const risks: DecisionRiskItem[] = [];
  const insights: DecisionInsightItem[] = [];
  const recommendations: DecisionRecommendationItem[] = [];

  for (const goal of goals) {
    const goalId = String(goal.$id || "").trim();
    if (!goalId) continue;

    const contribution = toNumber(goal.contributionPercent, 0);
    const goalProgressRows = progressByGoal.get(goalId) || [];
    const latestProgress = goalProgressRows.length > 0 ? goalProgressRows[goalProgressRows.length - 1] : null;
    const progressPercent = toProgressPercent(goal, latestProgress);

    if (progressPercent < 40 && contribution > 50) {
      risks.push({
        id: `high_impact_low_progress_${goalId}`,
        level: "high",
        message: "Employee is behind on high-impact goals",
        reason: `Goal \"${String(goal.title || "Untitled goal")}\" has ${Math.round(progressPercent)}% progress with ${Math.round(contribution)}% contribution.`,
        confidence: clampConfidence(0.88),
        based_on: ["goals", "progress_updates", "contributionPercent"],
      });

      addUniqueRecommendation(recommendations, {
        id: "schedule_coaching_session",
        message: "Schedule coaching session",
        priority: "high",
      });
    }

    if (goalProgressRows.length >= 3) {
      const points = goalProgressRows.map((row) =>
        toNumber(row.progressPercent ?? row.percentComplete, 0)
      );
      const trend = deriveProgressTrend(points);

      if (trend.declining) {
        risks.push({
          id: `declining_progress_${goalId}`,
          level: "medium",
          message: "Inconsistent performance trend detected",
          reason: `Progress trend for goal \"${String(goal.title || "Untitled goal")}\" is declining across updates.`,
          confidence: trend.confidence,
          based_on: ["progress_updates", "check_ins"],
        });

        addUniqueRecommendation(recommendations, {
          id: "increase_checkin_frequency",
          message: "Increase check-in frequency to stabilize execution",
          priority: "medium",
        });
      }
    }

    if (goal.aopAligned === false && contribution > 50) {
      insights.push({
        id: `strategic_misalignment_${goalId}`,
        flag: "Strategic misalignment",
        message: "High-impact goal appears misaligned with AOP",
        reason: `Goal \"${String(goal.title || "Untitled goal")}\" is not AOP aligned while carrying ${Math.round(contribution)}% contribution.`,
        confidence: clampConfidence(0.82),
        based_on: ["goals", "aopAligned", "contributionPercent"],
      });

      addUniqueRecommendation(recommendations, {
        id: "realign_goals_with_aop",
        message: "Realign goals with AOP",
        priority: "high",
      });
    }
  }

  const missedCheckIns = checkIns.filter((item) => {
    const status = String(item.status || "").trim().toLowerCase();
    const scheduledAt = toDateValue(item.scheduledAt);
    const missedBySchedule = scheduledAt !== null && scheduledAt < now.valueOf() && status !== CHECKIN_STATUSES.COMPLETED;
    const missedFinal = Boolean(item.isFinalCheckIn) && status !== CHECKIN_STATUSES.COMPLETED;

    return missedBySchedule || missedFinal;
  });

  if (missedCheckIns.length >= missedThreshold) {
    risks.push({
      id: "missed_engagement",
      level: "high",
      message: "Missed engagement risk is high",
      reason: `${missedCheckIns.length} check-ins are overdue or not completed (threshold ${missedThreshold}).`,
      confidence: clampConfidence(0.9),
      based_on: ["check_ins", "missed_checkins"],
    });

    addUniqueRecommendation(recommendations, {
      id: "restore_checkin_cadence",
      message: "Restore regular check-in cadence with clear follow-ups",
      priority: "high",
    });
  }

  if (risks.length === 0 && insights.length === 0) {
    insights.push({
      id: "stable_execution",
      message: "Execution appears stable for this cycle",
      reason: "No major rule-based risk conditions were triggered with available data.",
      confidence: clampConfidence(0.72),
      based_on: ["goals", "progress_updates", "check_ins"],
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: "maintain_current_plan",
      message: "Maintain current execution plan and monitor regularly",
      priority: "low",
    });
  }

  const overallRiskLevel = highestRiskLevel(risks);

  return {
    employeeId: normalizedEmployeeId,
    cycleId: normalizedCycleId,
    overallRiskLevel,
    topRecommendation: recommendations[0]?.message || safeEmpty.topRecommendation,
    risks,
    insights,
    recommendations,
  };
}

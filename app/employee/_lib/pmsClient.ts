import { account } from "@/lib/appwrite";

export type GoalStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "needs_changes"
  | "closed";

export type RagStatus = "on_track" | "behind" | "completed";

export interface GoalItem {
  $id: string;
  title: string;
  description: string;
  cycleId: string;
  managerId: string;
  frameworkType: string;
  weightage: number;
  status: GoalStatus;
  progressPercent: number;
  processPercent?: number;
  managerFinalRating?: number | null;
  managerFinalRatingLabel?: "EE" | "DE" | "ME" | "SME" | "NI" | null;
  managerFinalRatedAt?: string | null;
  ratingVisibleToEmployee?: boolean;
  parentGoalId?: string;
  cascadeSourceGoalId?: string;
  goalConversationId?: string;
  goalLevel?: "business" | "manager" | "employee" | number;
  contributionPercent?: number;
  lineageRef?: string;
  aopAligned?: boolean;
  aopReference?: string | null;
}

export interface GoalCascadePreviewItem {
  employeeId: string;
  contributionPercent: number;
}

export interface GoalCascadeResponse {
  data: GoalItem[];
  meta?: {
    parentGoalId?: string;
    splitStrategy?: string;
    totalContributionPercent?: number;
  };
}

export interface GoalLineageNode extends GoalItem {
  children?: GoalLineageNode[];
}

export interface GoalLineageData {
  ancestors: GoalLineageNode[];
  currentGoal: GoalLineageNode;
  descendants: GoalLineageNode[];
}

export interface GoalLineageChainNode {
  goalId: string;
  title: string;
  owner: string | null;
  contributionPercent: number | null;
  aopReference: string | null;
  goalLevel: string | null;
  status: string | null;
}

export interface GoalLineageChainData {
  currentGoal: GoalItem | null;
  parentGoal: GoalItem | null;
  rootGoal: GoalItem | null;
  aopReference: string | null;
  chain: GoalLineageChainNode[];
}

export interface CheckInItem {
  $id: string;
  checkInCode?: string;
  goalId: string;
  employeeId?: string;
  managerId?: string;
  scheduledAt: string;
  status: "planned" | "completed";
  employeeNotes?: string;
  managerNotes?: string;
  transcriptText?: string;
  isFinalCheckIn?: boolean;
  managerRating?: number;
  managerFinalRatingLabel?: "EE" | "DE" | "ME" | "SME" | "NI" | null;
  ratedAt?: string;
  attachmentIds?: string[];
  hrReviewStatus?: "approved" | "rejected" | "needs_changes" | null;
  hrReviewComments?: string;
  hrReviewedAt?: string | null;
  hrReviewedBy?: string | null;
  hrManagerRating?: number | null;
  hrManagerRatingLabel?: "EE" | "DE" | "ME" | "SME" | "NI" | null;
  hrManagerRatingComments?: string;
  hrManagerRatedAt?: string | null;
  managerReviewStatus?: "pending" | "reviewed";
  managerReviewedAt?: string | null;
  managerReviewComments?: string;
  selfReviewText?: string;
  selfReviewStatus?: "draft" | "submitted" | "reopened";
  selfReviewSubmittedAt?: string | null;
  selfReviewSubmittedBy?: string | null;
  selfReviewReopenedAt?: string | null;
  selfReviewReopenedBy?: string | null;
  selfReviewReopenReason?: string;
}

export interface ProgressUpdateItem {
  $id: string;
  goalId: string;
  percentComplete: number;
  ragStatus: RagStatus;
  updateText: string;
  createdAt: string;
  attachmentIds?: string[];
}

export interface UploadedAttachment {
  fileId: string;
  bucketId: string;
  name: string;
  mimeType: string;
  sizeOriginal: number;
}

export type ManagerScope = "self" | "team" | "all";

export interface TeamMemberItem {
  $id: string;
  name: string;
  email: string;
  role: string;
  region?: string;
  department?: string;
  managerId?: string;
  managerAssignedAt?: string | null;
  managerAssignedBy?: string;
  assignmentVersion?: number;
  hrId?: string;
  hrAssignedAt?: string | null;
  hrAssignedBy?: string;
  hrAssignmentVersion?: number;
}

export interface ManagerAssignmentItem {
  managerId: string;
  managerName: string;
  managerEmail: string;
  department?: string;
  parentManagerId?: string;
  parentManagerName?: string;
  parentManagerEmail?: string;
  managerAssignedAt?: string | null;
  managerAssignedBy?: string;
  assignmentVersion?: number;
  assignedByName?: string;
  assignedByEmail?: string;
  hrId?: string;
  hrName?: string;
  hrEmail?: string;
  hrAssignedAt?: string | null;
  hrAssignedBy?: string;
  hrAssignmentVersion?: number;
}

export interface ManagerAssignmentsMeta {
  hrUsers: TeamMemberItem[];
  managerUsers?: TeamMemberItem[];
  totalManagers: number;
  unassignedManagers: number;
}

export interface ManagerAssignmentsResponse {
  data: ManagerAssignmentItem[];
  meta: ManagerAssignmentsMeta;
}

export interface HrManagerSummary {
  managerId: string;
  managerName: string;
  managerEmail: string;
  teamSize: number;
  teamGoals: number;
  teamAverageProgress: number;
  plannedCheckIns: number;
  completedCheckIns: number;
  pendingManagerGoalApprovals: number;
  pendingCheckInApprovals: number;
  teamMembers: TeamMemberItem[];
  managerQuarterHistory?: Array<{
    cycleId: string;
    rating: number;
    ratingLabel: string;
    comments?: string;
    ratedAt: string;
  }>;
  teamQuarterHistory?: Array<{
    cycleId: string;
    employeeId: string;
    scoreX100: number;
    scoreLabel: string;
    computedAt: string;
    visibility: "hidden" | "visible";
  }>;
}

export interface PendingKpiTemplateItem {
  $id: string;
  title: string;
  role: string;
  department: string;
  source_type?: string;
  approved?: boolean;
}

export interface HrEmployeeDrilldown {
  employee: TeamMemberItem;
  goals: GoalItem[];
  progressUpdates: ProgressUpdateItem[];
  checkIns: CheckInItem[];
  quarterHistory?: Array<{
    cycleId: string;
    scoreX100: number;
    scoreLabel: string;
    visibility: "hidden" | "visible";
    computedAt: string;
  }>;
}

export interface HrManagerDetail {
  manager: TeamMemberItem;
  summary: HrManagerSummary;
  employees: HrEmployeeDrilldown[];
}

export type AppRole = "employee" | "manager" | "hr" | "leadership" | "region-admin";

export type CheckInApprovalDecision = "approved" | "rejected" | "needs_changes";

export interface HrCheckInApprovalItem {
  checkInId: string;
  goalId: string;
  goalTitle: string;
  managerId: string;
  managerName: string;
  employeeId: string;
  employeeName: string;
  scheduledAt: string;
  completedAt?: string;
  status: "planned" | "completed";
  managerNotes?: string;
  transcriptText?: string;
  isFinalCheckIn?: boolean;
  managerRating?: number;
  managerCycleId?: string;
  hrManagerRating?: {
    rating: number;
    ratingLabel: string;
    comments?: string;
    ratedAt: string;
    hrId: string;
  } | null;
  reviewStatus: "pending" | CheckInApprovalDecision;
  latestReview?: {
    decision: CheckInApprovalDecision;
    comments?: string;
    decidedAt: string;
    hrId: string;
  };
}

export interface CurrentUserContext {
  user: {
    $id: string;
    name?: string;
    email?: string;
  };
  profile: {
    $id?: string;
    name?: string;
    email?: string;
    role?: string;
    region?: string;
    department?: string;
    managerId?: string;
    hrId?: string;
  };
}

export interface RegionAdminOverview {
  region: string;
  managers: HrManagerSummary[];
  goals: Array<GoalItem & { employeeId?: string }>;
  progressUpdates: ProgressUpdateItem[];
  members: TeamMemberItem[];
  checkIns: CheckInItem[];
  cycles: string[];
}

export interface LeadershipMetricDefinition {
  key: string;
  label: string;
  description: string;
  category: "coverage" | "quality" | "risk";
}

export interface LeadershipOverview {
  summary: {
    employees: number;
    managers: number;
    departments: number;
    activeGoals: number;
    avgProgressPercent: number;
    checkInCompletionRate: number;
    atRiskGoals: number;
    activeCycles: number;
  };
  trendsByCycle: Array<{
    cycleId: string;
    goals: number;
    avgProgressPercent: number;
    checkInCompletionRate: number;
    atRiskGoals: number;
  }>;
  departmentRows: Array<{
    department: string;
    employees: number;
    managers: number;
    goals: number;
    avgProgressPercent: number;
    checkInCompletionRate: number;
    atRiskGoals: number;
  }>;
  managerQualityBands: Array<{
    band: "strong" | "watch" | "critical";
    managers: number;
  }>;
  metricDefinitions: LeadershipMetricDefinition[];
  asOf: string;
}

export interface HrNineBoxEmployeeItem {
  employeeId: string;
  employeeName: string;
  department: string;
  managerId?: string | null;
  cycleId?: string | null;
  scoreX100: number;
  scoreLabel?: string | null;
  trendLabel: "new" | "stable" | "improving" | "declining";
  trendDeltaPercent: number;
  performanceBand: "high" | "medium" | "low";
  potentialBand: "high" | "medium" | "low";
  readinessBand: "ready_now" | "ready_1_2_years" | "emerging";
  computedAt?: string | null;
}

export interface HrNineBoxSnapshot {
  cycleId?: string | null;
  department?: string | null;
  totalEmployees: number;
  readinessCounts: {
    ready_now: number;
    ready_1_2_years: number;
    emerging: number;
  };
  matrixRows: Array<{
    boxKey: string;
    potentialBand: "high" | "medium" | "low";
    performanceBand: "high" | "medium" | "low";
    count: number;
  }>;
  employees: HrNineBoxEmployeeItem[];
}

export interface LeadershipSuccessionSnapshot {
  cycleId?: string | null;
  totalEmployees: number;
  readinessCounts: {
    ready_now: number;
    ready_1_2_years: number;
    emerging: number;
  };
  matrixRows: Array<{
    boxKey: string;
    potentialBand: "high" | "medium" | "low";
    performanceBand: "high" | "medium" | "low";
    count: number;
  }>;
  departmentBenchStrength: Array<{
    department: string;
    totalEmployees: number;
    readyNow: number;
    readySoon: number;
    readyPct: number;
  }>;
  riskDepartments: Array<{
    department: string;
    totalEmployees: number;
    readyNow: number;
    readySoon: number;
    readyPct: number;
  }>;
  asOf: string;
}

async function getJwtHeader() {
  try {
    const jwt = await account.createJWT();
    if (jwt?.jwt) {
      return { "x-appwrite-jwt": jwt.jwt };
    }
  } catch {
    // If JWT cannot be created, server route will return unauthorized.
  }

  return {};
}

export interface GoalFeedbackItem {
  $id: string;
  goalId: string;
  decision: "approved" | "rejected" | "needs_changes";
  comments?: string;
  decidedAt: string;
  managerId: string;
}

export interface MatrixAssignmentItem {
  id: string;
  employeeId: string;
  primaryManagerId: string;
  reviewerId: string;
  goalId?: string | null;
  cycleId: string;
  influenceWeight: number;
  status: "active" | "inactive";
  assignedBy: string;
  assignedAt: string;
  notes?: string;
}

export interface MatrixFeedbackItem {
  id: string;
  assignmentId: string;
  employeeId: string;
  reviewerId: string;
  goalId?: string | null;
  cycleId: string;
  feedbackText: string;
  suggestedRating?: number | null;
  confidence?: "low" | "medium" | "high";
  createdAt: string;
}

export interface MatrixSummaryItem {
  employeeId: string;
  cycleId?: string;
  goalId?: string;
  reviewerCount: number;
  responseCount: number;
  influenceWeightTotal: number;
  weightedRating: number | null;
  keySignals: string[];
  assignmentCount: number;
  pendingCount: number;
}

export interface GoalSuggestion {
  title: string;
  description: string;
  weightage: number;
  rationale?: string;
  source?: string;
  source_type?: "hr" | "leadership" | "manager" | "system" | string;
  approved?: boolean;
  explainability?: {
    source: string;
    confidence: number | string;
    confidenceLabel?: string;
    reason?: string;
    based_on?: string[];
    time_window?: string;
    whyFactors?: string[];
    timeWindow?: string;
  };
}

export interface ExplainabilityInfo {
  source?: string;
  confidence?: number | string;
  confidenceLabel?: string;
  reason?: string;
  based_on?: string[];
  time_window?: string;
  whyFactors?: string[];
  timeWindow?: string;
}

export interface BulkGoalInput {
  title: string;
  description: string;
  weight: number;
}

export interface GoalAllocationSuggestion {
  suggestedUsers: number;
  split: number[];
}

export interface BulkGoalAnalysisItem {
  originalTitle: string;
  improvedTitle: string;
  improvedDescription: string;
  suggestedMetrics: string;
  allocationSuggestions: GoalAllocationSuggestion[];
}

export interface BulkGoalAnalysisResponse {
  goals: BulkGoalAnalysisItem[];
  fallbackUsed: boolean;
  explainability?: {
    source: string;
    confidence: number | string;
    confidenceLabel?: string;
    reason?: string;
    based_on?: string[];
    time_window?: string;
    whyFactors?: string[];
    timeWindow?: string;
  };
}

export interface BulkCheckInRowInput {
  goalId: string;
  scheduledAt: string;
  employeeNotes: string;
  isFinalCheckIn?: boolean;
  managerRating?: number | null;
  attachmentFileIds?: string[];
}

export interface BulkCheckInPreviewRow {
  rowNumber: number;
  valid: boolean;
  errors: string[];
  normalized: {
    goalId: string;
    scheduledAt: string | null;
    employeeNotes: string;
    isFinalCheckIn: boolean;
    managerRating: number | null;
    attachmentIds: string[];
    attachmentFileNames?: string[];
  };
}

export interface BulkCheckInPreviewResponse {
  ok: boolean;
  role: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rows: BulkCheckInPreviewRow[];
}

export interface BulkCheckInCommitSummary {
  successes: Array<{ rowNumber: number; checkInId: string }>;
  failures: Array<{ rowNumber: number; reason: string }>;
  successRows: number;
  failedRows: number;
}

export interface ManagerCheckInApprovalItemInput {
  checkInId: string;
  managerNotes?: string;
  transcriptText?: string;
  isFinalCheckIn?: boolean;
  managerRating?: number | null;
  managerGoalRatingLabel?: "EE" | "DE" | "ME" | "SME" | "NI" | null;
}

export interface CheckInSummarySuggestion {
  summary: string;
  balancedSummary?: string;
  insights?: string[];
  highlights: string[];
  blockers: string[];
  nextActions: string[];
  explainability?: {
    source: string;
    confidence: number | string;
    confidenceLabel?: string;
    reason?: string;
    based_on?: string[];
    time_window?: string;
    whyFactors?: string[];
    timeWindow?: string;
  };
}

export interface CheckInAgendaSuggestion {
  agenda: string[];
  focusQuestions: string[];
  riskSignals: string[];
  explainability?: {
    source: string;
    confidence: number | string;
    confidenceLabel?: string;
    reason?: string;
    based_on?: string[];
    time_window?: string;
    whyFactors?: string[];
    timeWindow?: string;
  };
  usage?: {
    cap: number;
    limit?: number;
    used: number;
    remaining: number;
    tokensUsed?: number;
    estimatedCost?: number;
    nearLimit?: boolean;
    totalCost?: number;
    budget?: number | null;
    nearBudget?: boolean;
    overBudget?: boolean;
    featureType: string;
    cycleId: string;
  };
}

export interface CheckInIntelligenceSuggestion {
  summary: string;
  balancedSummary?: string;
  insights?: string[];
  commitments: Array<{
    owner: string;
    action: string;
    dueDate?: string | null;
  }>;
  coachingScore: {
    score: number;
    reasoning: string[];
  };
  toneGuidance: string[];
  revisedManagerFeedback: string;
  ratingSuggestion?: {
    value: number;
    label: "EE" | "DE" | "ME" | "SME" | "NI";
    rationale: string;
  } | null;
  contextUsed?: {
    selfReview?: {
      status?: string;
      achievements?: string;
      challenges?: string;
      ratingValue?: number | null;
      ratingLabel?: string;
      comments?: string;
    } | null;
    checkInSummaries?: string[];
    progress?: {
      percent: number;
      latestUpdateText?: string;
    };
  };
  explainability?: {
    source: string;
    confidence: number | string;
    confidenceLabel?: string;
    reason?: string;
    based_on?: string[];
    time_window?: string;
    whyFactors?: string[];
    timeWindow?: string;
  };
  usage?: {
    cap: number;
    limit?: number;
    used: number;
    remaining: number;
    tokensUsed?: number;
    estimatedCost?: number;
    nearLimit?: boolean;
    totalCost?: number;
    budget?: number | null;
    nearBudget?: boolean;
    overBudget?: boolean;
    featureType: string;
    cycleId: string;
  };
}

export interface AiUsageFeature {
  featureType: string;
  cap: number;
  used: number;
  remaining: number;
  nearLimit?: boolean;
  warning: boolean;
}

export interface AiUsageSnapshot {
  cycleId?: string | null;
  features: AiUsageFeature[];
}

export interface HrAiGovernanceOverview {
  cycleId?: string | null;
  role?: string | null;
  totalsByFeature: Array<{
    featureType: string;
    capPerUser: number;
    totalUsed: number;
    nearCapUsers: number;
    rows: number;
  }>;
  topUsers: Array<{
    userId: string;
    featureType: string;
    cycleId?: string;
    used: number;
    cap: number;
    remaining: number;
    nearCap: boolean;
    nearLimit?: boolean;
    usagePercent?: number;
    warning: boolean;
    lastUsedAt?: string | null;
  }>;
  totalNearLimitUsers?: number;
  nearLimitUsers?: Array<{
    userId: string;
    featureType: string;
    usagePercent: number;
  }>;
  totalCostByFeature?: Array<{
    featureType: string;
    totalCost: number;
  }>;
  totalCostByRole?: Array<{
    role: string;
    totalCost: number;
  }>;
  topSpenders?: Array<{
    userId: string;
    cycleId?: string;
    role?: string;
    totalCost: number;
    budget?: number | null;
    usagePercent?: number | null;
    nearBudget?: boolean;
    overBudget?: boolean;
  }>;
  nearBudgetUsers?: Array<{
    userId: string;
    cycleId?: string;
    role?: string;
    totalCost: number;
    budget?: number | null;
    usagePercent?: number | null;
  }>;
  overBudgetUsers?: Array<{
    userId: string;
    cycleId?: string;
    role?: string;
    totalCost: number;
    budget?: number | null;
    usagePercent?: number | null;
  }>;
}

export interface LifecycleTimelineEvent {
  id: string;
  type:
    | "goal_created"
    | "goal_updated"
    | "progress_updated"
    | "checkin_planned"
    | "checkin_completed"
    | "self_review_submitted"
    | "meeting_scheduled"
    | "meeting_intelligence_ready";
  at: string;
  goalId?: string;
  employeeId?: string;
  managerId?: string;
  cycleId?: string;
  payload?: Record<string, unknown>;
}

export interface ConversationalGoalEngineResponse {
  assistantReply: string;
  questions: string[];
  suggestedGoals: Array<
    GoalSuggestion & {
      cascadeHint?: string;
    }
  >;
  goalPatch: Record<string, unknown>;
  nextActions: string[];
  contextWindow?: {
    goals: number;
    recentProgress: number;
    checkIns: number;
  };
  usage?: {
    cap: number;
    limit?: number;
    used: number;
    remaining: number;
    tokensUsed?: number;
    estimatedCost?: number;
    nearLimit?: boolean;
    totalCost?: number;
    budget?: number | null;
    nearBudget?: boolean;
    overBudget?: boolean;
    featureType: string;
    cycleId: string;
  };
  conversation?: {
    conversationId: string | null;
    parentGoalId: string | null;
    targetEmployeeId: string;
  };
  explainability?: {
    source: string;
    confidence: number | string;
    confidenceLabel?: string;
    reason?: string;
    based_on?: string[];
    time_window?: string;
    whyFactors?: string[];
    timeWindow?: string;
  };
}

export type TrajectoryTrendLabel = "new" | "stable" | "improving" | "declining";

export interface EmployeeTrajectoryCyclePoint {
  cycleId: string;
  cycleName: string;
  closedAt: string | null;
  computedAt: string | null;
  scoreX100: number | null;
  scoreLabel: "EE" | "DE" | "ME" | "SME" | "NI" | null;
}

export interface EmployeeTrajectoryData {
  employeeId: string;
  cycles: EmployeeTrajectoryCyclePoint[];
  trendLabel: TrajectoryTrendLabel;
  trendDeltaPercent: number;
}

export type DecisionRiskLevel = "low" | "medium" | "high";

export interface DecisionRiskItem {
  id: string;
  level: DecisionRiskLevel;
  message: string;
  reason: string;
  confidence: number;
  based_on: string[];
}

export interface DecisionInsightItem {
  id: string;
  message: string;
  flag?: string;
  reason: string;
  confidence: number;
  based_on: string[];
}

export interface DecisionRecommendationItem {
  id: string;
  message: string;
  priority: DecisionRiskLevel;
}

export interface DecisionInsightsData {
  employeeId: string;
  cycleId: string;
  overallRiskLevel: DecisionRiskLevel;
  topRecommendation: string;
  risks: DecisionRiskItem[];
  insights: DecisionInsightItem[];
  recommendations: DecisionRecommendationItem[];
  explainability?: ExplainabilityInfo;
}

export interface RatingDropInsightItem {
  employeeId: string;
  employeeName: string;
  previousRatingLabel: "EE" | "DE" | "ME" | "SME" | "NI" | null;
  currentRatingLabel: "EE" | "DE" | "ME" | "SME" | "NI" | null;
  dropSeverity: "HIGH RISK" | "MODERATE" | "UNKNOWN";
  shortMessage: string;
  explainability: {
    reason: string;
    based_on: string[];
    confidence: number;
  };
  riskLevel: "HIGH RISK" | "MODERATE" | null;
  drop: number | null;
  cycleId: string | null;
  createdAt: string | null;
}

export interface NotificationFeedItem {
  id: string;
  triggerType: string;
  channel: string;
  deliveryStatus: string;
  title: string;
  message: string;
  actionUrl?: string;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationTemplateItem {
  id: string;
  name: string;
  triggerType: string;
  channel: string;
  subject?: string;
  body: string;
  isEnabled: boolean;
  suppressWindowMinutes: number;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

export interface NotificationJobItem {
  id: string;
  userId: string;
  templateId?: string | null;
  triggerType: string;
  channel: string;
  status: string;
  scheduledAt: string;
  attemptCount: number;
  maxAttempts: number;
  dedupeKey?: string;
  payload?: Record<string, unknown>;
  lastError?: string;
}

export interface CalibrationSessionItem {
  id: string;
  name: string;
  cycleId: string;
  status: "draft" | "active" | "closed";
  scope?: string;
  notes?: string;
  version: number;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CalibrationDecisionItem {
  id: string;
  sessionId: string;
  employeeId: string;
  managerId?: string | null;
  previousRating?: number | null;
  proposedRating?: number | null;
  finalRating?: number | null;
  rationale: string;
  changed: boolean;
  version: number;
  decidedBy?: string | null;
  decidedAt: string;
}

export interface CalibrationTimelineItem {
  id: string;
  eventType: string;
  at: string;
  actorId?: string | null;
  employeeId?: string | null;
  summary: string;
  payload?: {
    previousRating?: number | null;
    proposedRating?: number | null;
    finalRating?: number | null;
    changed?: boolean;
    rationale?: string;
    version?: number;
  };
}

function toTrajectoryTrendLabel(value: unknown): TrajectoryTrendLabel {
  const text = String(value || "").trim().toLowerCase();
  if (text === "improving") return "improving";
  if (text === "declining") return "declining";
  if (text === "stable") return "stable";
  return "new";
}

function toNumberOrNull(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toTrajectoryScoreLabel(
  value: unknown
): EmployeeTrajectoryCyclePoint["scoreLabel"] {
  const text = String(value || "").trim().toUpperCase();
  if (text === "EE") return "EE";
  if (text === "DE") return "DE";
  if (text === "ME") return "ME";
  if (text === "SME") return "SME";
  if (text === "NI") return "NI";
  return null;
}

function normalizeTrajectoryData(payload: unknown, requestedEmployeeId?: string): EmployeeTrajectoryData {
  const raw = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const rawCycles = Array.isArray(raw.cycles) ? raw.cycles : [];

  const cycles: EmployeeTrajectoryCyclePoint[] = rawCycles
    .map((item) => {
      const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const scoreRaw = toNumberOrNull(row.scoreX100);

      return {
        cycleId: String(row.cycleId || "").trim(),
        cycleName: String(row.cycleName || row.cycleId || "").trim(),
        closedAt: typeof row.closedAt === "string" ? row.closedAt : null,
        computedAt: typeof row.computedAt === "string" ? row.computedAt : null,
        scoreX100: scoreRaw === null ? null : Math.max(0, Math.round(scoreRaw)),
        scoreLabel: toTrajectoryScoreLabel(row.scoreLabel),
      };
    })
    .filter((row) => Boolean(row.cycleId) || Boolean(row.computedAt) || row.scoreX100 !== null);

  const delta = toNumberOrNull(raw.trendDeltaPercent);

  return {
    employeeId: String(raw.employeeId || requestedEmployeeId || "").trim(),
    cycles,
    trendLabel: toTrajectoryTrendLabel(raw.trendLabel),
    trendDeltaPercent: delta === null ? 0 : Number(delta.toFixed(2)),
  };
}

export type MeetRequestStatus = "pending" | "scheduled" | "rejected" | "canceled";
export type MeetRequestSource = "employee_request" | "manager_direct";
export type MeetingType = "individual" | "group";

export interface MeetingActionItem {
  owner: string;
  action: string;
  dueDate?: string | null;
}

export interface MeetingGoalInsight {
  goalId: string;
  insight: string;
  impact?: "positive" | "neutral" | "risk";
}

export interface MeetingIntelligenceReport {
  transcriptText: string;
  summary: string;
  keyTakeaways: string[];
  actionItems: MeetingActionItem[];
  goalInsights: MeetingGoalInsight[];
  generatedAt: string;
  explainability?: {
    source: string;
    confidence: number | string;
    confidenceLabel?: string;
    reason?: string;
    based_on?: string[];
    time_window?: string;
    whyFactors?: string[];
    timeWindow?: string;
  };
}

export interface MeetingChatAnswer {
  answer: string;
  citations: string[];
  explainability?: {
    source: string;
    confidence: number | string;
    confidenceLabel?: string;
    reason?: string;
    based_on?: string[];
    time_window?: string;
    whyFactors?: string[];
    timeWindow?: string;
  };
}

export interface GoogleTokenStatus {
  connected: boolean;
  reason: "ok" | "expired" | "missing_token";
  expiresAt: string | null;
  email: string | null;
}

export interface FreeBusyResponse {
  busy: Array<{ start: string; end: string }>;
  timeMin: string;
  timeMax: string;
  timeZone: string;
}

export interface CalendarEventItem {
  eventId: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  meetLink: string;
  eventLink: string;
  status: string;
  attendees: string[];
}

export interface CalendarEventsResponse {
  targetUserId: string;
  events: CalendarEventItem[];
  timeMin: string;
  timeMax: string;
  timeZone: string;
}

export interface MeetRequestItem {
  $id: string;
  employeeId: string;
  managerId: string;
  status: MeetRequestStatus;
  source: MeetRequestSource;
  requestedAt: string;
  proposedStartTime?: string | null;
  proposedEndTime?: string | null;
  scheduledStartTime?: string | null;
  scheduledEndTime?: string | null;
  title: string;
  description?: string;
  managerNotes?: string;
  meetLink?: string;
  eventId?: string;
  timezone: string;
  linkedGoalIds?: string[];
  participantIds?: string[];
  participantEmails?: string[];
  meetingType?: MeetingType;
  transcriptText?: string;
  transcriptSource?: string;
  intelligenceGeneratedAt?: string;
  intelligenceSummary?: string;
  intelligenceKeyTakeaways?: string[];
  intelligenceActionItems?: MeetingActionItem[];
  intelligenceGoalInsights?: MeetingGoalInsight[];
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  const text = String(value || "").trim();
  if (!text) return [];

  if (text.startsWith("[") || text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => String(item || "").trim())
          .filter(Boolean);
      }
    } catch {
      // Fall through to comma-separated parsing.
    }
  }

  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseMeetingActionItems(value: unknown): MeetingActionItem[] {
  const text = String(value || "").trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => ({
        owner: String(item?.owner || "").trim(),
        action: String(item?.action || "").trim(),
        dueDate: item?.dueDate ? String(item.dueDate) : null,
      }))
      .filter((item) => item.owner && item.action);
  } catch {
    return [];
  }
}

function parseMeetingGoalInsights(value: unknown): MeetingGoalInsight[] {
  const text = String(value || "").trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => ({
        goalId: String(item?.goalId || "").trim(),
        insight: String(item?.insight || "").trim(),
        impact: String(item?.impact || "").trim() as MeetingGoalInsight["impact"],
      }))
      .filter((item) => item.goalId && item.insight);
  } catch {
    return [];
  }
}

function normalizeMeetRequestItem(input: unknown): MeetRequestItem {
  const row = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return {
    ...(row as unknown as MeetRequestItem),
    linkedGoalIds: parseStringArray(row.linkedGoalIds),
    participantIds: parseStringArray(row.participantIds),
    participantEmails: parseStringArray(row.participantEmails),
    meetingType: String(row.meetingType || "").trim() === "group" ? "group" : "individual",
    intelligenceKeyTakeaways: parseStringArray(row.intelligenceKeyTakeaways),
    intelligenceActionItems: parseMeetingActionItems(row.intelligenceActionItems),
    intelligenceGoalInsights: parseMeetingGoalInsights(row.intelligenceGoalInsights),
  };
}

export async function requestJson(url: string, init?: RequestInit) {
  const jwtHeader = await getJwtHeader();
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");

  Object.entries(jwtHeader).forEach(([key, value]) => {
    headers.set(key, value);
  });

  const res = await fetch(url, {
    ...init,
    headers,
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.error || "Request failed.");
  }

  return payload;
}

export async function fetchCurrentUserContext() {
  const payload = await requestJson("/api/me");
  return (payload?.data || {}) as CurrentUserContext;
}

export async function fetchGoogleTokenStatus() {
  const payload = await requestJson("/api/google/tokens/status");
  return (payload?.data || {}) as GoogleTokenStatus;
}

export async function fetchGoogleTokenStatusForUser(targetUserId: string) {
  const payload = await requestJson(
    `/api/google/tokens/status?targetUserId=${encodeURIComponent(targetUserId)}`
  );
  return (payload?.data || {}) as GoogleTokenStatus & { targetUserId?: string };
}

export async function upsertGoogleToken(input: {
  accessToken?: string;
  refreshToken?: string;
  expiry?: string;
  email?: string;
  scope?: string;
}) {
  const payload = await requestJson("/api/google/tokens", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return payload?.data as {
    $id: string;
    userId: string;
    email: string;
    expiry: string;
    provider: string;
  };
}

export async function upsertGoogleTokenAsAdmin(input: {
  targetUserId: string;
  accessToken?: string;
  refreshToken?: string;
  expiry?: string;
  email?: string;
  scope?: string;
}) {
  const payload = await requestJson("/api/google/tokens/admin-upsert", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return payload?.data as {
    $id: string;
    userId: string;
    email: string;
    expiry: string;
    provider: string;
  };
}

export async function uploadAttachment(file: File) {
  const jwtHeader = await getJwtHeader();
  const formData = new FormData();
  formData.append("file", file);
  const headers = new Headers();

  Object.entries(jwtHeader).forEach(([key, value]) => {
    headers.set(key, value);
  });

  const res = await fetch("/api/attachments", {
    method: "POST",
    headers,
    body: formData,
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.error || "Attachment upload failed.");
  }

  return payload?.data as UploadedAttachment;
}

export async function uploadAttachments(files: File[]) {
  const uploaded: UploadedAttachment[] = [];

  for (const file of files) {
    uploaded.push(await uploadAttachment(file));
  }

  return uploaded;
}

function withListQuery(input?: {
  goalId?: string;
  scope?: ManagerScope;
  employeeId?: string;
}) {
  if (!input?.goalId && !input?.scope && !input?.employeeId) return "";

  const params = new URLSearchParams();

  if (input?.goalId) {
    params.set("goalId", input.goalId);
  }

  if (input?.scope) {
    params.set("scope", input.scope);
  }

  if (input?.employeeId) {
    params.set("employeeId", input.employeeId);
  }

  return `?${params.toString()}`;
}

export async function fetchGoals(scope?: ManagerScope, employeeId?: string) {
  const query = withListQuery({ scope, employeeId });
  const payload = await requestJson(`/api/goals${query}`);
  return ((payload.data || []) as Array<GoalItem & { processPercent?: number }>).map(
    (goal) => ({
      ...goal,
      progressPercent: goal.progressPercent ?? goal.processPercent ?? 0,
    })
  );
}

export async function fetchCheckIns(scope?: ManagerScope, employeeId?: string) {
  const query = withListQuery({ scope, employeeId });
  const payload = await requestJson(`/api/check-ins${query}`);
  return (payload.data || []) as CheckInItem[];
}

export async function fetchMeetRequests(employeeId?: string) {
  const query = employeeId ? `?employeeId=${encodeURIComponent(employeeId)}` : "";
  const payload = await requestJson(`/api/meet-requests${query}`);
  return ((payload?.data || []) as unknown[]).map((item) => normalizeMeetRequestItem(item));
}

export async function createMeetRequest(input: {
  title: string;
  description?: string;
  proposedStartTime?: string;
  proposedEndTime?: string;
  timeZone?: string;
  linkedGoalIds?: string[];
  meetingType?: MeetingType;
  participantIds?: string[];
}) {
  const payload = await requestJson("/api/meet-requests", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return normalizeMeetRequestItem(payload?.data);
}

export async function updateMeetRequestAction(
  requestId: string,
  input:
    | { action: "reject"; managerNotes?: string }
    | {
        action: "schedule";
        startTime: string;
        endTime: string;
        title?: string;
        description?: string;
        managerNotes?: string;
        timeZone?: string;
        linkedGoalIds?: string[];
        meetingType?: MeetingType;
        participantIds?: string[];
      }
) {
  const payload = await requestJson(`/api/meet-requests/${encodeURIComponent(requestId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });

  return payload?.data;
}

export async function fetchEmployeeFreeBusy(input: {
  employeeId: string;
  startDate: string;
  endDate: string;
  timeZone?: string;
}) {
  const payload = await requestJson("/api/calendar/freebusy", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return payload?.data as FreeBusyResponse;
}

export async function fetchCalendarEvents(input: {
  employeeId?: string;
  startDate: string;
  endDate: string;
  timeZone?: string;
  maxResults?: number;
}) {
  const params = new URLSearchParams();

  if (input.employeeId) {
    params.set("employeeId", input.employeeId);
  }

  params.set("startDate", input.startDate);
  params.set("endDate", input.endDate);

  if (input.timeZone) {
    params.set("timeZone", input.timeZone);
  }

  if (typeof input.maxResults === "number") {
    params.set("maxResults", String(input.maxResults));
  }

  const payload = await requestJson(`/api/calendar/events?${params.toString()}`);
  return (payload?.data || {
    targetUserId: "",
    events: [],
    timeMin: input.startDate,
    timeMax: input.endDate,
    timeZone: input.timeZone || "UTC",
  }) as CalendarEventsResponse;
}

export async function createManagerDirectMeeting(input: {
  employeeId: string;
  startTime: string;
  endTime: string;
  title: string;
  description?: string;
  managerNotes?: string;
  timeZone?: string;
  linkedGoalIds?: string[];
  meetingType?: MeetingType;
  participantIds?: string[];
}) {
  const payload = await requestJson("/api/calendar/create-meeting", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return {
    ...(payload?.data || {}),
    meeting: normalizeMeetRequestItem(payload?.data?.meeting),
  } as {
    meeting: MeetRequestItem;
    event: {
      eventId: string;
      eventLink: string;
      meetLink: string;
      status: string;
    };
  };
}

export async function generateMeetingIntelligence(
  meetingId: string,
  input: {
    transcriptText: string;
    transcriptSource?: string;
  }
) {
  const payload = await requestJson(
    `/api/meet-requests/${encodeURIComponent(meetingId)}/intelligence`,
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  );

  return {
    meeting: normalizeMeetRequestItem(payload?.data?.meeting),
    report: (payload?.data?.report || null) as MeetingIntelligenceReport,
  };
}

export async function fetchMeetingIntelligence(meetingId: string) {
  const payload = await requestJson(
    `/api/meet-requests/${encodeURIComponent(meetingId)}/intelligence`
  );
  return {
    meeting: normalizeMeetRequestItem(payload?.data?.meeting),
    report: (payload?.data?.report || null) as MeetingIntelligenceReport | null,
  };
}

export async function askMeetingQuestion(meetingId: string, question: string) {
  const payload = await requestJson(`/api/meet-requests/${encodeURIComponent(meetingId)}/chat`, {
    method: "POST",
    body: JSON.stringify({ question }),
  });
  return (payload?.data || {}) as MeetingChatAnswer;
}

export async function downloadMeetingReport(meetingId: string) {
  const jwtHeader = await getJwtHeader();
  const headers = new Headers();

  Object.entries(jwtHeader).forEach(([key, value]) => {
    headers.set(key, value);
  });

  const response = await fetch(`/api/meet-requests/${encodeURIComponent(meetingId)}/download`, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error || "Unable to download meeting report.");
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `meeting-report-${meetingId}.txt`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function fetchProgressUpdates(
  goalId?: string,
  scope?: ManagerScope,
  employeeId?: string
) {
  const query = withListQuery({ goalId, scope, employeeId });
  const payload = await requestJson(`/api/progress-updates${query}`);
  return (payload.data || []) as ProgressUpdateItem[];
}

export async function fetchGoalFeedback(
  goalId?: string,
  scope?: ManagerScope,
  employeeId?: string
) {
  const query = withListQuery({ goalId, scope, employeeId });
  const payload = await requestJson(`/api/goals/feedback${query}`);
  return (payload.data || []) as GoalFeedbackItem[];
}

export async function fetchMatrixAssignments(input: {
  employeeId?: string;
  reviewerId?: string;
  cycleId?: string;
  goalId?: string;
} = {}) {
  const params = new URLSearchParams();

  if (input.employeeId) params.set("employeeId", input.employeeId);
  if (input.reviewerId) params.set("reviewerId", input.reviewerId);
  if (input.cycleId) params.set("cycleId", input.cycleId);
  if (input.goalId) params.set("goalId", input.goalId);

  const query = params.toString() ? `?${params.toString()}` : "";
  const payload = await requestJson(`/api/matrix-reviewers/assignments${query}`);
  return (payload?.data || []) as MatrixAssignmentItem[];
}

export async function createMatrixAssignment(input: {
  employeeId: string;
  reviewerId: string;
  cycleId: string;
  influenceWeight: number;
  goalId?: string;
  notes?: string;
  status?: "active" | "inactive";
}) {
  const payload = await requestJson("/api/matrix-reviewers/assignments", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return payload?.data as MatrixAssignmentItem;
}

export async function fetchMatrixFeedback(input: {
  assignmentId?: string;
  employeeId?: string;
  reviewerId?: string;
  cycleId?: string;
  goalId?: string;
} = {}) {
  const params = new URLSearchParams();

  if (input.assignmentId) params.set("assignmentId", input.assignmentId);
  if (input.employeeId) params.set("employeeId", input.employeeId);
  if (input.reviewerId) params.set("reviewerId", input.reviewerId);
  if (input.cycleId) params.set("cycleId", input.cycleId);
  if (input.goalId) params.set("goalId", input.goalId);

  const query = params.toString() ? `?${params.toString()}` : "";
  const payload = await requestJson(`/api/matrix-reviewers/feedback${query}`);
  return (payload?.data || []) as MatrixFeedbackItem[];
}

export async function submitMatrixFeedback(input: {
  assignmentId: string;
  employeeId: string;
  cycleId: string;
  feedbackText: string;
  suggestedRating?: number;
  confidence?: "low" | "medium" | "high";
  goalId?: string;
}) {
  const payload = await requestJson("/api/matrix-reviewers/feedback", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return payload?.data as MatrixFeedbackItem;
}

export async function fetchMatrixSummary(input: {
  employeeId: string;
  cycleId?: string;
  goalId?: string;
}) {
  const params = new URLSearchParams();
  params.set("employeeId", input.employeeId);
  if (input.cycleId) params.set("cycleId", input.cycleId);
  if (input.goalId) params.set("goalId", input.goalId);

  const payload = await requestJson(`/api/matrix-reviewers/summary?${params.toString()}`);
  return (payload?.data || null) as MatrixSummaryItem | null;
}

export async function fetchTeamMembers(
  managerId?: string,
  options?: { includeManagers?: boolean }
) {
  const params = new URLSearchParams();

  if (managerId) {
    params.set("managerId", managerId);
  }

  if (options?.includeManagers) {
    params.set("includeManagers", "true");
  }

  const query = params.toString() ? `?${params.toString()}` : "";
  const payload = await requestJson(`/api/team-members${query}`);
  return (payload.data || []) as TeamMemberItem[];
}

export async function fetchTeamAssignments(managerId?: string) {
  const query = managerId ? `?managerId=${encodeURIComponent(managerId)}` : "";
  const payload = await requestJson(`/api/team-assignments${query}`);
  return (payload.data || []) as TeamMemberItem[];
}

export async function assignEmployeeToManager(input: {
  employeeId: string;
  managerId: string;
}) {
  const payload = await requestJson("/api/team-assignments", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return payload?.data as TeamMemberItem;
}

export async function updateEmployeeManagerAssignment(employeeId: string, managerId: string) {
  const payload = await requestJson(`/api/team-assignments/${encodeURIComponent(employeeId)}`, {
    method: "PUT",
    body: JSON.stringify({ managerId }),
  });

  return payload?.data as TeamMemberItem;
}

export async function removeEmployeeManagerAssignment(employeeId: string) {
  const payload = await requestJson(`/api/team-assignments/${encodeURIComponent(employeeId)}`, {
    method: "DELETE",
  });

  return payload?.data as TeamMemberItem;
}

export async function fetchManagerAssignments(input?: {
  parentManagerId?: string;
  hrId?: string;
  unassigned?: boolean;
}) {
  const params = new URLSearchParams();

  const parentManagerId = input?.parentManagerId || input?.hrId;

  if (parentManagerId) {
    params.set("parentManagerId", parentManagerId);
  }

  if (typeof input?.unassigned === "boolean") {
    params.set("unassigned", String(input.unassigned));
  }

  const query = params.toString() ? `?${params.toString()}` : "";
  const payload = await requestJson(`/api/manager-assignments${query}`);

  return {
    data: (payload?.data || []) as ManagerAssignmentItem[],
    meta: {
      hrUsers: ((payload?.meta?.managerUsers || payload?.meta?.hrUsers || []) as TeamMemberItem[]),
      managerUsers: ((payload?.meta?.managerUsers || payload?.meta?.hrUsers || []) as TeamMemberItem[]),
      totalManagers: Number(payload?.meta?.totalManagers || 0),
      unassignedManagers: Number(payload?.meta?.unassignedManagers || 0),
    },
  } as ManagerAssignmentsResponse;
}

export async function assignManagerToParentManager(input: {
  managerId: string;
  parentManagerId: string;
}) {
  const payload = await requestJson("/api/manager-assignments", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return payload?.data as ManagerAssignmentItem;
}

export async function updateManagerParentAssignment(managerId: string, parentManagerId: string) {
  const payload = await requestJson(`/api/manager-assignments/${encodeURIComponent(managerId)}`, {
    method: "PUT",
    body: JSON.stringify({ parentManagerId }),
  });

  return payload?.data as ManagerAssignmentItem;
}

export async function removeManagerParentAssignment(managerId: string) {
  const payload = await requestJson(`/api/manager-assignments/${encodeURIComponent(managerId)}`, {
    method: "DELETE",
  });

  return payload?.data as ManagerAssignmentItem;
}

// Backward-compatible aliases for older call sites.
export async function assignManagerToHr(input: { managerId: string; hrId: string }) {
  return assignManagerToParentManager({
    managerId: input.managerId,
    parentManagerId: input.hrId,
  });
}

export async function updateManagerHrAssignment(managerId: string, hrId: string) {
  return updateManagerParentAssignment(managerId, hrId);
}

export async function removeManagerHrAssignment(managerId: string) {
  return removeManagerParentAssignment(managerId);
}

export async function fetchMe() {
  const payload = await requestJson("/api/me");
  return payload?.data;
}

export async function fetchHrManagers() {
  const payload = await requestJson("/api/hr/managers");
  return (payload?.data || []) as HrManagerSummary[];
}

export async function fetchPendingKpiTemplates() {
  const payload = await requestJson("/api/goal-library/pending");
  return (payload?.data || []) as PendingKpiTemplateItem[];
}

export async function approveKpiTemplate(templateId: string) {
  const payload = await requestJson("/api/goal-library/approve", {
    method: "POST",
    body: JSON.stringify({ templateId }),
  });

  return payload as {
    success: boolean;
    message: string;
  };
}

export async function fetchRegionAdminOverview() {
  const payload = await requestJson("/api/region-admin/overview");
  return (payload?.data || {}) as RegionAdminOverview;
}

export async function fetchLeadershipOverview() {
  const payload = await requestJson("/api/leadership/overview");
  return (payload?.data || {}) as LeadershipOverview;
}

export async function fetchHrNineBoxSnapshot(input?: {
  cycleId?: string;
  department?: string;
}) {
  const params = new URLSearchParams();
  if (input?.cycleId) params.set("cycleId", input.cycleId);
  if (input?.department) params.set("department", input.department);

  const query = params.toString() ? `?${params.toString()}` : "";
  const payload = await requestJson(`/api/hr/9-box${query}`);
  return (payload?.data || {
    totalEmployees: 0,
    readinessCounts: { ready_now: 0, ready_1_2_years: 0, emerging: 0 },
    matrixRows: [],
    employees: [],
  }) as HrNineBoxSnapshot;
}

export async function fetchLeadershipSuccessionSnapshot(cycleId?: string) {
  const query = cycleId ? `?cycleId=${encodeURIComponent(cycleId)}` : "";
  const payload = await requestJson(`/api/leadership/succession${query}`);
  return (payload?.data || {
    totalEmployees: 0,
    readinessCounts: { ready_now: 0, ready_1_2_years: 0, emerging: 0 },
    matrixRows: [],
    departmentBenchStrength: [],
    riskDepartments: [],
    asOf: new Date().toISOString(),
  }) as LeadershipSuccessionSnapshot;
}

export async function fetchHrManagerDetail(managerId: string) {
  const payload = await requestJson(`/api/hr/managers/${encodeURIComponent(managerId)}`);
  return payload?.data as HrManagerDetail;
}

export async function fetchHrCheckInApprovals(status: "pending" | "approved" | "rejected" | "needs_changes" | "all" = "pending") {
  const payload = await requestJson(`/api/hr/checkin-approvals?status=${encodeURIComponent(status)}`);
  return (payload?.data || []) as HrCheckInApprovalItem[];
}

export async function submitHrCheckInApproval(input: {
  checkInId: string;
  decision: CheckInApprovalDecision;
  comments?: string;
  managerRatingLabel?: "EE" | "DE" | "ME" | "SME" | "NI";
}) {
  const payload = await requestJson("/api/hr/checkin-approvals", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return payload?.data;
}

export async function closeHrCycle(cycleId: string) {
  const payload = await requestJson(`/api/hr/cycles/${encodeURIComponent(cycleId)}/close`, {
    method: "POST",
  });

  return payload?.data as {
    cycleId: string;
    closed: boolean;
    employeesUpdated: number;
  };
}

export async function fetchHrCycleAutoApprovalConfig(cycleId: string) {
  const payload = await requestJson(
    `/api/hr/cycles/${encodeURIComponent(cycleId)}/auto-approval`
  );

  return payload?.data as {
    cycleId: string;
    autoApprovalEnabled: boolean;
    autoApprovalDays: number;
  };
}

export async function updateHrCycleAutoApprovalConfig(
  cycleId: string,
  input: {
    autoApprovalEnabled: boolean;
    autoApprovalDays: number;
  }
) {
  const payload = await requestJson(
    `/api/hr/cycles/${encodeURIComponent(cycleId)}/auto-approval`,
    {
      method: "PUT",
      body: JSON.stringify(input),
    }
  );

  return payload?.data as {
    cycleId: string;
    autoApprovalEnabled: boolean;
    autoApprovalDays: number;
  };
}

export async function updateUserRoleAsHr(userId: string, role: AppRole) {
  const payload = await requestJson(`/api/hr/roles/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });

  return payload?.data as {
    userId: string;
    previousRole: AppRole | null;
    role: AppRole;
    changed: boolean;
  };
}

export async function createGoal(input: {
  title: string;
  description: string;
  cycleId: string;
  frameworkType: string;
  managerId: string;
  weightage: number;
  dueDate?: string | null;
  aiSuggested?: boolean;
}) {
  return requestJson("/api/goals", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createTeamGoal(input: {
  employeeId: string;
  title: string;
  description: string;
  cycleId: string;
  frameworkType: string;
  weightage: number;
  dueDate?: string | null;
  aiSuggested?: boolean;
}) {
  return requestJson("/api/goals/for-employee", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function submitGoal(goalId: string) {
  return requestJson(`/api/goals/${goalId}/submit`, { method: "POST" });
}

export async function updateGoal(
  goalId: string,
  input: {
    title: string;
    description: string;
    cycleId: string;
    frameworkType: string;
    managerId: string;
    weightage: number;
    dueDate?: string | null;
    aiSuggested?: boolean;
  }
) {
  return requestJson(`/api/goals/${goalId}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function createProgressUpdate(input: {
  goalId: string;
  percentComplete: number;
  ragStatus: RagStatus;
  updateText: string;
  attachmentIds?: string[];
}) {
  return requestJson("/api/progress-updates", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createCheckIn(input: {
  goalId: string;
  scheduledAt: string;
  employeeNotes?: string;
  status?: "planned" | "completed";
  isFinalCheckIn?: boolean;
  attachmentIds?: string[];
}) {
  return requestJson("/api/check-ins", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function previewBulkCheckIns(input: { rows: BulkCheckInRowInput[] }) {
  const payload = await requestJson("/api/check-ins/import/preview", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return payload as BulkCheckInPreviewResponse;
}

export async function commitBulkCheckIns(input: {
  rows: BulkCheckInRowInput[];
  idempotencyKey: string;
  templateVersion?: string;
}) {
  const payload = await requestJson("/api/check-ins/import/commit", {
    method: "POST",
    headers: {
      "x-idempotency-key": input.idempotencyKey,
    },
    body: JSON.stringify(input),
  });

  return payload as {
    ok: boolean;
    replayed: boolean;
    importJobId: string;
    status: string;
    summary: BulkCheckInCommitSummary;
  };
}

export async function submitManagerCheckInApprovals(input: {
  items: ManagerCheckInApprovalItemInput[];
}) {
  const payload = await requestJson("/api/check-ins/manager-approvals", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return payload as {
    ok: boolean;
    summary: {
      total: number;
      approved: number;
      failed: number;
      successes: Array<{ checkInId: string; status: string }>;
      failures: Array<{ checkInId: string; reason: string }>;
    };
  };
}

export async function getGoalSuggestions(input: {
  cycleId: string;
  frameworkType: string;
  prompt?: string;
}) {
  const payload = await requestJson("/api/ai/goal-suggestion", {
    method: "POST",
    body: JSON.stringify(input),
  });

  const source = String(payload?.data?.source || payload?.source || "").trim();

  const suggestions = Array.isArray(payload?.data?.suggestions)
    ? payload.data.suggestions
    : [];

  return suggestions.map((item: unknown) => {
    const suggestion = (item || {}) as Record<string, unknown>;

    return {
      ...suggestion,
      title: String(suggestion.title || "").trim(),
      description: String(suggestion.description || "").trim(),
      weightage: Number.parseInt(String(suggestion.weightage || "0"), 10) || 0,
      rationale: String(suggestion.rationale || "").trim() || undefined,
      source: String(suggestion.source || source || "ai").trim() || "ai",
      source_type: String(suggestion.source_type || "").trim() || undefined,
      approved:
        typeof suggestion.approved === "boolean"
          ? suggestion.approved
          : undefined,
      explainability:
        ((suggestion.explainability || null) as ExplainabilityInfo | null) ||
        undefined,
    } as GoalSuggestion;
  });
}

export async function getBulkGoalAnalysis(input: {
  goals: BulkGoalInput[];
  role: "manager" | "employee";
  cycleId?: string;
}) {
  const payload = await requestJson("/api/ai/analyze-goals", {
    method: "POST",
    body: JSON.stringify(input),
  });

  const goals = Array.isArray(payload?.goals)
    ? payload.goals.map((goal: unknown) => {
        const item = (goal || {}) as Record<string, unknown>;

        return {
          originalTitle: String(item.originalTitle || "").trim(),
          improvedTitle: String(item.improvedTitle || "").trim(),
          improvedDescription: String(item.improvedDescription || "").trim(),
          suggestedMetrics: String(item.suggestedMetrics || "").trim(),
          allocationSuggestions: Array.isArray(item.allocationSuggestions)
            ? item.allocationSuggestions.map((allocation: unknown) => {
                const normalized = (allocation || {}) as Record<string, unknown>;

                return {
                  suggestedUsers: Number.parseInt(String(normalized.suggestedUsers || "1"), 10) || 1,
                  split: Array.isArray(normalized.split)
                    ? normalized.split
                        .map((value: unknown) => Number.parseInt(String(value), 10))
                        .filter((value: number) => Number.isInteger(value) && value >= 0)
                    : [],
                };
              })
            : [],
        };
      })
    : [];

  return {
    goals,
    fallbackUsed: Boolean(payload?.fallbackUsed),
  } as BulkGoalAnalysisResponse;
}

export async function getCheckInSummarySuggestion(input: {
  cycleId: string;
  notes: string;
  goalTitle?: string;
  goalId?: string;
  employeeId?: string;
}) {
  const payload = await requestJson("/api/ai/checkin-summary", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return payload?.data as CheckInSummarySuggestion;
}

export async function getCheckInAgendaSuggestion(input: {
  cycleId: string;
  goalTitle: string;
  employeeNotes?: string;
  scheduledAt?: string;
}) {
  const payload = await requestJson("/api/ai/checkin-agenda", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return payload?.data as CheckInAgendaSuggestion;
}

export async function getCheckInIntelligenceSuggestion(input: {
  cycleId: string;
  notes: string;
  goalTitle?: string;
  goalId?: string;
  employeeId?: string;
}) {
  const payload = await requestJson("/api/ai/checkin-intelligence", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return payload?.data as CheckInIntelligenceSuggestion;
}

export async function fetchAiUsageSnapshot(cycleId?: string) {
  const query = cycleId ? `?cycleId=${encodeURIComponent(cycleId)}` : "";
  const payload = await requestJson(`/api/ai/usage${query}`);
  return (payload?.data || { features: [] }) as AiUsageSnapshot;
}

export async function fetchHrAiGovernanceOverview(cycleId?: string, role?: string) {
  const params = new URLSearchParams();
  if (cycleId) params.set("cycleId", cycleId);
  if (role) params.set("role", role);
  const query = params.toString() ? `?${params.toString()}` : "";
  const payload = await requestJson(`/api/hr/ai-governance/overview${query}`);
  return (payload?.data || { totalsByFeature: [], topUsers: [] }) as HrAiGovernanceOverview;
}

export async function getConversationalGoalSuggestions(input: {
  cycleId: string;
  frameworkType: string;
  message: string;
  conversationId?: string;
  parentGoalId?: string;
  targetEmployeeId?: string;
}) {
  const payload = await requestJson("/api/ai/conversational-goals", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return (payload?.data || {}) as ConversationalGoalEngineResponse;
}

export async function fetchGoalChildren(goalId: string) {
  const payload = await requestJson(`/api/goals/${encodeURIComponent(goalId)}/children`);
  return (payload?.data || []) as GoalItem[];
}

function normalizeLineageNode(node: unknown): GoalLineageNode {
  const value = (node || {}) as Record<string, unknown>;

  return {
    ...value,
    progressPercent: value.progressPercent ?? value.processPercent ?? 0,
    children: Array.isArray(value.children)
      ? value.children.map((child: unknown) => normalizeLineageNode(child))
      : [],
  } as GoalLineageNode;
}

export async function fetchGoalLineage(goalId: string) {
  const payload = await requestJson(`/api/goals/${encodeURIComponent(goalId)}/lineage`);
  const data = payload?.data || {};

  return {
    ancestors: Array.isArray(data?.ancestors)
      ? data.ancestors.map((row: unknown) => normalizeLineageNode(row))
      : [],
    currentGoal: normalizeLineageNode(data?.currentGoal || {}),
    descendants: Array.isArray(data?.descendants)
      ? data.descendants.map((row: unknown) => normalizeLineageNode(row))
      : [],
  } as GoalLineageData;
}

export async function fetchGoalLineageChain(goalId: string) {
  const payload = await requestJson(`/api/goals/lineage?goalId=${encodeURIComponent(goalId)}`);
  const data = payload?.data || {};

  return {
    currentGoal: (data?.currentGoal || null) as GoalItem | null,
    parentGoal: (data?.parentGoal || null) as GoalItem | null,
    rootGoal: (data?.rootGoal || null) as GoalItem | null,
    aopReference: data?.aopReference ? String(data.aopReference) : null,
    chain: Array.isArray(data?.chain)
      ? data.chain.map((node: unknown) => {
          const value = (node || {}) as Record<string, unknown>;

          return {
            goalId: String(value.goalId || "").trim(),
            title: String(value.title || "").trim(),
            owner: value.owner ? String(value.owner) : null,
            contributionPercent:
              typeof value.contributionPercent === "number" ? value.contributionPercent : null,
            aopReference: value.aopReference ? String(value.aopReference) : null,
            goalLevel: value.goalLevel ? String(value.goalLevel) : null,
            status: value.status ? String(value.status) : null,
          };
        })
      : [],
  } as GoalLineageChainData;
}

export async function createCascadedGoal(
  goalId: string,
  input: {
    title: string;
    description: string;
    weightage: number;
    employeeId?: string;
    cycleId?: string;
    frameworkType?: string;
    dueDate?: string | null;
    aiSuggested?: boolean;
    lineageRef?: string;
    goalLevel?: number;
    goalConversationId?: string;
    conversationId?: string;
  }
) {
  const payload = await requestJson(`/api/goals/${encodeURIComponent(goalId)}/cascade`, {
    method: "POST",
    body: JSON.stringify(input),
  });

  return payload?.data as GoalItem;
}

export async function createGoalCascade(input: {
  parentGoalId: string;
  employeeIds: string[];
  splitStrategy:
    | "equal"
    | {
        type: "custom";
        contributions:
          | Record<string, number>
          | GoalCascadePreviewItem[];
      };
}) {
  const payload = await requestJson("/api/goals/cascade", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return {
    data: (payload?.data || []) as GoalItem[],
    meta: payload?.meta || {},
  } as GoalCascadeResponse;
}

export async function fetchLifecycleTimeline(input?: {
  cycleId?: string;
  goalId?: string;
  employeeId?: string;
  scope?: ManagerScope;
  limit?: number;
}) {
  const params = new URLSearchParams();

  if (input?.cycleId) params.set("cycleId", input.cycleId);
  if (input?.goalId) params.set("goalId", input.goalId);
  if (input?.employeeId) params.set("employeeId", input.employeeId);
  if (input?.scope) params.set("scope", input.scope);
  if (typeof input?.limit === "number") params.set("limit", String(input.limit));

  const query = params.toString() ? `?${params.toString()}` : "";
  const payload = await requestJson(`/api/timeline/lifecycle${query}`);

  return {
    data: (payload?.data || []) as LifecycleTimelineEvent[],
    meta: payload?.meta || {},
  };
}

export async function fetchEmployeeTrajectory(employeeId?: string) {
  const query = employeeId
    ? `?employeeId=${encodeURIComponent(employeeId)}`
    : "";

  const payload = await requestJson(`/api/analytics/employee-trajectory${query}`);
  return normalizeTrajectoryData(payload?.data, employeeId);
}

export async function fetchDecisionInsights(input: {
  employeeId: string;
  cycleId: string;
}) {
  const params = new URLSearchParams();
  params.set("employeeId", input.employeeId);
  params.set("cycleId", input.cycleId);

  const payload = await requestJson(`/api/analytics/decision-insights?${params.toString()}`);
  const data = (payload?.data || {
    employeeId: input.employeeId,
    cycleId: input.cycleId,
    overallRiskLevel: "low",
    topRecommendation: "No immediate intervention required.",
    risks: [],
    insights: [],
    recommendations: [],
  }) as DecisionInsightsData;

  return {
    ...data,
    explainability: ((payload?.explainability || null) as ExplainabilityInfo | null) || undefined,
  } as DecisionInsightsData;
}

export async function fetchRatingDropInsights(input?: {
  cycleId?: string;
  managerId?: string;
  riskLevel?: "HIGH RISK" | "MODERATE";
  limit?: number;
}) {
  const params = new URLSearchParams();

  if (input?.cycleId) params.set("cycleId", input.cycleId);
  if (input?.managerId) params.set("managerId", input.managerId);
  if (input?.riskLevel) params.set("riskLevel", input.riskLevel);
  if (typeof input?.limit === "number") params.set("limit", String(input.limit));

  const query = params.toString() ? `?${params.toString()}` : "";
  const payload = await requestJson(`/api/analytics/rating-drops${query}`);

  return {
    filters: (payload?.data?.filters || {
      cycleId: null,
      managerId: null,
      riskLevel: null,
    }) as {
      cycleId: string | null;
      managerId: string | null;
      riskLevel: string | null;
    },
    rows: (payload?.data?.rows || []) as RatingDropInsightItem[],
  };
}

export async function fetchNotificationFeed(input?: { limit?: number; includeRead?: boolean }) {
  const params = new URLSearchParams();
  if (typeof input?.limit === "number") params.set("limit", String(input.limit));
  if (typeof input?.includeRead === "boolean") params.set("includeRead", String(input.includeRead));

  const query = params.toString() ? `?${params.toString()}` : "";
  const payload = await requestJson(`/api/notifications/feed${query}`);

  return {
    data: (payload?.data || []) as NotificationFeedItem[],
    meta: payload?.meta || {},
  };
}

export async function markNotificationRead(eventId: string) {
  const payload = await requestJson(
    `/api/notifications/events/${encodeURIComponent(eventId)}/read`,
    {
      method: "PATCH",
    }
  );

  return payload?.data as { id: string; isRead: boolean; readAt?: string | null };
}

export async function markAllNotificationsRead(limit = 200) {
  const payload = await requestJson("/api/notifications/read-all", {
    method: "PATCH",
    body: JSON.stringify({ limit }),
  });

  return payload?.data as { marked: number; failed: number };
}

export async function submitCheckInSelfReview(checkInId: string, input: { selfReviewText: string }) {
  const payload = await requestJson(
    `/api/check-ins/${encodeURIComponent(checkInId)}/self-review`,
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  );

  return payload?.data as CheckInItem;
}

export async function fetchNotificationTemplates(input?: {
  limit?: number;
  includeDisabled?: boolean;
}) {
  const params = new URLSearchParams();
  if (typeof input?.limit === "number") params.set("limit", String(input.limit));
  if (typeof input?.includeDisabled === "boolean") {
    params.set("includeDisabled", String(input.includeDisabled));
  }

  const query = params.toString() ? `?${params.toString()}` : "";
  const payload = await requestJson(`/api/notifications/templates${query}`);

  return {
    data: (payload?.data || []) as NotificationTemplateItem[],
    meta: payload?.meta || {},
  };
}

export async function createNotificationTemplate(input: {
  name: string;
  triggerType: string;
  channel: string;
  subject?: string;
  body: string;
  isEnabled?: boolean;
  suppressWindowMinutes?: number;
}) {
  const payload = await requestJson("/api/notifications/templates", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return payload?.data as NotificationTemplateItem;
}

export async function fetchNotificationJobs(input?: {
  limit?: number;
  status?: string;
  userId?: string;
}) {
  const params = new URLSearchParams();
  if (typeof input?.limit === "number") params.set("limit", String(input.limit));
  if (input?.status) params.set("status", input.status);
  if (input?.userId) params.set("userId", input.userId);

  const query = params.toString() ? `?${params.toString()}` : "";
  const payload = await requestJson(`/api/notifications/jobs${query}`);

  return {
    data: (payload?.data || []) as NotificationJobItem[],
    meta: payload?.meta || {},
  };
}

export async function enqueueNotificationJob(input: {
  userId: string;
  templateId?: string;
  triggerType: string;
  channel: string;
  scheduledAt?: string;
  dedupeKey?: string;
  payload?: Record<string, unknown>;
  maxAttempts?: number;
}) {
  const payload = await requestJson("/api/notifications/jobs", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return payload?.data as NotificationJobItem;
}

export async function fetchCalibrationSessions(input?: {
  cycleId?: string;
  status?: "draft" | "active" | "closed";
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (input?.cycleId) params.set("cycleId", input.cycleId);
  if (input?.status) params.set("status", input.status);
  if (typeof input?.limit === "number") params.set("limit", String(input.limit));

  const query = params.toString() ? `?${params.toString()}` : "";
  const payload = await requestJson(`/api/hr/calibration-sessions${query}`);

  return {
    data: (payload?.data || []) as CalibrationSessionItem[],
    meta: payload?.meta || {},
  };
}

export async function createCalibrationSession(input: {
  name: string;
  cycleId: string;
  status?: "draft" | "active" | "closed";
  scope?: string;
  notes?: string;
}) {
  const payload = await requestJson("/api/hr/calibration-sessions", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return payload?.data as CalibrationSessionItem;
}

export async function fetchCalibrationDecisions(sessionId: string) {
  const payload = await requestJson(
    `/api/hr/calibration-sessions/${encodeURIComponent(sessionId)}/decisions`
  );

  return {
    data: (payload?.data || []) as CalibrationDecisionItem[],
    meta: payload?.meta || {},
  };
}

export async function createCalibrationDecision(
  sessionId: string,
  input: {
    employeeId: string;
    managerId?: string;
    previousRating?: number | null;
    proposedRating: number;
    finalRating?: number | null;
    rationale: string;
  }
) {
  const payload = await requestJson(
    `/api/hr/calibration-sessions/${encodeURIComponent(sessionId)}/decisions`,
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  );

  return payload?.data as CalibrationDecisionItem;
}

export async function fetchCalibrationTimeline(sessionId: string) {
  const payload = await requestJson(
    `/api/hr/calibration-sessions/${encodeURIComponent(sessionId)}/timeline`
  );

  return {
    data: (payload?.data || []) as CalibrationTimelineItem[],
    meta: payload?.meta || {},
  };
}

export function goalStatusVariant(status: GoalStatus) {
  if (status === "approved" || status === "closed") return "success" as const;
  if (status === "submitted") return "info" as const;
  if (status === "needs_changes") return "warning" as const;
  return "default" as const;
}

export function checkInStatusVariant(status: "planned" | "completed") {
  return status === "completed" ? ("success" as const) : ("info" as const);
}

export function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return `${new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(date)} UTC`;
}

export function getAttachmentDownloadPath(fileId: string) {
  return `/api/attachments/${encodeURIComponent(fileId)}/download`;
}

export function getCycleIdFromDate(input?: string | Date) {
  const date = input ? new Date(input) : new Date();
  const safeDate = Number.isNaN(date.valueOf()) ? new Date() : date;
  const year = safeDate.getUTCFullYear();
  const quarter = Math.floor(safeDate.getUTCMonth() / 3) + 1;
  return `Q${quarter}-${year}`;
}

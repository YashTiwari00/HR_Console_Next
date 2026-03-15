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
  ratedAt?: string;
  attachmentIds?: string[];
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
  department?: string;
  managerId?: string;
  managerAssignedAt?: string | null;
  managerAssignedBy?: string;
  assignmentVersion?: number;
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
}

export interface HrEmployeeDrilldown {
  employee: TeamMemberItem;
  goals: GoalItem[];
  progressUpdates: ProgressUpdateItem[];
  checkIns: CheckInItem[];
}

export interface HrManagerDetail {
  manager: TeamMemberItem;
  summary: HrManagerSummary;
  employees: HrEmployeeDrilldown[];
}

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
    department?: string;
  };
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

export interface GoalSuggestion {
  title: string;
  description: string;
  weightage: number;
  rationale?: string;
  explainability?: {
    source: string;
    confidence: string;
  };
}

export interface CheckInSummarySuggestion {
  summary: string;
  highlights: string[];
  blockers: string[];
  nextActions: string[];
  explainability?: {
    source: string;
    confidence: string;
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

export async function fetchTeamMembers(managerId?: string) {
  const query = managerId ? `?managerId=${encodeURIComponent(managerId)}` : "";
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

export async function fetchMe() {
  const payload = await requestJson("/api/me");
  return payload?.data;
}

export async function fetchHrManagers() {
  const payload = await requestJson("/api/hr/managers");
  return (payload?.data || []) as HrManagerSummary[];
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
}) {
  const payload = await requestJson("/api/hr/checkin-approvals", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return payload?.data;
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

export async function getGoalSuggestions(input: {
  cycleId: string;
  frameworkType: string;
  prompt?: string;
}) {
  const payload = await requestJson("/api/ai/goal-suggestion", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return (payload?.data?.suggestions || []) as GoalSuggestion[];
}

export async function getCheckInSummarySuggestion(input: {
  cycleId: string;
  notes: string;
  goalTitle?: string;
}) {
  const payload = await requestJson("/api/ai/checkin-summary", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return payload?.data as CheckInSummarySuggestion;
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

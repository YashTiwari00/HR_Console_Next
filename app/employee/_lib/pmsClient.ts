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
  goalId: string;
  employeeId?: string;
  managerId?: string;
  scheduledAt: string;
  status: "planned" | "completed";
  employeeNotes?: string;
  managerNotes?: string;
  transcriptText?: string;
  isFinalCheckIn?: boolean;
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

export async function fetchGoals() {
  const payload = await requestJson("/api/goals");
  return ((payload.data || []) as Array<GoalItem & { processPercent?: number }>).map(
    (goal) => ({
      ...goal,
      progressPercent: goal.progressPercent ?? goal.processPercent ?? 0,
    })
  );
}

export async function fetchCheckIns() {
  const payload = await requestJson("/api/check-ins");
  return (payload.data || []) as CheckInItem[];
}

export async function fetchProgressUpdates(goalId?: string) {
  const query = goalId ? `?goalId=${encodeURIComponent(goalId)}` : "";
  const payload = await requestJson(`/api/progress-updates${query}`);
  return (payload.data || []) as ProgressUpdateItem[];
}

export async function fetchGoalFeedback(goalId?: string) {
  const query = goalId ? `?goalId=${encodeURIComponent(goalId)}` : "";
  const payload = await requestJson(`/api/goals/feedback${query}`);
  return (payload.data || []) as GoalFeedbackItem[];
}

export async function fetchMe() {
  const payload = await requestJson("/api/me");
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
  return date.toLocaleString();
}

export function getAttachmentDownloadPath(fileId: string) {
  return `/api/attachments/${encodeURIComponent(fileId)}/download`;
}

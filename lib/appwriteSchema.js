export const COLLECTION_IDS = {
  users: process.env.NEXT_PUBLIC_USERS_COLLECTION_ID || "users",
  goals: process.env.NEXT_PUBLIC_GOALS_COLLECTION_ID || "goals",
  goalApprovals:
    process.env.NEXT_PUBLIC_GOAL_APPROVALS_COLLECTION_ID || "goal_approvals",
  checkInApprovals:
    process.env.NEXT_PUBLIC_CHECK_IN_APPROVALS_COLLECTION_ID || "checkin_approvals",
  checkIns: process.env.NEXT_PUBLIC_CHECK_INS_COLLECTION_ID || "check_ins",
  progressUpdates:
    process.env.NEXT_PUBLIC_PROGRESS_UPDATES_COLLECTION_ID || "progress_updates",
  goalCycles: process.env.NEXT_PUBLIC_GOAL_CYCLES_COLLECTION_ID || "goal_cycles",
  aiEvents: process.env.NEXT_PUBLIC_AI_EVENTS_COLLECTION_ID || "ai_events",
};

export const GOAL_STATUSES = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  APPROVED: "approved",
  NEEDS_CHANGES: "needs_changes",
  CLOSED: "closed",
};

export const CHECKIN_STATUSES = {
  PLANNED: "planned",
  COMPLETED: "completed",
};

export const RAG_STATUSES = {
  ON_TRACK: "on_track",
  BEHIND: "behind",
  COMPLETED: "completed",
};

export const FRAMEWORK_TYPES = {
  OKR: "OKR",
  MBO: "MBO",
  HYBRID: "HYBRID",
};

export const PERIOD_TYPES = {
  QUARTERLY: "quarterly",
  YEARLY: "yearly",
  HYBRID: "hybrid",
};

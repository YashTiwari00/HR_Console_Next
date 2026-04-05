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
  employeeCycleScores:
    process.env.NEXT_PUBLIC_EMPLOYEE_CYCLE_SCORES_COLLECTION_ID || "employee_cycle_scores",
  managerCycleRatings:
    process.env.NEXT_PUBLIC_MANAGER_CYCLE_RATINGS_COLLECTION_ID || "manager_cycle_ratings",
  aiEvents: process.env.NEXT_PUBLIC_AI_EVENTS_COLLECTION_ID || "ai_events",
  googleTokens:
    process.env.NEXT_PUBLIC_GOOGLE_TOKENS_COLLECTION_ID || "google_tokens",
  googleMeetRequests:
    process.env.NEXT_PUBLIC_GOOGLE_MEET_REQUESTS_COLLECTION_ID || "google_meet_requests",
  meetingMetadata:
    process.env.NEXT_PUBLIC_MEETING_METADATA_COLLECTION_ID || "meeting_metadata",
  meetingIntelligence:
    process.env.NEXT_PUBLIC_MEETING_INTELLIGENCE_COLLECTION_ID || "meeting_intelligence",
  meetingIntelligenceDetails:
    process.env.NEXT_PUBLIC_MEETING_INTELLIGENCE_DETAILS_COLLECTION_ID || "meeting_intelligence_details",
  notificationTemplates:
    process.env.NEXT_PUBLIC_NOTIFICATION_TEMPLATES_COLLECTION_ID || "notification_templates",
  notificationJobs:
    process.env.NEXT_PUBLIC_NOTIFICATION_JOBS_COLLECTION_ID || "notification_jobs",
  notificationEvents:
    process.env.NEXT_PUBLIC_NOTIFICATION_EVENTS_COLLECTION_ID || "notification_events",
  calibrationSessions:
    process.env.NEXT_PUBLIC_CALIBRATION_SESSIONS_COLLECTION_ID || "calibration_sessions",
  calibrationDecisions:
    process.env.NEXT_PUBLIC_CALIBRATION_DECISIONS_COLLECTION_ID || "calibration_decisions",
  matrixReviewerAssignments:
    process.env.NEXT_PUBLIC_MATRIX_REVIEWER_ASSIGNMENTS_COLLECTION_ID || "matrix_reviewer_assignments",
  matrixReviewerFeedback:
    process.env.NEXT_PUBLIC_MATRIX_REVIEWER_FEEDBACK_COLLECTION_ID || "matrix_reviewer_feedback",
  frameworkPolicies:
    process.env.NEXT_PUBLIC_FRAMEWORK_POLICIES_COLLECTION_ID || "framework_policies",
  importJobs:
    process.env.NEXT_PUBLIC_IMPORT_JOBS_COLLECTION_ID || "import_jobs",
  talentSnapshots:
    process.env.NEXT_PUBLIC_TALENT_SNAPSHOTS_COLLECTION_ID || "talent_snapshots",
};

export const GOAL_STATUSES = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  APPROVED: "approved",
  NEEDS_CHANGES: "needs_changes",
  CLOSED: "closed",
};

export const GOAL_LEVELS = {
  BUSINESS: "business",
  MANAGER: "manager",
  EMPLOYEE: "employee",
};

export const CHECKIN_STATUSES = {
  PLANNED: "planned",
  COMPLETED: "completed",
};

export const MEET_REQUEST_STATUSES = {
  PENDING: "pending",
  SCHEDULED: "scheduled",
  REJECTED: "rejected",
  CANCELED: "canceled",
};

export const MEET_REQUEST_SOURCES = {
  EMPLOYEE_REQUEST: "employee_request",
  MANAGER_DIRECT: "manager_direct",
};

export const NOTIFICATION_CHANNELS = {
  IN_APP: "in_app",
  EMAIL: "email",
};

export const NOTIFICATION_TRIGGER_TYPES = {
  GOAL_PENDING_APPROVAL: "goal_pending_approval",
  CHECKIN_OVERDUE: "checkin_overdue",
  REVIEW_PENDING: "review_pending",
  CYCLE_DEADLINE: "cycle_deadline",
  MANUAL: "manual",
};

export const NOTIFICATION_JOB_STATUSES = {
  PENDING: "pending",
  PROCESSING: "processing",
  RETRY: "retry",
  SENT: "sent",
  FAILED: "failed",
  SUPPRESSED: "suppressed",
  CANCELED: "canceled",
};

export const NOTIFICATION_DELIVERY_STATUSES = {
  DELIVERED: "delivered",
  FAILED: "failed",
  SUPPRESSED: "suppressed",
};

export const EXPLAINABILITY_CONFIDENCE = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
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
  BSC: "BSC",
  COMPETENCY: "COMPETENCY",
};

export const RATING_VISIBILITY = {
  HIDDEN: "hidden",
  VISIBLE: "visible",
};

export const RATING_LABELS = {
  EE: "EE",
  DE: "DE",
  ME: "ME",
  SME: "SME",
  NI: "NI",
};

export const PERIOD_TYPES = {
  QUARTERLY: "quarterly",
  YEARLY: "yearly",
  HYBRID: "hybrid",
};

export const MATRIX_REVIEW_ASSIGNMENT_STATUS = {
  ACTIVE: "active",
  INACTIVE: "inactive",
};

export const IMPORT_JOB_STATUSES = {
  PREVIEWED: "previewed",
  COMMITTED: "committed",
  FAILED: "failed",
};

export const TALENT_TREND_LABELS = {
  NEW: "new",
  STABLE: "stable",
  IMPROVING: "improving",
  DECLINING: "declining",
};

export const TALENT_BANDS = {
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
};

export const TALENT_READINESS_BANDS = {
  READY_NOW: "ready_now",
  READY_1_2_YEARS: "ready_1_2_years",
  EMERGING: "emerging",
};

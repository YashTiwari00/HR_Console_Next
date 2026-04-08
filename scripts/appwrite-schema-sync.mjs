import { Client, Databases } from "node-appwrite";

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.NEXT_PUBLIC_DATABASE_ID;

const mode = process.argv.includes("--apply") ? "apply" : "audit";

const collections = {
  users: process.env.NEXT_PUBLIC_USERS_COLLECTION_ID || "users",
  goals: process.env.NEXT_PUBLIC_GOALS_COLLECTION_ID || "goals",
  goal_approvals:
    process.env.NEXT_PUBLIC_GOAL_APPROVALS_COLLECTION_ID || "goal_approvals",
  goal_self_reviews:
    process.env.NEXT_PUBLIC_GOAL_SELF_REVIEWS_COLLECTION_ID || "goal_self_reviews",
  goal_kpi_library:
    process.env.NEXT_PUBLIC_GOAL_KPI_LIBRARY_COLLECTION_ID || "goal_kpi_library",
  checkins: process.env.NEXT_PUBLIC_CHECK_INS_COLLECTION_ID || "check_ins",
  progress: process.env.NEXT_PUBLIC_PROGRESS_UPDATES_COLLECTION_ID || "progress_updates",
  goal_cycles: process.env.NEXT_PUBLIC_GOAL_CYCLES_COLLECTION_ID || "goal_cycles",
  employee_cycle_scores:
    process.env.NEXT_PUBLIC_EMPLOYEE_CYCLE_SCORES_COLLECTION_ID || "employee_cycle_scores",
  manager_cycle_ratings:
    process.env.NEXT_PUBLIC_MANAGER_CYCLE_RATINGS_COLLECTION_ID || "manager_cycle_ratings",
  rating_drop_insights:
    process.env.NEXT_PUBLIC_RATING_DROP_INSIGHTS_COLLECTION_ID || "rating_drop_insights",
  ai_events: process.env.NEXT_PUBLIC_AI_EVENTS_COLLECTION_ID || "ai_events",
  ai_policies: process.env.NEXT_PUBLIC_AI_POLICIES_COLLECTION_ID || "ai_policies",
  checkin_approvals:
    process.env.NEXT_PUBLIC_CHECK_IN_APPROVALS_COLLECTION_ID || "checkin_approvals",
  google_tokens:
    process.env.NEXT_PUBLIC_GOOGLE_TOKENS_COLLECTION_ID || "google_tokens",
  google_meet_requests:
    process.env.NEXT_PUBLIC_GOOGLE_MEET_REQUESTS_COLLECTION_ID || "google_meet_requests",
  meeting_metadata:
    process.env.NEXT_PUBLIC_MEETING_METADATA_COLLECTION_ID || "meeting_metadata",
  meeting_intelligence:
    process.env.NEXT_PUBLIC_MEETING_INTELLIGENCE_COLLECTION_ID || "meeting_intelligence",
  meeting_intelligence_details:
    process.env.NEXT_PUBLIC_MEETING_INTELLIGENCE_DETAILS_COLLECTION_ID || "meeting_intelligence_details",
  notification_templates:
    process.env.NEXT_PUBLIC_NOTIFICATION_TEMPLATES_COLLECTION_ID || "notification_templates",
  notification_jobs:
    process.env.NEXT_PUBLIC_NOTIFICATION_JOBS_COLLECTION_ID || "notification_jobs",
  notifications:
    process.env.NEXT_PUBLIC_NOTIFICATIONS_COLLECTION_ID || "notifications",
  notification_events:
    process.env.NEXT_PUBLIC_NOTIFICATION_EVENTS_COLLECTION_ID || "notification_events",
  calibration_sessions:
    process.env.NEXT_PUBLIC_CALIBRATION_SESSIONS_COLLECTION_ID || "calibration_sessions",
  calibration_decisions:
    process.env.NEXT_PUBLIC_CALIBRATION_DECISIONS_COLLECTION_ID || "calibration_decisions",
  matrix_reviewer_assignments:
    process.env.NEXT_PUBLIC_MATRIX_REVIEWER_ASSIGNMENTS_COLLECTION_ID || "matrix_reviewer_assignments",
  matrix_reviewer_feedback:
    process.env.NEXT_PUBLIC_MATRIX_REVIEWER_FEEDBACK_COLLECTION_ID || "matrix_reviewer_feedback",
  framework_policies:
    process.env.NEXT_PUBLIC_FRAMEWORK_POLICIES_COLLECTION_ID || "framework_policies",
  import_jobs:
    process.env.NEXT_PUBLIC_IMPORT_JOBS_COLLECTION_ID || "import_jobs",
  talent_snapshots:
    process.env.NEXT_PUBLIC_TALENT_SNAPSHOTS_COLLECTION_ID || "talent_snapshots",
  aop_documents:
    process.env.NEXT_PUBLIC_AOP_DOCUMENTS_COLLECTION_ID || "aop_documents",
};

const required = {
  [collections.users]: [
    { key: "name", type: "string", size: 256, required: true },
    { key: "email", type: "string", size: 320, required: true },
    { key: "role", type: "enum", required: true, elements: ["employee", "manager", "hr", "region-admin", "leadership"] },
    { key: "region", type: "string", size: 128, required: false },
    { key: "department", type: "string", size: 128, required: false },
    { key: "managerId", type: "string", size: 64, required: false },
    { key: "managerAssignedAt", type: "datetime", required: false },
    { key: "managerAssignedBy", type: "string", size: 64, required: false },
    { key: "assignmentVersion", type: "integer", required: false, min: 0, max: 999999 },
    { key: "hrId", type: "string", size: 64, required: false },
    { key: "hrAssignedAt", type: "datetime", required: false },
    { key: "hrAssignedBy", type: "string", size: 64, required: false },
    { key: "hrAssignmentVersion", type: "integer", required: false, min: 0, max: 999999 },
  ],
  [collections.goals]: [
    { key: "employeeId", type: "string", size: 64, required: true },
    { key: "managerId", type: "string", size: 64, required: true },
    { key: "parentGoalId", type: "string", size: 64, required: false },
    { key: "goalLevel", type: "enum", required: false, elements: ["business", "manager", "employee"], default: "employee" },
    { key: "contributionPercent", type: "integer", required: false, min: 0, max: 100, default: 100 },
    { key: "cycleId", type: "string", size: 32, required: true },
    { key: "frameworkType", type: "enum", required: true, elements: ["OKR", "MBO", "HYBRID", "BSC", "COMPETENCY"] },
    { key: "title", type: "string", size: 512, required: true },
    { key: "description", type: "string", size: 8192, required: true },
    { key: "weightage", type: "integer", required: true, min: 1, max: 100 },
    { key: "status", type: "enum", required: true, elements: ["draft", "submitted", "approved", "needs_changes", "closed"] },
    { key: "progressPercent", type: "integer", required: true, min: 0, max: 100 },
    { key: "submittedAt", type: "datetime", required: false },
    { key: "dueDate", type: "datetime", required: false },
    { key: "approvalSource", type: "string", size: 32, required: false },
    { key: "autoApprovedAt", type: "datetime", required: false },
    { key: "lineageRef", type: "string", size: 512, required: false },
    { key: "aiSuggested", type: "boolean", required: false, default: false },
    { key: "aopAligned", type: "boolean", required: false, default: false },
    { key: "aopReference", type: "string", size: 512, required: false },
    { key: "managerFinalRating", type: "integer", required: false, min: 1, max: 5 },
    { key: "managerFinalRatingLabel", type: "enum", required: false, elements: ["EE", "DE", "ME", "SME", "NI"] },
    { key: "managerFinalRatedAt", type: "datetime", required: false },
    { key: "managerFinalRatedBy", type: "string", size: 64, required: false },
    { key: "ratingVisibleToEmployee", type: "boolean", required: false, default: false },
    { key: "selfReviewId", type: "string", size: 64, required: false },
    { key: "selfReviewStatus", type: "enum", required: false, elements: ["draft", "submitted"] },
    { key: "selfReviewSubmittedAt", type: "datetime", required: false },
  ],
  [collections.goal_approvals]: [
    { key: "goalId", type: "string", size: 64, required: true },
    { key: "managerId", type: "string", size: 64, required: true },
    { key: "decision", type: "enum", required: true, elements: ["approved", "rejected", "needs_changes"] },
    { key: "comments", type: "string", size: 8192, required: false },
    { key: "decidedAt", type: "datetime", required: true },
  ],
  [collections.goal_self_reviews]: [
    // Unique synthetic key: `${employeeId}|${goalId}|${cycleId}`.
    { key: "reviewKey", type: "string", size: 196, required: true },
    { key: "employeeId", type: "string", size: 64, required: true },
    { key: "goalId", type: "string", size: 64, required: true },
    { key: "cycleId", type: "string", size: 32, required: true },
    { key: "status", type: "enum", required: false, elements: ["draft", "submitted"], default: "draft" },
    { key: "submittedAt", type: "datetime", required: false },
    { key: "selfRatingValue", type: "integer", required: false, min: 1, max: 5 },
    { key: "selfRatingLabel", type: "enum", required: false, elements: ["EE", "DE", "ME", "SME", "NI"] },
    { key: "selfComment", type: "string", size: 8192, required: false },
    { key: "achievements", type: "string", size: 2048, required: false },
    { key: "challenges", type: "string", size: 2048, required: false },
    { key: "evidenceLinks", type: "string", size: 2048, required: false, array: true },
    { key: "achievementsJson", type: "string", size: 2048, required: false },
    { key: "createdAt", type: "datetime", required: true },
    { key: "updatedAt", type: "datetime", required: false },
  ],
  [collections.goal_kpi_library]: [
    { key: "title", type: "string", size: 512, required: true },
    { key: "description", type: "string", size: 8192, required: true },
    { key: "department", type: "string", size: 128, required: true },
    { key: "role", type: "string", size: 128, required: true },
    { key: "domain", type: "string", size: 128, required: false },
    { key: "kpi_metrics", type: "string", size: 65000, required: true },
    { key: "default_weightage", type: "float", required: false },
    { key: "tags", type: "string", size: 128, required: false, array: true },
    {
      key: "source_type",
      type: "enum",
      required: true,
      elements: ["hr", "manager", "leadership", "system"],
    },
    { key: "approved", type: "boolean", required: false, default: false },
    { key: "approved_by", type: "string", size: 64, required: false },
    { key: "created_by", type: "string", size: 64, required: true },
    { key: "created_at", type: "datetime", required: true },
  ],
  [collections.checkins]: [
    { key: "goalId", type: "string", size: 64, required: true },
    { key: "employeeId", type: "string", size: 64, required: true },
    { key: "managerId", type: "string", size: 64, required: true },
    { key: "scheduledAt", type: "datetime", required: true },
    { key: "status", type: "enum", required: true, elements: ["planned", "completed"] },
    { key: "employeeNotes", type: "string", size: 8192, required: false },
    { key: "managerNotes", type: "string", size: 8192, required: false },
    { key: "selfReviewText", type: "string", size: 8192, required: false },
    {
      key: "selfReviewStatus",
      type: "enum",
      required: false,
      elements: ["draft", "submitted", "reopened"],
    },
    { key: "selfReviewSubmittedAt", type: "datetime", required: false },
    { key: "selfReviewSubmittedBy", type: "string", size: 64, required: false },
    { key: "selfReviewReopenedAt", type: "datetime", required: false },
    { key: "selfReviewReopenedBy", type: "string", size: 64, required: false },
    { key: "selfReviewReopenReason", type: "string", size: 2048, required: false },
    { key: "goalSelfReviewId", type: "string", size: 64, required: false },
    { key: "goalSelfReviewStatus", type: "enum", required: false, elements: ["draft", "submitted"] },
    { key: "transcriptText", type: "string", size: 8192, required: false },
    { key: "isFinalCheckIn", type: "boolean", required: false, default: false },
    { key: "managerRating", type: "integer", required: false, min: 1, max: 5 },
    { key: "ratedAt", type: "datetime", required: false },
    { key: "attachmentIds", type: "string", size: 64, required: false, array: true },
  ],
  [collections.progress]: [
    { key: "goalId", type: "string", size: 64, required: true },
    { key: "employeeId", type: "string", size: 64, required: true },
    { key: "percentComplete", type: "integer", required: true, min: 0, max: 100 },
    { key: "ragStatus", type: "enum", required: true, elements: ["on_track", "behind", "completed"] },
    { key: "updateText", type: "string", size: 8192, required: true },
    { key: "attachmentIds", type: "string", size: 64, required: false, array: true },
    { key: "createdAt", type: "datetime", required: false },
  ],
  [collections.goal_cycles]: [
    { key: "name", type: "string", size: 64, required: true },
    { key: "periodType", type: "enum", required: true, elements: ["quarterly", "yearly", "hybrid"] },
    { key: "startDate", type: "datetime", required: true },
    { key: "endDate", type: "datetime", required: true },
    { key: "state", type: "enum", required: true, elements: ["active", "closed"] },
    { key: "autoApprovalEnabled", type: "boolean", required: false, default: false },
    { key: "autoApprovalDays", type: "integer", required: false, min: 1, max: 90 },
    { key: "closedAt", type: "datetime", required: false },
    { key: "closedBy", type: "string", size: 64, required: false },
  ],
  [collections.employee_cycle_scores]: [
    { key: "employeeId", type: "string", size: 64, required: true },
    { key: "managerId", type: "string", size: 64, required: true },
    { key: "cycleId", type: "string", size: 32, required: true },
    { key: "scoreX100", type: "integer", required: true, min: 0, max: 500 },
    { key: "scoreLabel", type: "enum", required: true, elements: ["EE", "DE", "ME", "SME", "NI"] },
    { key: "computedAt", type: "datetime", required: true },
    { key: "visibility", type: "enum", required: true, elements: ["hidden", "visible"] },
  ],
  [collections.manager_cycle_ratings]: [
    { key: "managerId", type: "string", size: 64, required: true },
    { key: "hrId", type: "string", size: 64, required: true },
    { key: "cycleId", type: "string", size: 32, required: true },
    { key: "rating", type: "integer", required: true, min: 1, max: 5 },
    { key: "ratingLabel", type: "enum", required: true, elements: ["EE", "DE", "ME", "SME", "NI"] },
    { key: "comments", type: "string", size: 8192, required: false },
    { key: "ratedAt", type: "datetime", required: true },
  ],
  [collections.rating_drop_insights]: [
    { key: "employeeId", type: "string", size: 64, required: true },
    { key: "managerId", type: "string", size: 64, required: false },
    { key: "cycleId", type: "string", size: 32, required: true },
    { key: "previousRating", type: "integer", required: true, min: 1, max: 5 },
    { key: "currentRating", type: "integer", required: true, min: 1, max: 5 },
    { key: "drop", type: "float", required: true, min: -5, max: 5 },
    { key: "riskLevel", type: "enum", required: true, elements: ["HIGH RISK", "MODERATE"] },
    { key: "createdAt", type: "datetime", required: true },
  ],
  [collections.ai_events]: [
    { key: "userId", type: "string", size: 64, required: true },
    {
      key: "featureType",
      type: "enum",
      required: true,
      elements: [
        "goal_suggestion",
        "checkin_summary",
        "goal_analysis",
        "meeting_intelligence",
        "meeting_qa",
      ],
    },
    { key: "cycleId", type: "string", size: 32, required: true },
    { key: "requestCount", type: "integer", required: true, min: 0, max: 9999 },
    { key: "tokensUsed", type: "integer", required: false, min: 0, max: 1000000000 },
    { key: "estimatedCost", type: "float", required: false, min: 0 },
    { key: "lastUsedAt", type: "datetime", required: true },
    { key: "metadata", type: "string", size: 8192, required: false },
  ],
  [collections.ai_policies]: [
    {
      key: "featureType",
      type: "enum",
      required: true,
      elements: [
        "goal_suggestion",
        "checkin_summary",
        "goal_analysis",
        "meeting_intelligence",
        "meeting_qa",
      ],
    },
    {
      key: "role",
      type: "enum",
      required: true,
      elements: ["employee", "manager", "hr"],
    },
    { key: "limitPerCycle", type: "integer", required: true, min: 0, max: 1000000 },
    { key: "costBudgetPerCycle", type: "float", required: false, min: 0 },
    { key: "warningThreshold", type: "float", required: false, min: 0, max: 1, default: 0.8 },
    { key: "isActive", type: "boolean", required: false, default: true },
  ],
  [collections.checkin_approvals]: [
    { key: "checkInId", type: "string", size: 64, required: true },
    { key: "managerId", type: "string", size: 64, required: true },
    { key: "hrId", type: "string", size: 64, required: true },
    { key: "decision", type: "enum", required: true, elements: ["approved", "rejected", "needs_changes"] },
    { key: "comments", type: "string", size: 8192, required: false },
    { key: "decidedAt", type: "datetime", required: true },
  ],
  [collections.google_tokens]: [
    { key: "userId", type: "string", size: 64, required: true },
    { key: "email", type: "string", size: 320, required: true },
    { key: "accessToken", type: "string", size: 4096, required: true },
    { key: "refreshToken", type: "string", size: 4096, required: false },
    { key: "expiry", type: "datetime", required: true },
    { key: "scope", type: "string", size: 2048, required: false },
    { key: "provider", type: "string", size: 32, required: false },
  ],
  [collections.google_meet_requests]: [
    { key: "employeeId", type: "string", size: 64, required: true },
    { key: "managerId", type: "string", size: 64, required: true },
    {
      key: "status",
      type: "enum",
      required: true,
      elements: ["pending", "scheduled", "rejected", "canceled"],
    },
    {
      key: "source",
      type: "enum",
      required: true,
      elements: ["employee_request", "manager_direct"],
    },
    { key: "requestedAt", type: "datetime", required: true },
    { key: "proposedStartTime", type: "datetime", required: false },
    { key: "proposedEndTime", type: "datetime", required: false },
    { key: "scheduledStartTime", type: "datetime", required: false },
    { key: "scheduledEndTime", type: "datetime", required: false },
    { key: "title", type: "string", size: 512, required: true },
    { key: "description", type: "string", size: 8192, required: false },
    { key: "meetingType", type: "enum", required: false, elements: ["individual", "group"] },
    { key: "meetLink", type: "string", size: 2048, required: false },
    { key: "eventId", type: "string", size: 256, required: false },
    { key: "timezone", type: "string", size: 128, required: true },
    { key: "transcriptText", type: "string", size: 65000, required: false },
    { key: "transcriptSource", type: "string", size: 128, required: false },
    { key: "intelligenceGeneratedAt", type: "datetime", required: false },
  ],
  [collections.meeting_metadata]: [
    { key: "meetingId", type: "string", size: 64, required: true },
    { key: "linkedGoalIds", type: "string", size: 8192, required: false },
  ],
  [collections.meeting_intelligence]: [
    { key: "meetingId", type: "string", size: 64, required: true },
    { key: "employeeId", type: "string", size: 64, required: true },
    { key: "managerId", type: "string", size: 64, required: true },
    { key: "linkedGoalIds", type: "string", size: 8192, required: false },
    { key: "transcriptText", type: "string", size: 65000, required: true },
    { key: "transcriptSource", type: "string", size: 128, required: false },
    { key: "generatedAt", type: "datetime", required: true },
  ],
  [collections.meeting_intelligence_details]: [
    { key: "meetingId", type: "string", size: 64, required: true },
    { key: "summary", type: "string", size: 8192, required: false },
    { key: "generatedAt", type: "datetime", required: true },
  ],
  [collections.framework_policies]: [
    { key: "name", type: "string", size: 128, required: true },
    { key: "enabledFrameworks", type: "string", size: 32, required: true, array: true },
    { key: "isDefault", type: "boolean", required: false, default: true },
    { key: "updatedBy", type: "string", size: 64, required: false },
    { key: "updatedAt", type: "datetime", required: false },
  ],
  [collections.notification_templates]: [
    { key: "name", type: "string", size: 128, required: true },
    {
      key: "triggerType",
      type: "enum",
      required: true,
      elements: [
        "goal_added",
        "checkin_submitted",
        "goal_pending_approval",
        "goal_approved",
        "meeting_scheduled",
        "self_review_window_opened",
        "self_review_deadline_reminder",
        "self_review_submitted",
        "self_review_submitted_manager",
        "deadline_near",
        "checkin_overdue",
        "review_pending",
        "cycle_deadline",
        "manual",
      ],
    },
    { key: "channel", type: "enum", required: true, elements: ["in_app", "email"] },
    { key: "subject", type: "string", size: 512, required: false },
    { key: "body", type: "string", size: 8192, required: true },
    { key: "isEnabled", type: "boolean", required: false, default: true },
    { key: "suppressWindowMinutes", type: "integer", required: false, min: 0, max: 10080 },
    { key: "createdBy", type: "string", size: 64, required: false },
    { key: "updatedBy", type: "string", size: 64, required: false },
    { key: "updatedAt", type: "datetime", required: false },
  ],
  [collections.notification_jobs]: [
    { key: "userId", type: "string", size: 64, required: true },
    { key: "templateId", type: "string", size: 64, required: false },
    {
      key: "triggerType",
      type: "enum",
      required: true,
      elements: [
        "goal_added",
        "checkin_submitted",
        "goal_pending_approval",
        "goal_approved",
        "meeting_scheduled",
        "self_review_window_opened",
        "self_review_deadline_reminder",
        "self_review_submitted",
        "self_review_submitted_manager",
        "deadline_near",
        "checkin_overdue",
        "review_pending",
        "cycle_deadline",
        "manual",
      ],
    },
    { key: "channel", type: "enum", required: true, elements: ["in_app", "email"] },
    {
      key: "status",
      type: "enum",
      required: true,
      elements: ["pending", "processing", "retry", "sent", "failed", "suppressed", "canceled"],
    },
    { key: "scheduledAt", type: "datetime", required: true },
    { key: "attemptCount", type: "integer", required: true, min: 0, max: 20 },
    { key: "maxAttempts", type: "integer", required: true, min: 1, max: 20 },
    { key: "dedupeKey", type: "string", size: 256, required: false },
    { key: "payload", type: "string", size: 8192, required: false },
    { key: "lastError", type: "string", size: 4096, required: false },
    { key: "nextRetryAt", type: "datetime", required: false },
    { key: "lockedAt", type: "datetime", required: false },
    { key: "processedAt", type: "datetime", required: false },
  ],
  [collections.notifications]: [
    { key: "userId", type: "string", size: 64, required: true },
    { key: "type", type: "string", size: 64, required: true },
    { key: "triggerType", type: "string", size: 64, required: false },
    { key: "channel", type: "string", size: 16, required: false },
    { key: "deliveryStatus", type: "string", size: 32, required: false },
    { key: "title", type: "string", size: 512, required: true },
    { key: "message", type: "string", size: 8192, required: true },
    { key: "actionUrl", type: "string", size: 2048, required: false },
    { key: "isRead", type: "boolean", required: false, default: false },
    { key: "readAt", type: "datetime", required: false },
    { key: "createdAt", type: "datetime", required: true },
    { key: "dedupeKey", type: "string", size: 256, required: false },
  ],

  [collections.notification_events]: [
    { key: "userId", type: "string", size: 64, required: true },
    { key: "jobId", type: "string", size: 64, required: false },
    { key: "templateId", type: "string", size: 64, required: false },
    {
      key: "triggerType",
      type: "enum",
      required: true,
      elements: [
        "goal_added",
        "checkin_submitted",
        "goal_pending_approval",
        "goal_approved",
        "meeting_scheduled",
        "self_review_window_opened",
        "self_review_deadline_reminder",
        "self_review_submitted",
        "self_review_submitted_manager",
        "deadline_near",
        "checkin_overdue",
        "review_pending",
        "cycle_deadline",
        "manual",
      ],
    },
    { key: "channel", type: "enum", required: true, elements: ["in_app", "email"] },
    { key: "deliveryStatus", type: "enum", required: true, elements: ["delivered", "failed", "suppressed"] },
    { key: "title", type: "string", size: 512, required: true },
    { key: "message", type: "string", size: 8192, required: true },
    { key: "actionUrl", type: "string", size: 2048, required: false },
    { key: "isRead", type: "boolean", required: false, default: false },
    { key: "readAt", type: "datetime", required: false },
    { key: "createdAt", type: "datetime", required: true },
  ],
  [collections.calibration_sessions]: [
    { key: "name", type: "string", size: 256, required: true },
    { key: "cycleId", type: "string", size: 32, required: true },
    {
      key: "status",
      type: "enum",
      required: true,
      elements: ["draft", "active", "closed"],
    },
    { key: "scope", type: "string", size: 128, required: false },
    { key: "notes", type: "string", size: 8192, required: false },
    { key: "version", type: "integer", required: true, min: 1, max: 9999 },
    { key: "createdBy", type: "string", size: 64, required: true },
    { key: "updatedBy", type: "string", size: 64, required: false },
    { key: "createdAt", type: "datetime", required: true },
    { key: "updatedAt", type: "datetime", required: false },
  ],
  [collections.calibration_decisions]: [
    { key: "sessionId", type: "string", size: 64, required: true },
    { key: "employeeId", type: "string", size: 64, required: true },
    { key: "managerId", type: "string", size: 64, required: false },
    { key: "previousRating", type: "integer", required: false, min: 1, max: 5 },
    { key: "proposedRating", type: "integer", required: true, min: 1, max: 5 },
    { key: "finalRating", type: "integer", required: false, min: 1, max: 5 },
    { key: "rationale", type: "string", size: 8192, required: true },
    { key: "changed", type: "boolean", required: false, default: false },
    { key: "version", type: "integer", required: true, min: 1, max: 9999 },
    { key: "decidedBy", type: "string", size: 64, required: true },
    { key: "decidedAt", type: "datetime", required: true },
  ],
  [collections.matrix_reviewer_assignments]: [
    { key: "employeeId", type: "string", size: 64, required: true },
    { key: "primaryManagerId", type: "string", size: 64, required: true },
    { key: "reviewerId", type: "string", size: 64, required: true },
    { key: "goalId", type: "string", size: 64, required: false },
    { key: "cycleId", type: "string", size: 32, required: true },
    { key: "influenceWeight", type: "integer", required: true, min: 1, max: 100 },
    { key: "status", type: "enum", required: true, elements: ["active", "inactive"] },
    { key: "assignedBy", type: "string", size: 64, required: true },
    { key: "assignedAt", type: "datetime", required: true },
    { key: "notes", type: "string", size: 8192, required: false },
  ],
  [collections.matrix_reviewer_feedback]: [
    { key: "assignmentId", type: "string", size: 64, required: true },
    { key: "employeeId", type: "string", size: 64, required: true },
    { key: "reviewerId", type: "string", size: 64, required: true },
    { key: "goalId", type: "string", size: 64, required: false },
    { key: "cycleId", type: "string", size: 32, required: true },
    { key: "feedbackText", type: "string", size: 8192, required: true },
    { key: "suggestedRating", type: "integer", required: false, min: 1, max: 5 },
    { key: "confidence", type: "enum", required: false, elements: ["low", "medium", "high"] },
    { key: "createdAt", type: "datetime", required: true },
  ],
  [collections.import_jobs]: [
    { key: "createdBy", type: "string", size: 64, required: true },
    { key: "idempotencyKey", type: "string", size: 128, required: true },
    { key: "status", type: "enum", required: true, elements: ["previewed", "committed", "failed"] },
    { key: "templateVersion", type: "string", size: 32, required: false },
    { key: "totalRows", type: "integer", required: true, min: 0, max: 10000 },
    { key: "validRows", type: "integer", required: true, min: 0, max: 10000 },
    { key: "successRows", type: "integer", required: true, min: 0, max: 10000 },
    { key: "failedRows", type: "integer", required: true, min: 0, max: 10000 },
    { key: "reportJson", type: "string", size: 65000, required: true },
    { key: "createdAt", type: "datetime", required: true },
    { key: "committedAt", type: "datetime", required: false },
  ],
  [collections.talent_snapshots]: [
    { key: "employeeId", type: "string", size: 64, required: true },
    { key: "managerId", type: "string", size: 64, required: false },
    { key: "cycleId", type: "string", size: 32, required: true },
    { key: "scoreX100", type: "integer", required: true, min: 0, max: 500 },
    { key: "scoreLabel", type: "enum", required: true, elements: ["EE", "DE", "ME", "SME", "NI"] },
    { key: "trendLabel", type: "enum", required: true, elements: ["new", "stable", "improving", "declining"] },
    { key: "trendDeltaPercent", type: "integer", required: true, min: -1000, max: 1000 },
    { key: "performanceBand", type: "enum", required: true, elements: ["high", "medium", "low"] },
    { key: "potentialBand", type: "enum", required: true, elements: ["high", "medium", "low"] },
    { key: "readinessBand", type: "enum", required: true, elements: ["ready_now", "ready_1_2_years", "emerging"] },
    { key: "computedAt", type: "datetime", required: true },
    { key: "source", type: "string", size: 64, required: false },
  ],
  [collections.aop_documents]: [
    { key: "organizationId", type: "string", size: 128, required: true },
    { key: "year", type: "string", size: 4, required: true },
    { key: "content", type: "string", size: 65000, required: true },
    { key: "createdBy", type: "string", size: 64, required: true },
    { key: "createdAt", type: "datetime", required: true },
    { key: "updatedAt", type: "datetime", required: true },
  ],
};

const requiredIndexes = {
  [collections.goal_self_reviews]: [
    { key: "idx_gsr_key_u", type: "unique", attributes: ["reviewKey"] },
    { key: "idx_gsr_emp", type: "key", attributes: ["employeeId"] },
    { key: "idx_gsr_goal", type: "key", attributes: ["goalId"] },
    { key: "idx_gsr_cycle", type: "key", attributes: ["cycleId"] },
    { key: "idx_gsr_status", type: "key", attributes: ["status"] },
    { key: "idx_gsr_goal_cycle", type: "key", attributes: ["goalId", "cycleId"] },
  ],
  [collections.goal_kpi_library]: [
    { key: "idx_goal_kpi_library_department", type: "key", attributes: ["department"] },
    { key: "idx_goal_kpi_library_role", type: "key", attributes: ["role"] },
    { key: "idx_goal_kpi_library_source_type", type: "key", attributes: ["source_type"] },
    { key: "idx_goal_kpi_library_approved", type: "key", attributes: ["approved"] },
  ],
  [collections.rating_drop_insights]: [
    { key: "idx_rdi_employee_cycle_u", type: "unique", attributes: ["employeeId", "cycleId"] },
    { key: "idx_rdi_manager_cycle", type: "key", attributes: ["managerId", "cycleId"] },
    { key: "idx_rdi_cycle_risk", type: "key", attributes: ["cycleId", "riskLevel"] },
    { key: "idx_rdi_cycle_created", type: "key", attributes: ["cycleId", "createdAt"] },
    { key: "idx_rdi_created", type: "key", attributes: ["createdAt"] },
  ],
};

function assertEnv() {
  const missing = [];
  if (!endpoint) missing.push("NEXT_PUBLIC_APPWRITE_ENDPOINT");
  if (!projectId) missing.push("NEXT_PUBLIC_APPWRITE_PROJECT_ID");
  if (!databaseId) missing.push("NEXT_PUBLIC_DATABASE_ID");
  if (!apiKey) missing.push("APPWRITE_API_KEY");

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

function isNotFound(err) {
  const message = String(err?.message || "").toLowerCase();
  return message.includes("could not be found") || message.includes("not found");
}

function isAlreadyExists(err) {
  const message = String(err?.message || "").toLowerCase();
  return (
    message.includes("already exists") ||
    message.includes("attribute with the requested key")
  );
}

async function ensureCollection(databases, collectionId) {
  try {
    await databases.getCollection(databaseId, collectionId);
    return { exists: true, created: false };
  } catch (err) {
    if (!isNotFound(err)) throw err;
    if (mode !== "apply") return { exists: false, created: false };

    await databases.createCollection(databaseId, collectionId, collectionId, [], false, true);
    return { exists: true, created: true };
  }
}

async function createAttribute(databases, collectionId, attr) {
  const key = attr.key;

  if (attr.type === "string") {
    await databases.createStringAttribute(
      databaseId,
      collectionId,
      key,
      attr.size,
      Boolean(attr.required),
      attr.default ?? null,
      Boolean(attr.array)
    );
    return;
  }

  if (attr.type === "integer") {
    await databases.createIntegerAttribute(
      databaseId,
      collectionId,
      key,
      Boolean(attr.required),
      attr.min ?? null,
      attr.max ?? null,
      attr.default ?? null,
      Boolean(attr.array)
    );
    return;
  }

  if (attr.type === "float") {
    await databases.createFloatAttribute(
      databaseId,
      collectionId,
      key,
      Boolean(attr.required),
      attr.min ?? null,
      attr.max ?? null,
      attr.default ?? null,
      Boolean(attr.array)
    );
    return;
  }

  if (attr.type === "boolean") {
    await databases.createBooleanAttribute(
      databaseId,
      collectionId,
      key,
      Boolean(attr.required),
      attr.default ?? null,
      Boolean(attr.array)
    );
    return;
  }

  if (attr.type === "datetime") {
    await databases.createDatetimeAttribute(
      databaseId,
      collectionId,
      key,
      Boolean(attr.required),
      attr.default ?? null,
      Boolean(attr.array)
    );
    return;
  }

  if (attr.type === "enum") {
    await databases.createEnumAttribute(
      databaseId,
      collectionId,
      key,
      attr.elements,
      Boolean(attr.required),
      attr.default ?? null,
      Boolean(attr.array)
    );
    return;
  }

  throw new Error(`Unsupported attribute type: ${attr.type}`);
}

async function createIndex(databases, collectionId, index) {
  const attempts = 5;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await databases.createIndex(
        databaseId,
        collectionId,
        index.key,
        index.type,
        index.attributes,
        index.orders ?? null
      );
      return;
    } catch (err) {
      const message = String(err?.message || "").toLowerCase();
      const retryable =
        message.includes("server error") ||
        message.includes("still processing") ||
        message.includes("attribute") ||
        message.includes("not ready");

      if (!retryable || i === attempts - 1) {
        throw err;
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

async function main() {
  assertEnv();

  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  const databases = new Databases(client);

  const summary = [];

  for (const [collectionId, attrs] of Object.entries(required)) {
    const row = {
      collectionId,
      createdCollection: false,
      missing: [],
      created: [],
      missingIndexes: [],
      createdIndexes: [],
      failed: [],
    };

    const collectionState = await ensureCollection(databases, collectionId);
    row.createdCollection = collectionState.created;

    if (!collectionState.exists) {
      row.missing = attrs.map((attr) => attr.key);
      summary.push(row);
      continue;
    }

    let existingAttributes = [];
    try {
      const list = await databases.listAttributes(databaseId, collectionId);
      existingAttributes = (list.attributes || []).map((a) => a.key);
    } catch (err) {
      row.failed.push(`listAttributes failed: ${String(err?.message || err)}`);
      summary.push(row);
      continue;
    }

    for (const attr of attrs) {
      if (existingAttributes.includes(attr.key)) continue;
      row.missing.push(attr.key);

      if (mode !== "apply") continue;

      try {
        await createAttribute(databases, collectionId, attr);
        row.created.push(attr.key);
      } catch (err) {
        if (!isAlreadyExists(err)) {
          row.failed.push(`${attr.key}: ${String(err?.message || err)}`);
        }
      }
    }

    const indexes = requiredIndexes[collectionId] || [];
    if (indexes.length > 0) {
      let existingIndexes = [];
      try {
        const list = await databases.listIndexes(databaseId, collectionId);
        existingIndexes = (list.indexes || []).map((index) => index.key);
      } catch (err) {
        row.failed.push(`listIndexes failed: ${String(err?.message || err)}`);
        summary.push(row);
        continue;
      }

      for (const index of indexes) {
        if (existingIndexes.includes(index.key)) continue;
        row.missingIndexes.push(index.key);

        if (mode !== "apply") continue;

        try {
          await createIndex(databases, collectionId, index);
          row.createdIndexes.push(index.key);
        } catch (err) {
          row.failed.push(`${index.key}: ${String(err?.message || err)}`);
        }
      }
    }

    summary.push(row);
  }

  console.log(`\nAppwrite schema ${mode} summary:`);
  for (const row of summary) {
    console.log(`\n- ${row.collectionId}`);
    if (row.createdCollection) {
      console.log("  created collection");
    }
    console.log(`  missing attrs: ${row.missing.length ? row.missing.join(", ") : "none"}`);
    if (row.created.length) {
      console.log(`  created attrs: ${row.created.join(", ")}`);
    }
    console.log(
      `  missing indexes: ${row.missingIndexes.length ? row.missingIndexes.join(", ") : "none"}`
    );
    if (row.createdIndexes.length) {
      console.log(`  created indexes: ${row.createdIndexes.join(", ")}`);
    }
    if (row.failed.length) {
      console.log("  failures:");
      for (const failure of row.failed) {
        console.log(`    - ${failure}`);
      }
    }
  }

  const failures = summary.reduce((acc, row) => acc + row.failed.length, 0);
  if (failures > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Schema sync failed:", err.message || err);
  process.exit(1);
});

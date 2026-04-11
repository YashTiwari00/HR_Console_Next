import { Client, Account, Databases, Storage } from "appwrite";

const client = new Client();

client
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID);


export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);
export const CONTRIBUTION_BADGE_ENABLED = process.env.NEXT_PUBLIC_ENABLE_CONTRIBUTION_BADGE === 'true';
export const checkInsCollectionId =
  process.env.NEXT_PUBLIC_CHECK_INS_COLLECTION_ID || "check_ins";
export const cyclesCollectionId =
  process.env.NEXT_PUBLIC_GOAL_CYCLES_COLLECTION_ID || "goal_cycles";
export const milestoneEventsCollectionId =
  process.env.NEXT_PUBLIC_MILESTONE_EVENTS_COLLECTION_ID || "milestone_events";
export const GAMIFICATION_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_GAMIFICATION === "true";
export const GROWTH_HUB_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_GROWTH_HUB === 'true';

export const appwriteConfig = {
  endpoint: process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT,
  projectId: process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID,
  databaseId: process.env.NEXT_PUBLIC_DATABASE_ID,
  usersCollectionId: process.env.NEXT_PUBLIC_USERS_COLLECTION_ID || "users",
  goalsCollectionId: process.env.NEXT_PUBLIC_GOALS_COLLECTION_ID || "goals",
  goalApprovalsCollectionId:
    process.env.NEXT_PUBLIC_GOAL_APPROVALS_COLLECTION_ID || "goal_approvals",
  goalSelfReviewsCollectionId:
    process.env.NEXT_PUBLIC_GOAL_SELF_REVIEWS_COLLECTION_ID || "goal_self_reviews",
  checkInApprovalsCollectionId:
    process.env.NEXT_PUBLIC_CHECK_IN_APPROVALS_COLLECTION_ID ||
    "checkin_approvals",
  checkInsCollectionId,
  progressUpdatesCollectionId:
    process.env.NEXT_PUBLIC_PROGRESS_UPDATES_COLLECTION_ID ||
    "progress_updates",
  goalCyclesCollectionId: cyclesCollectionId,
  employeeCycleScoresCollectionId:
    process.env.NEXT_PUBLIC_EMPLOYEE_CYCLE_SCORES_COLLECTION_ID ||
    "employee_cycle_scores",
  managerCycleRatingsCollectionId:
    process.env.NEXT_PUBLIC_MANAGER_CYCLE_RATINGS_COLLECTION_ID ||
    "manager_cycle_ratings",
  ratingDropInsightsCollectionId:
    process.env.NEXT_PUBLIC_RATING_DROP_INSIGHTS_COLLECTION_ID ||
    "rating_drop_insights",
  ratingDropAnalysisCollectionId:
    process.env.NEXT_PUBLIC_RATING_DROP_ANALYSIS_COLLECTION_ID ||
    "rating_drop_analysis",
  aiEventsCollectionId:
    process.env.NEXT_PUBLIC_AI_EVENTS_COLLECTION_ID || "ai_events",
  milestoneEventsCollectionId,
  aiPoliciesCollectionId:
    process.env.NEXT_PUBLIC_AI_POLICIES_COLLECTION_ID || "ai_policies",
  googleTokensCollectionId:
    process.env.NEXT_PUBLIC_GOOGLE_TOKENS_COLLECTION_ID || "google_tokens",
  googleMeetRequestsCollectionId:
    process.env.NEXT_PUBLIC_GOOGLE_MEET_REQUESTS_COLLECTION_ID ||
    "google_meet_requests",
  meetingMetadataCollectionId:
    process.env.NEXT_PUBLIC_MEETING_METADATA_COLLECTION_ID ||
    "meeting_metadata",
  meetingIntelligenceCollectionId:
    process.env.NEXT_PUBLIC_MEETING_INTELLIGENCE_COLLECTION_ID ||
    "meeting_intelligence",
  meetingIntelligenceDetailsCollectionId:
    process.env.NEXT_PUBLIC_MEETING_INTELLIGENCE_DETAILS_COLLECTION_ID ||
    "meeting_intelligence_details",
  notificationTemplatesCollectionId:
    process.env.NEXT_PUBLIC_NOTIFICATION_TEMPLATES_COLLECTION_ID ||
    "notification_templates",
  notificationJobsCollectionId:
    process.env.NEXT_PUBLIC_NOTIFICATION_JOBS_COLLECTION_ID ||
    "notification_jobs",
  notificationsCollectionId:
    process.env.NEXT_PUBLIC_NOTIFICATIONS_COLLECTION_ID ||
    "notifications",
  notificationEventsCollectionId:
    process.env.NEXT_PUBLIC_NOTIFICATION_EVENTS_COLLECTION_ID ||
    "notification_events",
  calibrationSessionsCollectionId:
    process.env.NEXT_PUBLIC_CALIBRATION_SESSIONS_COLLECTION_ID ||
    "calibration_sessions",
  calibrationDecisionsCollectionId:
    process.env.NEXT_PUBLIC_CALIBRATION_DECISIONS_COLLECTION_ID ||
    "calibration_decisions",
  matrixReviewerAssignmentsCollectionId:
    process.env.NEXT_PUBLIC_MATRIX_REVIEWER_ASSIGNMENTS_COLLECTION_ID ||
    "matrix_reviewer_assignments",
  matrixReviewerFeedbackCollectionId:
    process.env.NEXT_PUBLIC_MATRIX_REVIEWER_FEEDBACK_COLLECTION_ID ||
    "matrix_reviewer_feedback",
  frameworkPoliciesCollectionId:
    process.env.NEXT_PUBLIC_FRAMEWORK_POLICIES_COLLECTION_ID ||
    "framework_policies",
  goalKpiLibraryCollectionId:
    process.env.NEXT_PUBLIC_GOAL_KPI_LIBRARY_COLLECTION_ID ||
    "goal_kpi_library",
  importJobsCollectionId:
    process.env.NEXT_PUBLIC_IMPORT_JOBS_COLLECTION_ID ||
    "import_jobs",
  talentSnapshotsCollectionId:
    process.env.NEXT_PUBLIC_TALENT_SNAPSHOTS_COLLECTION_ID ||
    "talent_snapshots",
  successionOverridesCollectionId:
    process.env.NEXT_PUBLIC_SUCCESSION_OVERRIDES_COLLECTION_ID ||
    "succession_overrides",
  aopDocumentsCollectionId:
    process.env.NEXT_PUBLIC_AOP_DOCUMENTS_COLLECTION_ID || "aop_documents",
  managerAssignmentsCollectionId:
    process.env.NEXT_PUBLIC_MANAGER_ASSIGNMENTS_COLLECTION_ID || "manager_assignments",
  goalRatingsCollectionId:
    process.env.NEXT_PUBLIC_GOAL_RATINGS_COLLECTION_ID || "goal_ratings",
  attachmentsBucketId:
    process.env.NEXT_PUBLIC_ATTACHMENTS_BUCKET_ID || "pms_attachments",
};

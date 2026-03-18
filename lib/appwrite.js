import { Client, Account, Databases, Storage } from "appwrite";

const client = new Client();

client
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID);


export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);

export const appwriteConfig = {
  endpoint: process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT,
  projectId: process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID,
  databaseId: process.env.NEXT_PUBLIC_DATABASE_ID,
  usersCollectionId: process.env.NEXT_PUBLIC_USERS_COLLECTION_ID || "users",
  goalsCollectionId: process.env.NEXT_PUBLIC_GOALS_COLLECTION_ID || "goals",
  goalApprovalsCollectionId:
    process.env.NEXT_PUBLIC_GOAL_APPROVALS_COLLECTION_ID || "goal_approvals",
  checkInApprovalsCollectionId:
    process.env.NEXT_PUBLIC_CHECK_IN_APPROVALS_COLLECTION_ID ||
    "checkin_approvals",
  checkInsCollectionId:
    process.env.NEXT_PUBLIC_CHECK_INS_COLLECTION_ID || "check_ins",
  progressUpdatesCollectionId:
    process.env.NEXT_PUBLIC_PROGRESS_UPDATES_COLLECTION_ID ||
    "progress_updates",
  goalCyclesCollectionId:
    process.env.NEXT_PUBLIC_GOAL_CYCLES_COLLECTION_ID || "goal_cycles",
  employeeCycleScoresCollectionId:
    process.env.NEXT_PUBLIC_EMPLOYEE_CYCLE_SCORES_COLLECTION_ID ||
    "employee_cycle_scores",
  managerCycleRatingsCollectionId:
    process.env.NEXT_PUBLIC_MANAGER_CYCLE_RATINGS_COLLECTION_ID ||
    "manager_cycle_ratings",
  aiEventsCollectionId:
    process.env.NEXT_PUBLIC_AI_EVENTS_COLLECTION_ID || "ai_events",
  attachmentsBucketId:
    process.env.NEXT_PUBLIC_ATTACHMENTS_BUCKET_ID || "pms_attachments",
};

## Phase 1: Appwrite Backend Setup (Employee MVP)

This guide is the backend checklist you need to complete in Appwrite Console before Phase 2 APIs.

### 1. Database and Collections

Create or verify one Appwrite database (for example: pms_main).

Create these collections with the exact IDs below (recommended):
- users
- goals
- goal_approvals
- checkin_approvals
- check_ins
- progress_updates
- goal_cycles
- ai_events

### 2. Collection Attributes

#### users
- name (string, required)
- email (string, required)
- role (string, required) values: employee, manager, hr
- department (string, required)
- managerId (string, optional)
- domain (string, optional)
- businessUnit (string, optional)
- designation (string, optional)
- managerAssignedAt (datetime, optional)
- managerAssignedBy (string, optional)
- assignmentVersion (integer, optional)

#### goals
- employeeId (string, required)
- managerId (string, required)
- cycleId (string, required)
- frameworkType (string, required) values: OKR, MBO, HYBRID
- title (string, required)
- description (string, required)
- weightage (integer, required) min 1 max 100
- status (string, required) values: draft, submitted, approved, needs_changes, closed
- progressPercent (integer, required) min 0 max 100
- dueDate (datetime, optional)
- lineageRef (string, optional)
- aiSuggested (boolean, required, default false)

#### goal_approvals
- goalId (string, required)
- managerId (string, required)
- decision (string, required) values: approved, rejected, needs_changes
- comments (string, optional)
- decidedAt (datetime, required)

#### checkin_approvals
- checkInId (string, required)
- managerId (string, required)
- hrId (string, required)
- decision (string, required) values: approved, rejected, needs_changes
- comments (string, optional)
- decidedAt (datetime, required)

#### check_ins
- goalId (string, required)
- employeeId (string, required)
- managerId (string, required)
- scheduledAt (datetime, required)
- status (string, required) values: planned, completed
- employeeNotes (string, optional)
- managerNotes (string, optional)
- transcriptText (string, optional)
- isFinalCheckIn (boolean, required, default false)
- managerRating (integer, optional) min 1 max 5
- ratedAt (datetime, optional)

#### progress_updates
- goalId (string, required)
- employeeId (string, required)
- percentComplete (integer, required) min 0 max 100
- ragStatus (string, required) values: on_track, behind, completed
- updateText (string, required)
- attachmentIds (string[], optional)
- createdAt (datetime, required)

#### goal_cycles
- name (string, required) example: Q2-2026
- periodType (string, required) values: quarterly, yearly, hybrid
- startDate (datetime, required)
- endDate (datetime, required)
- state (string, required) values: active, closed

#### ai_events
- userId (string, required)
- featureType (string, required) values: goal_suggestion, checkin_summary
- cycleId (string, required)
- requestCount (integer, required)
- lastUsedAt (datetime, required)
- metadata (string, optional)

### 3. Required Indexes

Create indexes for query performance:
- goals: (employeeId, cycleId, status)
- goals: (managerId, status)
- goal_approvals: (managerId, decision)
- check_ins: (employeeId, scheduledAt)
- progress_updates: (goalId, createdAt)

### 4. Storage Bucket

Create bucket ID: pms_attachments
- Allowed file types: image/png, image/jpeg, application/pdf, message/rfc822
- Max file size: 10 MB
- Enable antivirus and encryption (recommended)

### 5. Permissions Strategy (MVP)

Use document-level permissions with role checks from backend APIs.

- Employee:
  - Read/write own goals, check-ins, progress updates
  - Read own approvals
- Manager:
  - Read direct-report goals/check-ins/progress
  - Write approval decisions
- HR:
  - Broad read access for governance

Note: Keep write access restricted through server-side endpoints wherever possible.

### 6. Seed Data You Should Add

- One active cycle in goal_cycles (for example Q2-2026)
- At least one manager and one employee user profile
- users.managerId mapping for direct-report relationship

### 7. Environment Variables in Project

Copy .env.example to .env.local and fill:
- NEXT_PUBLIC_APPWRITE_ENDPOINT
- NEXT_PUBLIC_APPWRITE_PROJECT_ID
- NEXT_PUBLIC_DATABASE_ID
- NEXT_PUBLIC_USERS_COLLECTION_ID
- NEXT_PUBLIC_GOALS_COLLECTION_ID
- NEXT_PUBLIC_GOAL_APPROVALS_COLLECTION_ID
- NEXT_PUBLIC_CHECK_INS_COLLECTION_ID
- NEXT_PUBLIC_PROGRESS_UPDATES_COLLECTION_ID
- NEXT_PUBLIC_GOAL_CYCLES_COLLECTION_ID
- NEXT_PUBLIC_AI_EVENTS_COLLECTION_ID
- NEXT_PUBLIC_ATTACHMENTS_BUCKET_ID
- APPWRITE_API_KEY (server-side only)

### 8. Backend Work (What You Need To Do Next)

After Appwrite console setup is done:
1. Build Next.js server APIs for goals, approvals, check-ins, progress.
2. Enforce auth and ownership checks in every endpoint.
3. Add request validation (status enums, weightage sum, date checks).
4. Record audit fields (createdBy, updatedBy, timestamps).
5. Add AI usage limiter with ai_events per cycle.

### 9. Done Criteria for Phase 1

Phase 1 is complete when:
- All collections and attributes exist.
- Indexes are created.
- Bucket is configured.
- Seed cycle and manager-employee mapping are available.
- .env.local is set and app can read all IDs.

### 10. Local Medium Seed (Append-Only)

Use this to populate realistic dummy data for feature verification.

1. Ensure schema is ready:
  - `npm run schema:audit`
  - `npm run schema:apply` (if audit reports missing schema)
2. Print required Auth users and create them in Appwrite Authentication (manual):
  - `npm run seed:users`
3. Run medium seed dataset (append-only):
  - `npm run seed:medium`
4. Run seed coverage report:
  - `npm run seed:verify`

What it seeds:
- 1 HR profile, 4 manager profiles, 20 employee profiles (mapped to existing Auth user IDs)
- 2 goal cycles (one closed, one active)
- Goals across statuses: draft, submitted, approved, needs_changes, closed
- Goal approvals for decided goals
- Planned and completed check-ins (including final check-ins with manager ratings)
- HR check-in approvals
- Progress updates across ragStatus values (on_track, behind, completed)
- AI usage events for goal suggestion and check-in summary caps

Safety model:
- Script is append-only and idempotent by query checks.
- Existing records are not deleted.
- If required Auth users are missing, script fails with a list of missing emails.

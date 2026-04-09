# HR Console - Complete Project Logic Guide

## 1. What this project is

HR Console is a role-based Performance Management System (PMS) built with Next.js App Router and Appwrite.

It supports four core personas:
- Employee: create goals, submit progress updates, run check-ins, track timeline.
- Manager: do own PMS activity plus review and approve team goals/check-ins.
- HR: govern assignments, monitor quality/cadence, close cycles, enforce policy.
- Leadership: consume aggregate-only strategic insights for risk, readiness, and execution quality.

Legacy `region-admin` users are normalized to leadership and routed to leadership surfaces.

The system is intentionally built around one lifecycle:
1. Goal creation and approval.
2. Progress updates and check-ins.
3. Final manager ratings.
4. HR governance and cycle close.
5. Visibility of final ratings to employees after closure.

Source intent and product requirements are captured in [Guide.md](../Guide.md).

---

## 2. Tech stack and runtime architecture

### 2.1 Frontend stack
- Next.js 16 App Router
- React 19
- TypeScript on major app pages/components
- Role layouts under `app/employee`, `app/manager`, `app/hr`, `app/leadership`

### 2.2 Backend stack inside same app
- Next.js Route Handlers under `app/api/*`
- Server-side Appwrite SDK (`node-appwrite`) for secure DB/storage operations
- Browser Appwrite SDK (`appwrite`) for client auth/JWT convenience

### 2.3 AI stack
- OpenRouter wrapper in `lib/openrouter.js`
- AI endpoints under `app/api/ai/*`
- Usage caps tracked in `ai_events` via `app/api/ai/_lib/aiUsage.js`

### 2.4 Security model
- Cookie + optional JWT auth bridge
- Request auth context from `lib/serverAuth.js`
- Role checks via `lib/auth/roles.js` and `requireRole`
- Route access gate at middleware layer in `middleware.ts`

### 2.5 Design system
- Primitive UI components: `src/components/ui/*`
- Layout primitives: `src/components/layout/*`
- Pattern components: `src/components/patterns/*`
- Theme provider + CSS tokens: `src/theme/ThemeProvider.tsx`, `styles/tokens.css`
- UX rules guidance: [UI-RULES.md](../UI-RULES.md)

---

## 3. High-level request flow

### 3.1 Browser to page
1. User opens route.
2. Middleware checks whether route is protected and whether a session cookie exists.
3. Middleware calls `/api/auth/redirect` to verify role and canonical destination.
4. Request either proceeds or redirects to login/onboarding/correct role home.

### 3.2 Page to API
1. Role page calls helper from `app/employee/_lib/pmsClient.ts`.
2. `requestJson()` adds JSON headers and tries to include `x-appwrite-jwt`.
3. API route authenticates session/JWT using `requireAuth()`.
4. Route validates role and business rules.
5. Route reads/writes Appwrite database/storage.
6. Route returns JSON.
7. UI updates state and re-renders.

---

## 4. Repository map and purpose

### 4.1 App shell and entry pages
- `app/layout.tsx`: global HTML shell, early theme-init script, ThemeProvider wrapper.
- `app/page.tsx`: landing page with design-heavy hero and CTA to login/onboarding.
- `app/login/page.jsx`: Google OAuth sign-in.
- `app/auth/callback/page.jsx`: callback finalization and redirect.
- `app/onboarding/page.jsx`: first-time role assignment.
- `app/signup/page.jsx`: onboarding entry alias.

### 4.2 Role areas
- Employee: `app/employee/*`
- Manager: `app/manager/*`
- HR: `app/hr/*`
- Leadership: `app/leadership/*`

Each area has:
- `layout.tsx`: sidebar nav, user context, logout, ChatBot mount.
- `page.tsx`: dashboard summary.
- workflow pages: goals/progress/check-ins/timeline (role-appropriate variants).

Additional role-specific modules:
- Employee: `meeting-calendar`, `meetings` (Google Calendar-based meeting request and schedule visibility).
- Manager: `team-goals`, `team-progress`, `team-check-ins`, `team-approvals`, `team-analytics`, `employee-dashboard`, `meeting-calendar`, `meetings`, `google-token-setup`.
- HR: `approvals`, `check-ins`, `team-assignments`, `team-analytics`, `managers/[managerId]` drilldown.
- Leadership: aggregate command center for trend, risk, and succession snapshots.
- Legacy region-admin routes are preserved only as redirects to leadership pages.

### 4.3 API area
All server endpoints are in `app/api/*` and grouped by concern:
- auth/session
- me
- goals and approvals
- goal library governance and search
- progress updates
- check-ins and HR check-in approvals
- self-review lifecycle and reopen controls
- team and manager assignments
- HR governance and cycle close
- analytics insights
- decision intelligence and rating-drop analysis
- leadership governance overview
- attachments
- AI features
- Google OAuth token management
- calendar/freebusy/events retrieval
- meet request lifecycle, intelligence, and transcript retrieval
- notifications orchestration and read state
- timeline and lifecycle aggregation

### 4.4 Shared libraries
- `lib/appwrite.js`: client SDK instances + collection config.
- `lib/appwriteServer.js`: server SDK clients and exported helpers (`ID`, `Query`, `InputFile`, `databaseId`).
- `lib/serverAuth.js`: auth context and role enforcement.
- `lib/teamAccess.js`: manager/HR scope checks and assignment helpers.
- `lib/cycle.js`: cycle id and check-in code utilities.
- `lib/ratings.js`: rating parse and score calculations.
- `lib/finalRatings.js`: score persistence and rating visibility toggles.
- `lib/openrouter.js`: OpenRouter call/stream wrapper.
- `lib/appwriteSchema.js`: constants for statuses, frameworks, collections.

### 4.5 Services
- `services/authService.js`: client auth orchestration (OAuth start, callback finalize, role redirect, logout).

### 4.6 Scripts
- `scripts/appwrite-schema-sync.mjs`: audit/apply Appwrite attributes and collections.
- `scripts/seed-appwrite-dummy-data.mjs`: seed medium dataset for testing.
- `scripts/verify-seed-data.mjs`: seed verification.
- `scripts/test-employee-trajectory.mjs`: focused auth + trend checks for trajectory endpoint.
- `scripts/smoke-api-routes.mjs`: API smoke checks with seeded users.
- `scripts/smoke-ui-pages.mjs`: route reachability smoke checks.

---

## 5. Authentication, session, and role-routing logic

### 5.1 Login and callback
1. Login page calls `loginWithGoogle()`.
2. Appwrite OAuth redirect comes back to `/auth/callback` with `userId` and `secret`.
3. Callback page calls `finalizeOAuthCallbackSession(userId, secret)`.
4. `/api/auth/session` creates server-side Appwrite session and sets cookies:
   - `appwrite_session`
   - `a_session_<projectId>`
5. User context is fetched, then redirect path is resolved by `/api/auth/redirect`.

### 5.2 Middleware guard
`middleware.ts` protects role routes and auth pages.

Key behavior:
- No session cookie on protected routes -> redirect to `/login`.
- Valid session but role mismatch -> redirect to proper role path.
- Auth page visited while already authenticated -> auto-redirect to current role route (except onboarding edge case).

### 5.3 Role normalization
`lib/auth/roles.js` enforces allowed roles:
- `employee`
- `manager`
- `hr`
- `leadership`

Anything else becomes null and routes to `/onboarding`.

### 5.4 Server auth context
`lib/serverAuth.js` does:
- session/JWT extraction
- account lookup
- profile lookup from users collection
- helper guard functions:
  - `requireSessionAuth`
  - `requireProfileAuth` (aliased as `requireAuth`)
  - `requireRole`

---

## 6. Data model and entity semantics

## 6.1 users
Purpose: identity + organizational mapping.

Important fields:
- `$id`, `name`, `email`, `role`, `department`
- employee manager mapping: `managerId`, `managerAssignedAt`, `managerAssignedBy`, `assignmentVersion`
- manager hierarchy mapping: manager profiles also use `managerId` to point at an upper manager/leadership node
- legacy HR mapping fields (`hrId`, `hrAssignedAt`, `hrAssignedBy`, `hrAssignmentVersion`) may still exist for historical compatibility

## 6.2 goals
Purpose: primary performance objectives.

Important fields:
- ownership: `employeeId`, `managerId`
- planning: `cycleId`, `frameworkType`, `title`, `description`, `weightage`, `dueDate`, `lineageRef`
- workflow: `status` in `{draft, submitted, approved, needs_changes, closed}`
- progress/rating: `progressPercent`, `managerFinalRating`, `managerFinalRatingLabel`, `managerFinalRatedAt`, `managerFinalRatedBy`
- visibility switch: `ratingVisibleToEmployee`
- generation marker: `aiSuggested`

## 6.3 goal_approvals
Purpose: immutable-ish approval history for goal decisions.

Fields:
- `goalId`, `managerId`, `decision`, `comments`, `decidedAt`

## 6.4 check_ins
Purpose: scheduled and completed manager-employee discussions.

Fields:
- identity: `goalId`, `employeeId`, `managerId`
- schedule/workflow: `scheduledAt`, `status` in `{planned, completed}`
- notes: `employeeNotes`, `managerNotes`, `transcriptText`
- final marker/rating: `isFinalCheckIn`, `managerRating`, `ratedAt`
- evidence: `attachmentIds[]`

## 6.5 checkin_approvals
Purpose: HR review decisions on completed check-ins.

Fields:
- `checkInId`, `managerId`, `hrId`, `decision`, `comments`, `decidedAt`

## 6.6 progress_updates
Purpose: periodic progress entries for goals.

Fields:
- `goalId`, `employeeId`, `percentComplete`, `ragStatus`, `updateText`, `createdAt`, `attachmentIds[]`

## 6.7 goal_cycles
Purpose: cycle metadata and state.

Fields:
- `name` (often Qx-YYYY), `periodType`, `startDate`, `endDate`, `state`, optional closure fields.

## 6.8 employee_cycle_scores
Purpose: computed weighted cycle score per employee-manager pair.

Fields:
- `employeeId`, `managerId`, `cycleId`, `scoreX100`, `scoreLabel`, `computedAt`, `visibility`

## 6.9 manager_cycle_ratings
Purpose: HR rating of managers per cycle.

Fields:
- `managerId`, `hrId`, `cycleId`, `rating`, `ratingLabel`, `comments`, `ratedAt`

## 6.10 ai_events
Purpose: usage caps and tracking for AI features.

Fields:
- `userId`, `featureType`, `cycleId`, `requestCount`, `lastUsedAt`, optional metadata.

## 6.11 google_tokens
Purpose: per-user Google OAuth token store for calendar/meeting integrations.

Fields:
- `userId`, `email`, `accessToken`, `refreshToken`, `expiry`, `scope`, `provider`

## 6.12 google_meet_requests
Purpose: employee meeting requests and manager scheduling decisions backed by Google Meet events.

Fields:
- ownership: `employeeId`, `managerId`
- workflow: `status` in `{pending, scheduled, rejected}`, `source`, `requestedAt`
- schedule: `proposedStartTime`, `proposedEndTime`, `scheduledStartTime`, `scheduledEndTime`, `timezone`
- context: `title`, `description`, `managerNotes`
- external links: `meetLink`, `eventId`

## 6.13 goal_self_reviews
Purpose: one employee self-review per goal per cycle, with draft/submit lifecycle and manager visibility.

Fields:
- linkage: `reviewKey`, `employeeId`, `goalId`, `cycleId`
- content: `selfRatingValue`, `selfRatingLabel`, `selfComment`, `achievements`, `challenges`, `evidenceLinks[]`
- structured content: `achievementsJson`, `challengesJson`
- workflow: `status` in `{draft, submitted}`, `submittedAt`, `createdAt`, `updatedAt`

Compatibility linkage:
- goals may carry `selfReviewId`, `selfReviewStatus`, `selfReviewSubmittedAt`
- final check-ins may carry `goalSelfReviewId`, `goalSelfReviewStatus`

## 6.14 platform support collections (selected)
Purpose: policy, intelligence, notifications, and governance capabilities.

Examples:
- `ai_policies`, `framework_policies`, `goal_kpi_library`
- `rating_drop_insights`, `rating_drop_analysis`, `talent_snapshots`
- `meeting_metadata`, `meeting_intelligence`, `meeting_intelligence_details`
- `notification_templates`, `notification_jobs`, `notifications`, `notification_events`
- `calibration_sessions`, `calibration_decisions`, `import_jobs`, `aop_documents`

---

## 7. API catalog with behavior and rules

## 7.1 Authentication and profile APIs

### GET /api/auth/redirect
- File: `app/api/auth/redirect/route.js`
- Auth: session required; 401 path returns login redirect payload.
- Output: `{ data: { redirectTo, role, reason } }`
- Main logic: maps role to canonical app area.

### POST /api/auth/session
- File: `app/api/auth/session/route.js`
- Input: `{ userId, secret }`
- Validates callback credentials and userId format.
- Creates Appwrite session via admin account and stores secure cookies.

### POST /api/auth/logout
- File: `app/api/auth/logout/route.js`
- Revokes current session when available and always clears local cookies.

### POST /api/auth/onboarding
- File: `app/api/auth/onboarding/route.js`
- Purpose: writes or updates profile role after login for first-time users.
- Input: `{ role, region? }`
- Rules:
  - role must normalize into allowed roles.
  - role defaults to employee if invalid/missing.
  - if profile already has a valid role, route prevents accidental overwrites.

### GET /api/me
- File: `app/api/me/route.js`
- Returns user and profile context used by layouts/pages.

## 7.2 Goals APIs

### GET /api/goals
- File: `app/api/goals/route.js`
- Roles: employee, manager, leadership, hr.
- Scope behavior:
  - employee: own goals only.
  - manager: own/team/all with team-boundary checks.
  - hr: all goals.
- Optional filters: cycleId, status, employeeId.
- Visibility behavior: hides final ratings in specific contexts.

### POST /api/goals
- File: `app/api/goals/route.js`
- Roles: employee, manager, leadership.
- Input: title, description, cycleId, frameworkType, managerId?, weightage, dueDate?, lineageRef?, aiSuggested?.
- Rules:
  - required fields validation
  - framework must be one of OKR/MBO/HYBRID
  - weightage 1..100
  - total cycle weightage per employee must not exceed 100
  - cycleId normalized server-side
- Manager approver resolution for manager/leadership role:
  1. profile.managerId (immediate upper manager)
  2. fail if missing (must assign upper manager first)
- Schema compatibility write flow:
  - try dual write with `progressPercent` + `processPercent`
  - fallback to modern-only or legacy-only depending on schema errors

### POST /api/goals/for-employee
- File: `app/api/goals/for-employee/route.js`
- Roles: manager.
- Purpose: manager creates a draft goal on behalf of a team member.
- Rules:
  - manager must have access to employee by team mapping checks.
  - same framework and cycle weightage validations as employee flow.
  - status is created as draft with manager as approver.

### GET /api/goals/[goalId]
- File: `app/api/goals/[goalId]/route.js`
- Role-aware access check for single goal.

### PUT /api/goals/[goalId]
- File: `app/api/goals/[goalId]/route.js`
- Roles: employee, manager, but ownership enforced to goal owner profile id.
- Editable only when status is `draft` or `needs_changes`.
- Revalidates framework and weightage/cycle constraints.

### POST /api/goals/[goalId]/submit
- File: `app/api/goals/[goalId]/submit/route.js`
- Transitions draft/needs_changes -> submitted.
- Owner-only enforcement.

### GET /api/goals/feedback
- File: `app/api/goals/feedback/route.js`
- Returns latest goal approval entries filtered by role/scope/employee.

## 7.3 Approval API

### GET /api/approvals
- File: `app/api/approvals/route.js`
- Roles: manager, leadership, hr.
- Returns submitted goals pending decisions.
- HR is monitor-only in approvals flow.

### POST /api/approvals
- File: `app/api/approvals/route.js`
- Roles: manager, leadership.
- Input: goalId, decision, comments.
- Rules:
  - decision must be approved/rejected/needs_changes
  - goal must be submitted
  - manager cannot approve own goals
  - manager must be assigned approver for the goal
- Side effects:
  - updates goal status
  - writes goal_approvals decision row

## 7.4 Progress APIs

### GET /api/progress-updates
- File: `app/api/progress-updates/route.js`
- Scope-based listing for employee/manager/hr.

### POST /api/progress-updates
- File: `app/api/progress-updates/route.js`
- Input: goalId, percentComplete, ragStatus, updateText, attachmentIds?.
- Rules: value bounds and access checks.

## 7.5 Check-in APIs

### GET /api/check-ins
- File: `app/api/check-ins/route.js`
- Scope behavior for employee/manager/leadership/hr.
- Enrichment:
  - checkInCode generated from cycle/id suffix
  - latest HR review merged
  - manager cycle rating merged
- Visibility behavior:
  - hides manager rating when not visible to employee
  - hides manager self-rating records in manager self contexts
- Compatibility-safe reads for missing collections (`checkin_approvals`, `manager_cycle_ratings`).

### POST /api/check-ins
- File: `app/api/check-ins/route.js`
- Roles: employee, manager, leadership.
- Input: goalId, scheduledAt, optional status/notes/transcript/final flag/attachments.
- Rules:
  - goal must be approved
  - employeeId must match goal owner
  - strict owner/manager access checks
  - max 5 check-ins per goal
- Compatibility write fallback when `attachmentIds` schema is missing.

### PATCH /api/check-ins/[checkInId]
- File: `app/api/check-ins/[checkInId]/route.js`
- Roles: manager, leadership (with manager-focused final rating constraints).
- Intended transition: planned -> completed.
- Final check-in rules:
  - only manager can submit final rating
  - final rating required in [1..5]
- Side effects when final check-in + manager:
  - updates goal final rating fields
  - computes/persists employee cycle score
  - sets visibility based on cycle state
- Compatibility checks for missing goal/check-in attributes.

## 7.6 Team structure APIs

### GET/POST /api/team-assignments
- File: `app/api/team-assignments/route.js`
- Leadership-only.
- Lists or creates employee->manager assignments.
- Tracks assignment timestamps/versions where schema allows.

### PUT/DELETE /api/team-assignments/[employeeId]
- File: `app/api/team-assignments/[employeeId]/route.js`
- Leadership-only.
- Update or clear manager mapping.

### GET/POST /api/manager-assignments
- File: `app/api/manager-assignments/route.js`
- Leadership-only.
- Lists managers with parent-manager assignment status and metadata.
- Assign manager -> parent manager.

### PUT/DELETE /api/manager-assignments/[managerId]
- File: `app/api/manager-assignments/[managerId]/route.js`
- Leadership-only.
- Update/clear manager->parent-manager mapping.

### GET /api/team-members
- File: `app/api/team-members/route.js`
- Manager and HR views into team members with role filters.

## 7.7 HR governance APIs

### GET /api/hr/managers
- File: `app/api/hr/managers/route.js`
- HR-only manager summary dashboard data.
- Computes team size, team goals, average progress, pending approvals, cadence counts.
- May include cycle history from ratings/scores collections.

### GET /api/hr/managers/[managerId]
- File: `app/api/hr/managers/[managerId]/route.js`
- HR-only deep drilldown for one manager.
- Returns manager, summary, employee drilldowns, and related records.

### GET/POST /api/hr/checkin-approvals
- File: `app/api/hr/checkin-approvals/route.js`
- HR-only.
- Lists review queue and submits decision for a check-in.

### POST /api/hr/cycles/[cycleId]/close
- File: `app/api/hr/cycles/[cycleId]/close/route.js`
- HR-only cycle closure operation.
- Steps:
  1. collect approved/closed goals in cycle
  2. compute employee cycle scores for employee-manager pairs
  3. set ratings visibility to true across goals and cycle-score rows
  4. upsert/update cycle state to closed where possible
- Response: `{ cycleId, closed: true, employeesUpdated }`

### PATCH /api/hr/roles/[userId]
- File: `app/api/hr/roles/[userId]/route.js`
- HR-only role reassignment endpoint.

## 7.8 Attachment APIs

### POST /api/attachments
- File: `app/api/attachments/route.js`
- Upload endpoint with MIME and size checks.
- Returns file metadata and storage ids.

### GET /api/attachments/[fileId]/download
- File: `app/api/attachments/[fileId]/download/route.js`
- Authenticated binary download.

## 7.9 AI APIs

### POST /api/ai/chat
- File: `app/api/ai/chat/route.js`
- Streaming chat endpoint with role-sensitive context fetching and prompt shaping.

### POST /api/ai/goal-suggestion
- File: `app/api/ai/goal-suggestion/route.js`
- Generates goal suggestions with usage cap checks.

### POST /api/ai/checkin-summary
- File: `app/api/ai/checkin-summary/route.js`
- Generates check-in summary artifacts with usage cap checks.

### AI usage helper
- File: `app/api/ai/_lib/aiUsage.js`
- Enforces per-user-per-cycle cap for feature families.

## 7.10 Google OAuth token and calendar APIs

### GET /api/google/connect
- File: `app/api/google/connect/route.js`
- Auth: any authenticated user.
- Purpose: starts Google OAuth flow for calendar scopes and redirects to Google consent screen.
- Dependencies: `GOOGLE_CLIENT_ID`, callback URL resolution via env or request origin.

### GET /api/google/callback
- File: `app/api/google/callback/route.js`
- Purpose: exchanges OAuth code for access/refresh token and persists tokens in google tokens collection.
- Rules:
  - requires authenticated app session.
  - rejects if no refresh token exists after exchange (with reconnect guidance).
  - redirects user to role home route after save.

### POST /api/google/tokens
- File: `app/api/google/tokens/route.js`
- Purpose: upsert Google token data for current authenticated user.

### GET /api/google/tokens/status
- File: `app/api/google/tokens/status/route.js`
- Purpose: returns token connection/expiry status.
- Scope:
  - self-check for all roles.
  - manager/hr can check `targetUserId` with manager team-access enforcement.

### POST /api/google/tokens/admin-upsert
- File: `app/api/google/tokens/admin-upsert/route.js`
- Roles: manager, hr.
- Purpose: privileged token upsert for target user (manager scope still team-bound).

### GET /api/calendar/events
- File: `app/api/calendar/events/route.js`
- Roles: employee, manager, hr.
- Input: `startDate`, `endDate`, optional `employeeId`, `timeZone`, `maxResults`.
- Rules:
  - valid ISO range required.
  - employee can only read self events.
  - manager can read self or own team member events.

### POST /api/calendar/freebusy
- File: `app/api/calendar/freebusy/route.js`
- Roles: employee, manager, hr.
- Purpose: reads free/busy windows for scheduling support.
- Rules:
  - valid ISO range required.
  - manager free/busy checks are team-access constrained.

### POST /api/calendar/create-meeting
- File: `app/api/calendar/create-meeting/route.js`
- Roles: manager.
- Purpose: directly schedules Google Meet event with employee and manager attendees and logs internal meeting request document.
- Output: created calendar event metadata + internal meet request document.

## 7.11 Meeting request APIs

### GET /api/meet-requests
- File: `app/api/meet-requests/route.js`
- Roles: employee, manager.
- Purpose: lists meeting requests.
- Scope:
  - employee: requests where employeeId=self.
  - manager: requests where managerId=self, optional employee filter with access validation.

### POST /api/meet-requests
- File: `app/api/meet-requests/route.js`
- Roles: employee.
- Purpose: employee creates a pending meeting request to assigned manager.
- Rules:
  - manager assignment required.
  - Google token must be connected for employee.
  - persists pending request with proposed schedule fields.

### PATCH /api/meet-requests/[requestId]
- File: `app/api/meet-requests/[requestId]/route.js`
- Roles: manager.
- Actions:
  - `reject`: closes request as rejected with optional manager notes.
  - `schedule`: creates Google Meet event and updates request as scheduled.
- Rules: manager can only act on own assigned requests.

## 7.12 Leadership hierarchy notes

### Leadership migration notes
- Legacy route family `app/region-admin/*` is retained only as redirect shims to leadership routes.
- Canonical strategic scope is now leadership via `/leadership` and leadership APIs.
- Region is no longer a required onboarding gate for leadership access.

  ## 7.13 Analytics API

  ### GET /api/analytics/employee-trajectory
  - File: `app/api/analytics/employee-trajectory/route.js`
  - Roles: employee, manager, hr.
  - Purpose: returns last 3 cycle score points and deterministic trend label for an employee.
  - Scope:
    - employee: self only
    - manager: self or direct reports only
    - hr: any employee
  - Output shape:
    - `employeeId`
    - `cycles[]` with `cycleId`, `cycleName`, `closedAt`, `computedAt`, `scoreX100`, `scoreLabel`
    - `trendLabel` in `{new, stable, improving, declining}`
    - `trendDeltaPercent`
  - Rules:
    - read-only aggregation; no score mutation
    - empty or malformed history returns safe default (`cycles: []`, `trendLabel: new`, `trendDeltaPercent: 0`)
    - stable threshold currently uses absolute delta percent <= 3

  ### GET /api/analytics/decision-insights
  - File: `app/api/analytics/decision-insights/route.js`
  - Roles: manager, hr, leadership.
  - Purpose: aggregated decision-intelligence metrics for approvals, check-ins, and execution quality signals.

  ### GET /api/analytics/rating-drops
  - File: `app/api/analytics/rating-drops/route.js`
  - Roles: manager, hr, leadership.
  - Purpose: identifies and summarizes rating-drop patterns and potential execution risks.

## 7.14 Self-review APIs

### GET /api/self-review
- File: `app/api/self-review/route.js`
- Roles: employee.
- Purpose: returns goals + self-review rows for a cycle and editable state.

### POST /api/self-review/save
- File: `app/api/self-review/save/route.js`
- Roles: employee.
- Purpose: saves/updates per-goal self-review draft content with validation.
- Rules:
  - requires `cycleId` and `goalId`
  - at least one meaningful field must be present
  - submitted reviews are locked from editing

### POST /api/self-review/submit
- File: `app/api/self-review/submit/route.js`
- Roles: employee.
- Purpose: bulk-submits cycle self-review drafts when all required fields are present.
- Side effects:
  - marks eligible drafts as submitted
  - updates goal/check-in linkage fields where schema supports them
  - triggers manager and employee notifications

## 7.15 Goal library, lineage, and import APIs

### Goal library APIs
- `/api/goal-library/search`
- `/api/goal-library/pending`
- `/api/goal-library/manager-create`
- `/api/goal-library/leadership-create`
- `/api/goal-library/hr-create`
- `/api/goal-library/approve`

### Goal lineage and tree APIs
- `/api/goals/lineage`
- `/api/goals/[goalId]/lineage`
- `/api/goals/[goalId]/tree`
- `/api/goals/cascade`
- `/api/goals/[goalId]/cascade`
- `/api/goals/[goalId]/children`

### Goal import APIs
- `/api/goals/import/template`
- `/api/goals/import/preview`
- `/api/goals/import/commit`

## 7.16 Check-in operational extensions

### Check-in import APIs
- `/api/check-ins/import/template`
- `/api/check-ins/import/preview`
- `/api/check-ins/import/commit`

### Manager check-in approvals
- `/api/check-ins/manager-approvals`

### Check-in self-review linkage APIs
- `/api/check-ins/[checkInId]/self-review`
- `/api/hr/check-ins/[checkInId]/self-review/reopen`

## 7.17 Additional governance and integration APIs

### HR cycle automation and AOP
- `/api/hr/cycles/[cycleId]/auto-approval`
- `/api/hr/aop`

### Meeting intelligence and artifacts
- `/api/meet-requests/[requestId]/chat`
- `/api/meet-requests/[requestId]/download`
- `/api/meet-requests/[requestId]/intelligence`
- `/api/google/meet/transcript-webhook`

### Notifications read-state utility
- `/api/notifications/read-all`

### Legacy leadership alias API
- `/api/region-admin/overview`

---

## 8. Frontend role modules and their logic

## 8.1 Employee module

### Dashboard (`app/employee/page.tsx`)
- Loads goals and check-ins in parallel.
- Computes approved goals and average progress locally.
- Renders KPI cards and quick links.
- Optionally renders a trajectory card (last 3 cycles + trend badge) when feature flag is enabled.

### Goals workspace (`app/employee/goals/page.tsx`)
- Fetches goals and latest feedback.
- Auto-resolves managerId from profile via `/api/me`.
- Supports AI goal draft generation and acceptance.
- Creates draft goal -> refreshes list and metrics.
- Supports edit for draft/needs_changes and submit for approval.
- Displays manager feedback snippets per goal.

### Progress workspace (`app/employee/progress/page.tsx`)
- Lists existing progress updates and creates new updates by goal.
- Handles RAG status and attachments.

### Check-ins workspace (`app/employee/check-ins/page.tsx`)
- Lists check-ins with review and rating context.
- Creates planned check-ins and evidence attachments.

### Meetings workspace (`app/employee/meetings/page.tsx`)
- Submits meeting requests to manager with proposed schedule.
- Tracks pending/scheduled/rejected states.

### Meeting calendar (`app/employee/meeting-calendar/page.tsx`)
- Shows employee calendar context and meeting availability data from Google APIs.

### Timeline (`app/employee/timeline/page.tsx`)
- Lifecycle visualization with status narrative and ordering.

### Matrix feedback (`app/employee/matrix-feedback/page.tsx`)
- Displays matrix-reviewer feedback summaries and supporting comments.

## 8.2 Manager module

### Dashboard (`app/manager/page.tsx`)
- Loads own and team goals/check-ins/progress simultaneously.
- Separates self metrics and team metrics for managerial context.

### Goals and approvals
- Own goals area plus team approval surfaces.
- Approval queue in `app/manager/approvals/page.tsx` calls `/api/approvals`.

### Team progress/check-ins
- Dedicated views for cross-team monitoring and action.

### Matrix reviews (`app/manager/matrix-reviews/page.tsx`)
- Manages reviewer assignments, feedback requests, and blended summary visibility.

### Meetings and calendar
- `app/manager/meetings/page.tsx`: handles employee requests and manager direct scheduling.
- `app/manager/meeting-calendar/page.tsx`: calendar/event/freebusy operational view.
- `app/manager/google-token-setup/page.tsx`: token onboarding and connection state troubleshooting.

### Manager timeline/progress/check-ins
- Mirrors employee workflow for manager's own goals.

## 8.3 HR module

### HR dashboard (`app/hr/page.tsx`)
- Manager-level summary table and KPI aggregation.
- Includes role reassignment action using `/api/hr/roles/[userId]`.

- HR is monitor/audit only for goals and check-ins (no approval or grading writes).

### Team assignments (`app/hr/team-assignments/page.tsx`)
- Legacy entry redirected to `/hr`.
- Manager hierarchy assignments are now leadership-managed via manager assignment APIs.

### HR approvals (`app/hr/approvals/page.tsx`)
- Runs check-in governance and closure operations.

### HR check-ins (`app/hr/check-ins/page.tsx`)
- Cadence and compliance monitoring.

### HR strategic pages
- `app/hr/9-box/page.tsx`: talent distribution and performance/potential banding.
- `app/hr/ai-governance/page.tsx`: AI adoption, usage, and policy monitoring.
- `app/hr/calibration/page.tsx`: calibration session workflows and decision capture.
- `app/hr/notifications/page.tsx`: notification policy/job/feed management.
- `app/hr/settings/page.tsx`: HR operational settings and controls.
- `app/hr/team-analytics/page.tsx`: manager/team-level KPI analytics view.

### Manager drilldown (`app/hr/managers/[managerId]/page.tsx`)
- Deep view for one manager's team and cycle health.

## 8.4 Leadership module (canonical)

### Leadership dashboards (`app/leadership/*`)
- Leadership command center is the canonical strategic surface.
- Includes aggregate trend, risk, quality bands, and succession readiness views.
- Legacy regional admin paths now redirect into leadership and should not be extended with new feature work.

---

## 9. Deep walkthrough: Create Goal (UI click to DB write to render)

This is the complete path for employee goal creation.

### 9.1 Initial form setup
- `goalForm` default includes cycle id from `getCycleIdFromDate()`.
- Page attempts to auto-fill managerId from `/api/me` profile context.

### 9.2 User action
- User clicks Create Draft Goal button.
- `handleCreateGoal()` intercepts submit event.

### 9.3 Client call
- `createGoal()` in `pmsClient.ts` sends POST `/api/goals`.
- `requestJson()` adds JSON header and best-effort JWT header.

### 9.4 Server auth and role check
- `/api/goals` POST runs `requireAuth`.
- `requireRole(profile, [employee, manager])` enforces authorization.

### 9.5 Server validation
- trims/sanitizes body fields
- normalizes cycle id with `normalizeCycleId`
- resolves manager approver id with fallback strategy
- validates required fields and framework type
- validates weightage range and cycle total <= 100

### 9.6 Persisting document
- route builds base goal payload with draft status.
- tries createDocument with dual compatibility fields.
- retries with modern-only or legacy-only shape if schema mismatch appears.

### 9.7 Response and UI refresh
- API returns 201 with created goal document.
- UI:
  - clears title and description
  - clears AI suggestion state
  - shows success message
  - reloads goals and feedback
- Result: new draft goal appears in My Goals list and snapshot metrics update.

---

## 10. Business rules implemented across modules

## 10.1 Goal rules
- Only draft/needs_changes are editable/submittable.
- Approval decisions only allowed while submitted.
- Manager cannot approve their own goals.
- Weightage per goal 1..100 and cycle total capped at 100.

## 10.2 Check-in rules
- Check-ins can be created only after goal approval.
- Max 5 check-ins per goal.
- Final check-in requires manager rating 1..5 and manager role.

## 10.3 Visibility rules
- Final ratings hidden from employee until cycle closure.
- Rating visibility toggled globally per cycle using close endpoint.

## 10.4 Scope and access rules
- Manager access constrained by team mappings (with fallback from historical goal links).
- HR has broad governance scope with assignment ownership checks.

## 10.5 AI usage rules
- goal suggestion cap per cycle/user
- check-in summary cap per cycle/user
- tracked in ai_events with counters

---

## 11. Shared utility logic details

## 11.1 Team access helper (`lib/teamAccess.js`)
- Resolves manager team by users.managerId.
- Fallback reads goals.managerId for legacy data continuity.
- Offers assert helpers used by manager-scoped APIs.

## 11.2 Rating utilities (`lib/ratings.js`)
- Parses labels and numeric ratings.
- Converts weighted numeric score to label tier.
- Supports normalized cycle score calculations in x100 scale.

## 11.3 Final rating service (`lib/finalRatings.js`)
- Computes and persists employee cycle score.
- Reads cycle state to decide hidden/visible score records.
- Flips visibility for goals and cycle score rows during closure.

## 11.4 Cycle utility (`lib/cycle.js`)
- Computes Qx-YYYY from date.
- Normalizes cycle identifiers.
- Builds readable check-in code suffixes.

---

## 12. UI system and design logic

### 12.1 Theme lifecycle
- Root script in `app/layout.tsx` applies theme before hydration.
- `ThemeProvider` stores preference in local storage and tracks system changes.
- Effective theme is mirrored on document root class and dataset.

### 12.2 Token system
- `styles/tokens.css` defines color, spacing, radius, shadow, and semantic variants.
- Dark mode overrides preserve same semantic token names.

### 12.3 Composition model
- Pages are built with:
  - layout primitives (`Stack`, `Grid`, `SidebarLayout`, `Container`)
  - patterns (`PageHeader`, `DataTable`, `FormSection`)
  - primitives (`Button`, `Card`, `Badge`, `Alert`, etc.)

### 12.4 ChatBot
- Mounted globally in role layouts and landing page.
- Sends role/user context to `/api/ai/chat`.
- Uses streaming output for incremental assistant responses.

---

## 13. Scripts and DevOps workflow logic

## 13.1 Schema sync
Commands:
- `npm run schema:audit`
- `npm run schema:apply`

Logic:
- audits required collections/attributes
- optionally creates missing collections and attributes
- reports failures and missing items

## 13.2 Seed data
Commands:
- `npm run seed:medium`
- `npm run seed:medium:autoauth`
- `npm run seed:users`
- `npm run seed:verify`

Logic:
- creates deterministic HR, managers, employees
- sets assignment links and versions
- seeds cycles/goals/check-ins/progress/approvals for realistic tests

## 13.3 Smoke tests
Commands:
- `npm run test:trajectory`
- `npm run test:rating-drop`
- `npm run smoke:api`
- `npm run smoke:self-review`
- `npm run smoke:ai:bulk-goals`
- `npm run smoke:ui`

Logic:
- trajectory script validates auth matrix and trend classification edge cases
- rating-drop script validates analysis and message-generation behavior
- creates sessions for seeded users
- verifies happy paths and blocked paths
- checks route reachability and permission boundaries
- self-review smoke validates save/submit/reopen flows and compatibility writes
- UI smoke accepts `/hr/team-assignments` as either direct `200` or redirect `307` based on current route behavior

---

## 14. Environment variables and configuration

### 14.1 Core Appwrite config
- NEXT_PUBLIC_APPWRITE_ENDPOINT
- NEXT_PUBLIC_APPWRITE_PROJECT_ID
- APPWRITE_API_KEY
- NEXT_PUBLIC_DATABASE_ID

### 14.2 Collection/bucket ids (overrideable)
- NEXT_PUBLIC_USERS_COLLECTION_ID
- NEXT_PUBLIC_GOALS_COLLECTION_ID
- NEXT_PUBLIC_GOAL_APPROVALS_COLLECTION_ID
- NEXT_PUBLIC_CHECK_IN_APPROVALS_COLLECTION_ID
- NEXT_PUBLIC_CHECK_INS_COLLECTION_ID
- NEXT_PUBLIC_PROGRESS_UPDATES_COLLECTION_ID
- NEXT_PUBLIC_GOAL_CYCLES_COLLECTION_ID
- NEXT_PUBLIC_EMPLOYEE_CYCLE_SCORES_COLLECTION_ID
- NEXT_PUBLIC_MANAGER_CYCLE_RATINGS_COLLECTION_ID
- NEXT_PUBLIC_AI_EVENTS_COLLECTION_ID
- NEXT_PUBLIC_GOAL_SELF_REVIEWS_COLLECTION_ID
- NEXT_PUBLIC_AI_POLICIES_COLLECTION_ID
- NEXT_PUBLIC_RATING_DROP_INSIGHTS_COLLECTION_ID
- NEXT_PUBLIC_RATING_DROP_ANALYSIS_COLLECTION_ID
- NEXT_PUBLIC_GOOGLE_TOKENS_COLLECTION_ID
- NEXT_PUBLIC_GOOGLE_MEET_REQUESTS_COLLECTION_ID
- NEXT_PUBLIC_MEETING_METADATA_COLLECTION_ID
- NEXT_PUBLIC_MEETING_INTELLIGENCE_COLLECTION_ID
- NEXT_PUBLIC_MEETING_INTELLIGENCE_DETAILS_COLLECTION_ID
- NEXT_PUBLIC_NOTIFICATION_TEMPLATES_COLLECTION_ID
- NEXT_PUBLIC_NOTIFICATION_JOBS_COLLECTION_ID
- NEXT_PUBLIC_NOTIFICATIONS_COLLECTION_ID
- NEXT_PUBLIC_NOTIFICATION_EVENTS_COLLECTION_ID
- NEXT_PUBLIC_CALIBRATION_SESSIONS_COLLECTION_ID
- NEXT_PUBLIC_CALIBRATION_DECISIONS_COLLECTION_ID
- NEXT_PUBLIC_MATRIX_REVIEWER_ASSIGNMENTS_COLLECTION_ID
- NEXT_PUBLIC_MATRIX_REVIEWER_FEEDBACK_COLLECTION_ID
- NEXT_PUBLIC_FRAMEWORK_POLICIES_COLLECTION_ID
- NEXT_PUBLIC_GOAL_KPI_LIBRARY_COLLECTION_ID
- NEXT_PUBLIC_IMPORT_JOBS_COLLECTION_ID
- NEXT_PUBLIC_TALENT_SNAPSHOTS_COLLECTION_ID
- NEXT_PUBLIC_AOP_DOCUMENTS_COLLECTION_ID
- NEXT_PUBLIC_ATTACHMENTS_BUCKET_ID

### 14.3 OAuth/public client options
- NEXT_PUBLIC_OAUTH_SUCCESS_URL
- NEXT_PUBLIC_OAUTH_FAILURE_URL
- NEXT_PUBLIC_OAUTH_SCOPES

### 14.4 Feature flags
- NEXT_PUBLIC_ENABLE_EMPLOYEE_TRAJECTORY

### 14.5 AI settings
- OPENROUTER_API_KEY

### 14.6 Google integration settings
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- GOOGLE_OAUTH_REDIRECT_URI (optional explicit callback)
- NEXT_PUBLIC_APP_ORIGIN or APP_ORIGIN (for callback URI resolution fallback)

### 14.7 Script/runtime extras
- SMOKE_BASE_URL
- SEED_AUTH_PASSWORD

---

## 15. Known compatibility layers and edge handling

1. Goal creation supports modern/legacy progress field shapes.
2. Check-in creation gracefully retries if attachmentIds attribute missing.
3. Final check-in patch path returns explicit schema guidance if required fields absent.
4. Team/manager assignment routes handle partial schemas via fallback updates.
5. Missing optional collections (like checkin_approvals or manager_cycle_ratings) are tolerated with safe empty results.
6. Meet request routes retry after stripping unknown attributes to survive partial schema rollout.
7. Calendar + token flows surface actionable errors for missing OAuth env variables and missing refresh tokens.
8. Trajectory endpoint and client normalize malformed score/timeline payloads and fall back to safe empty-state outputs.
9. Self-review save/submit gracefully handles unknown linkage attributes on goals/check-ins during schema rollout.

This makes deployments resilient while schema migration catches up.

---

## 16. Practical explanation script for stakeholders

Use this explanation when presenting the project:

"HR Console is a role-aware PMS where middleware and API guards ensure each person sees only valid data. Employees create goals, managers coach and approve, and HR governs quality and closure. All frontend workflows call internal APIs through a typed client layer. Server routes enforce business constraints like cycle weightage caps, approval transitions, and rating visibility. Final ratings stay hidden until HR closes the cycle, at which point scores and visibility are updated in bulk. AI assists goal writing, check-in summarization, and role-aware chat, with controlled per-cycle usage caps."

---

## 17. Full endpoint inventory (quick index)

- `/api/auth/redirect`
- `/api/auth/session`
- `/api/auth/logout`
- `/api/auth/onboarding`
- `/api/me`
- `/api/goals`
- `/api/goals/cascade`
- `/api/goals/lineage`
- `/api/goals/[goalId]`
- `/api/goals/[goalId]/submit`
- `/api/goals/[goalId]/lineage`
- `/api/goals/[goalId]/tree`
- `/api/goals/feedback`
- `/api/goals/for-employee`
- `/api/approvals`
- `/api/progress-updates`
- `/api/check-ins`
- `/api/check-ins/[checkInId]`
- `/api/check-ins/[checkInId]/self-review`
- `/api/check-ins/import/template`
- `/api/check-ins/import/preview`
- `/api/check-ins/import/commit`
- `/api/check-ins/manager-approvals`
- `/api/team-members`
- `/api/team-assignments`
- `/api/team-assignments/[employeeId]`
- `/api/manager-assignments`
- `/api/manager-assignments/[managerId]`
- `/api/hr/managers`
- `/api/hr/managers/[managerId]`
- `/api/hr/checkin-approvals`
- `/api/hr/cycles/[cycleId]/close`
- `/api/hr/cycles/[cycleId]/auto-approval`
- `/api/hr/roles/[userId]`
- `/api/hr/aop`
- `/api/analytics/employee-trajectory`
- `/api/analytics/decision-insights`
- `/api/analytics/rating-drops`
- `/api/framework-policies`
- `/api/timeline/[cycleId]`
- `/api/timeline/lifecycle`
- `/api/attachments`
- `/api/attachments/[fileId]/download`
- `/api/ai/chat`
- `/api/ai/analyze-goals`
- `/api/ai/goal-suggestion`
- `/api/ai/checkin-summary`
- `/api/ai/conversational-goals`
- `/api/ai/checkin-agenda`
- `/api/ai/checkin-intelligence`
- `/api/ai/manager-feedback-analysis`
- `/api/ai/usage`
- `/api/goal-library/search`
- `/api/goal-library/pending`
- `/api/goal-library/manager-create`
- `/api/goal-library/leadership-create`
- `/api/goal-library/hr-create`
- `/api/goal-library/approve`
- `/api/goals/[goalId]/cascade`
- `/api/goals/[goalId]/children`
- `/api/goals/import/template`
- `/api/goals/import/preview`
- `/api/goals/import/commit`
- `/api/self-review`
- `/api/self-review/save`
- `/api/self-review/submit`
- `/api/matrix-reviewers/assignments`
- `/api/matrix-reviewers/feedback`
- `/api/matrix-reviewers/summary`
- `/api/hr/9-box`
- `/api/hr/ai-governance/overview`
- `/api/hr/calibration-sessions`
- `/api/hr/calibration-sessions/[sessionId]/decisions`
- `/api/hr/calibration-sessions/[sessionId]/timeline`
- `/api/hr/check-ins/[checkInId]/self-review/reopen`
- `/api/notifications/templates`
- `/api/notifications/jobs`
- `/api/notifications/scheduler`
- `/api/notifications/feed`
- `/api/notifications/events/[eventId]/read`
- `/api/notifications/read-all`
- `/api/leadership/overview`
- `/api/leadership/succession`
- `/api/region-admin/overview`
- `/api/google/connect`
- `/api/google/callback`
- `/api/google/meet/transcript-webhook`
- `/api/google/tokens`
- `/api/google/tokens/status`
- `/api/google/tokens/admin-upsert`
- `/api/calendar/events`
- `/api/calendar/freebusy`
- `/api/calendar/create-meeting`
- `/api/meet-requests`
- `/api/meet-requests/[requestId]`
- `/api/meet-requests/[requestId]/chat`
- `/api/meet-requests/[requestId]/download`
- `/api/meet-requests/[requestId]/intelligence`

---

## 18. Final note

This guide is intended as a living technical handbook. If new modules are added, update:
- endpoint inventory,
- entity model section,
- business rules section,
- and at least one end-to-end flow walkthrough.

---

## 18.1 Recent changes and new features (April 2026)

This update extends the project from a core PMS flow into a policy-driven, timeline-first, decision-intelligence platform.

### A) Leadership role and command center
- Added a dedicated leadership route shell (`app/leadership/layout.tsx`) and dashboard (`app/leadership/page.tsx`).
- Added strategic APIs:
  - `/api/leadership/overview`
  - `/api/leadership/succession`
- Leadership responses are aggregate-first and intended to minimize unnecessary user-level exposure.

### B) Framework policy engine
- Added framework governance API `/api/framework-policies`.
- Framework enablement is now policy-driven for write-time validation (including AI-assisted drafting flows).
- New utility layer in `lib/frameworkPolicies.js` supports default/fallback behavior and schema-compat writes.

### C) Timeline-first lifecycle aggregation
- Added `/api/timeline/[cycleId]` for role-safe cycle aggregate state and optional timeline events.
- Added `/api/timeline/lifecycle` for filtered lifecycle event stream retrieval.
- Added deterministic stage resolver in `lib/workflow/timelineState.js` and telemetry helper in `lib/telemetry/timeline.js`.

### D) AI upgrades: conversational + explainable
- Added conversational goal drafting endpoint `/api/ai/conversational-goals`.
- Added pre-check-in agenda endpoint `/api/ai/checkin-agenda`.
- Added check-in intelligence endpoint `/api/ai/checkin-intelligence`.
- Added usage snapshot endpoint `/api/ai/usage`.
- Added reusable explainability helper (`lib/ai/explainability.js`) and drawer component (`src/components/patterns/ExplainabilityDrawer.tsx`).
- Added reusable conversational composer component (`src/components/patterns/ConversationalGoalComposer.tsx`).

### E) Matrix reviewer model
- Added assignment API `/api/matrix-reviewers/assignments`.
- Added feedback API `/api/matrix-reviewers/feedback`.
- Added blended summary API `/api/matrix-reviewers/summary`.
- Added matrix utilities in `lib/matrixReviews.js`.
- Added UI surfaces:
  - Manager matrix reviews page (`app/manager/matrix-reviews/page.tsx`)
  - Employee matrix feedback page (`app/employee/matrix-feedback/page.tsx`)

### F) HR strategic governance surfaces
- Added HR AI governance API `/api/hr/ai-governance/overview` and UI page (`app/hr/ai-governance/page.tsx`).
- Added HR calibration APIs:
  - `/api/hr/calibration-sessions`
  - `/api/hr/calibration-sessions/[sessionId]/decisions`
  - `/api/hr/calibration-sessions/[sessionId]/timeline`
- Added HR calibration UI (`app/hr/calibration/page.tsx`).
- Added HR 9-box API `/api/hr/9-box` and UI (`app/hr/9-box/page.tsx`).

### G) Notifications platform
- Added templates/jobs/feed/scheduler/read APIs:
  - `/api/notifications/templates`
  - `/api/notifications/jobs`
  - `/api/notifications/scheduler`
  - `/api/notifications/feed`
  - `/api/notifications/events/[eventId]/read`
- Added scheduler engine with retry, dedupe suppression, and delivery event logging.
- Added HR notifications policy UI (`app/hr/notifications/page.tsx`).

### H) Goal cascade and import pipeline
- Added cascade endpoints:
  - `/api/goals/[goalId]/cascade`
  - `/api/goals/[goalId]/children`
- Added import endpoints:
  - `/api/goals/import/template`
  - `/api/goals/import/preview`
  - `/api/goals/import/commit`
- Import commit flow now supports idempotency keys and import-job audit tracking.

### I) Talent and succession analytics foundation
- Added shared talent snapshot builder (`app/api/_lib/talentSnapshot.js`).
- HR 9-box and leadership succession APIs both consume this derived banding logic (`performanceBand`, `potentialBand`, `readinessBand`).

### J) Test and developer workflow updates
- Expanded smoke UI matrix to include leadership route and additional HR pages.
- Added focused trajectory regression script (`scripts/test-employee-trajectory.mjs`).
- Added stable local dev launcher (`scripts/dev-stable.ps1`) to clean stale Next dev process/lock scenarios.

---

## 19. LLM conversation handoff block

Use this when sharing context with another LLM:

### 19.1 Project identity summary
- Product: HR Console
- Domain: performance management (goals, progress, check-ins, approvals, cycle closure)
- Roles: employee, manager, hr, leadership (legacy aliases normalize to leadership)
- Core backend: Next.js route handlers + Appwrite
- Core data entities: users, goals, approvals, check-ins, progress updates, cycle scores, manager ratings, AI events, meeting requests, google tokens

### 19.2 What the assistant should optimize for
- Preserve role-based access control and never bypass scope checks.
- Preserve lifecycle states and transition rules.
- Preserve rating visibility policy (hidden until cycle close).
- Keep schema-compatibility fallbacks intact unless migration is explicitly complete.
- Prefer additive, backward-compatible changes in APIs and frontend payload parsing.

### 19.3 Critical invariants
- Goal cycle weightage per employee must never exceed 100.
- Only submitted goals can be approved/rejected/needs_changes.
- Manager cannot self-approve own submitted goals.
- Check-ins are allowed only on approved goals and capped per-goal.
- Final manager rating is constrained to final-check-in paths and role checks.
- Manager scope traverses full descendant subtree in hierarchy-aware endpoints.
- Meeting scheduling must honor manager-employee access and Google token prerequisites.

### 19.4 Typical prompts that this project supports
- "Trace why a manager cannot approve a goal and show which rule failed."
- "Explain the full data flow from employee meeting request to scheduled Google Meet link."
- "Find all places where rating visibility flips from hidden to visible."
- "Add a new analytics KPI to HR and leadership dashboards without breaking role boundaries."
- "List every API that touches goals and describe side effects."

### 19.5 Safe assumptions for future contributors
- The app favors strict server-side authorization (`requireAuth`, `requireRole`, team access assertions).
- Frontend state is role-aware and depends heavily on `app/employee/_lib/pmsClient.ts` helpers.
- Appwrite schema drift is expected across environments; compatibility paths are intentional.
- Documentation in `docs/*` plus this guide should be updated with every new endpoint or role surface.

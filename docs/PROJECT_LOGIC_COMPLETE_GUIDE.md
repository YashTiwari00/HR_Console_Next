# HR Console - Complete Project Logic Guide

## 1. What this project is

HR Console is a role-based Performance Management System (PMS) built with Next.js App Router and Appwrite.

It supports three core personas:
- Employee: create goals, submit progress updates, run check-ins, track timeline.
- Manager: do own PMS activity plus review and approve team goals/check-ins.
- HR: govern assignments, monitor quality/cadence, close cycles, enforce policy.

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
- Role layouts under `app/employee`, `app/manager`, `app/hr`

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

Each area has:
- `layout.tsx`: sidebar nav, user context, logout, ChatBot mount.
- `page.tsx`: dashboard summary.
- workflow pages: goals/progress/check-ins/timeline (role-appropriate variants).

### 4.3 API area
All server endpoints are in `app/api/*` and grouped by concern:
- auth/session
- me
- goals and approvals
- progress updates
- check-ins and HR check-in approvals
- team and manager assignments
- HR governance and cycle close
- attachments
- AI features

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
- manager HR mapping: `hrId`, `hrAssignedAt`, `hrAssignedBy`, `hrAssignmentVersion`

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

### GET /api/me
- File: `app/api/me/route.js`
- Returns user and profile context used by layouts/pages.

## 7.2 Goals APIs

### GET /api/goals
- File: `app/api/goals/route.js`
- Roles: employee, manager, hr.
- Scope behavior:
  - employee: own goals only.
  - manager: own/team/all with team-boundary checks.
  - hr: all goals.
- Optional filters: cycleId, status, employeeId.
- Visibility behavior: hides final ratings in specific contexts.

### POST /api/goals
- File: `app/api/goals/route.js`
- Roles: employee, manager.
- Input: title, description, cycleId, frameworkType, managerId?, weightage, dueDate?, lineageRef?, aiSuggested?.
- Rules:
  - required fields validation
  - framework must be one of OKR/MBO/HYBRID
  - weightage 1..100
  - total cycle weightage per employee must not exceed 100
  - cycleId normalized server-side
- Manager approver resolution fallback chain for manager role:
  1. profile.hrId
  2. profile.managerId (legacy fallback)
  3. first available HR user
- Schema compatibility write flow:
  - try dual write with `progressPercent` + `processPercent`
  - fallback to modern-only or legacy-only depending on schema errors

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
- Roles: manager, hr.
- Returns submitted goals pending decisions.
- HR origin filter (`origin=manager`) narrows to manager-owned goals under proper HR ownership.

### POST /api/approvals
- File: `app/api/approvals/route.js`
- Roles: manager, hr.
- Input: goalId, decision, comments.
- Rules:
  - decision must be approved/rejected/needs_changes
  - goal must be submitted
  - manager cannot approve own goals
  - manager must be assigned approver for the goal
  - HR cannot decide manager goals owned by different HR owner
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
- Scope behavior for employee/manager/hr.
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
- Roles: employee, manager.
- Input: goalId, scheduledAt, optional status/notes/transcript/final flag/attachments.
- Rules:
  - goal must be approved
  - employeeId must match goal owner
  - strict owner/manager access checks
  - max 5 check-ins per goal
- Compatibility write fallback when `attachmentIds` schema is missing.

### PATCH /api/check-ins/[checkInId]
- File: `app/api/check-ins/[checkInId]/route.js`
- Roles: manager, hr (with manager-focused final rating constraints).
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
- HR-only.
- Lists or creates employee->manager assignments.
- Tracks assignment timestamps/versions where schema allows.

### PUT/DELETE /api/team-assignments/[employeeId]
- File: `app/api/team-assignments/[employeeId]/route.js`
- HR-only.
- Update or clear manager mapping.

### GET/POST /api/manager-assignments
- File: `app/api/manager-assignments/route.js`
- HR-only.
- Lists managers with HR assignment status and metadata.
- Assign manager -> HR owner.

### PUT/DELETE /api/manager-assignments/[managerId]
- File: `app/api/manager-assignments/[managerId]/route.js`
- HR-only.
- Update/clear manager->HR mapping.

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

---

## 8. Frontend role modules and their logic

## 8.1 Employee module

### Dashboard (`app/employee/page.tsx`)
- Loads goals and check-ins in parallel.
- Computes approved goals and average progress locally.
- Renders KPI cards and quick links.

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

### Timeline (`app/employee/timeline/page.tsx`)
- Lifecycle visualization with status narrative and ordering.

## 8.2 Manager module

### Dashboard (`app/manager/page.tsx`)
- Loads own and team goals/check-ins/progress simultaneously.
- Separates self metrics and team metrics for managerial context.

### Goals and approvals
- Own goals area plus team approval surfaces.
- Approval queue in `app/manager/approvals/page.tsx` calls `/api/approvals`.

### Team progress/check-ins
- Dedicated views for cross-team monitoring and action.

### Manager timeline/progress/check-ins
- Mirrors employee workflow for manager's own goals.

## 8.3 HR module

### HR dashboard (`app/hr/page.tsx`)
- Manager-level summary table and KPI aggregation.
- Includes role reassignment action using `/api/hr/roles/[userId]`.

### Team assignments (`app/hr/team-assignments/page.tsx`)
- Manages employee->manager and manager->HR links.

### HR approvals (`app/hr/approvals/page.tsx`)
- Runs check-in governance and closure operations.

### HR check-ins (`app/hr/check-ins/page.tsx`)
- Cadence and compliance monitoring.

### Manager drilldown (`app/hr/managers/[managerId]/page.tsx`)
- Deep view for one manager's team and cycle health.

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
- `npm run smoke:api`
- `npm run smoke:ui`

Logic:
- creates sessions for seeded users
- verifies happy paths and blocked paths
- checks route reachability and permission boundaries

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
- NEXT_PUBLIC_ATTACHMENTS_BUCKET_ID

### 14.3 OAuth/public client options
- NEXT_PUBLIC_OAUTH_SUCCESS_URL
- NEXT_PUBLIC_OAUTH_FAILURE_URL
- NEXT_PUBLIC_OAUTH_SCOPES

### 14.4 AI settings
- OPENROUTER_API_KEY

### 14.5 Script/runtime extras
- SMOKE_BASE_URL
- SEED_AUTH_PASSWORD

---

## 15. Known compatibility layers and edge handling

1. Goal creation supports modern/legacy progress field shapes.
2. Check-in creation gracefully retries if attachmentIds attribute missing.
3. Final check-in patch path returns explicit schema guidance if required fields absent.
4. Team/manager assignment routes handle partial schemas via fallback updates.
5. Missing optional collections (like checkin_approvals or manager_cycle_ratings) are tolerated with safe empty results.

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
- `/api/me`
- `/api/goals`
- `/api/goals/[goalId]`
- `/api/goals/[goalId]/submit`
- `/api/goals/feedback`
- `/api/approvals`
- `/api/progress-updates`
- `/api/check-ins`
- `/api/check-ins/[checkInId]`
- `/api/team-members`
- `/api/team-assignments`
- `/api/team-assignments/[employeeId]`
- `/api/manager-assignments`
- `/api/manager-assignments/[managerId]`
- `/api/hr/managers`
- `/api/hr/managers/[managerId]`
- `/api/hr/checkin-approvals`
- `/api/hr/cycles/[cycleId]/close`
- `/api/hr/roles/[userId]`
- `/api/attachments`
- `/api/attachments/[fileId]/download`
- `/api/ai/chat`
- `/api/ai/goal-suggestion`
- `/api/ai/checkin-summary`

---

## 18. Final note

This guide is intended as a living technical handbook. If new modules are added, update:
- endpoint inventory,
- entity model section,
- business rules section,
- and at least one end-to-end flow walkthrough.

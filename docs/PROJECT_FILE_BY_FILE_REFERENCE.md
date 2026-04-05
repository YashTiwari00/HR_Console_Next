# HR Console - File-by-File Reference

This document explains every file in:
- app/api
- lib
- services

Each entry includes:
- what it does
- key logic
- who uses it

## API Files

### Authentication and Session

- [app/api/auth/redirect/route.js](../app/api/auth/redirect/route.js)
  - Purpose: Returns canonical post-login route for current user role.
  - Key logic: Reads authenticated profile role, normalizes role, maps to route.
  - Used by: middleware and client auth helpers.

- [app/api/auth/session/route.js](../app/api/auth/session/route.js)
  - Purpose: Converts OAuth callback credentials into a first-party server session.
  - Key logic: Validates callback userId/secret, creates Appwrite session, sets httpOnly cookies.
  - Used by: auth callback page via services/authService finalize flow.

- [app/api/auth/logout/route.js](../app/api/auth/logout/route.js)
  - Purpose: Logs out current session safely.
  - Key logic: Attempts server session deletion, always clears cookies as final cleanup.
  - Used by: role layouts account menu.

- [app/api/me/route.js](../app/api/me/route.js)
  - Purpose: Returns user identity plus profile document.
  - Key logic: Requires session auth, returns user + profile payload shape for frontend context.
  - Used by: layouts and onboarding/profile bootstrap.

### Goals and Approvals

- [app/api/goals/route.js](../app/api/goals/route.js)
  - Purpose: List and create goals.
  - GET logic: role-aware scope filtering for employee/manager/hr; optional cycle/status/employee filters; sensitive rating masking.
  - POST logic: validates required fields/framework/weightage/cycle cap, resolves manager approver mapping, creates draft goal with schema-compat fallback.
  - Used by: employee and manager goals pages, dashboard cards.

- [app/api/goals/[goalId]/route.js](../app/api/goals/[goalId]/route.js)
  - Purpose: Read or update one goal.
  - GET logic: role/ownership checks.
  - PUT logic: only draft or needs_changes can be edited; revalidates total cycle weightage.
  - Used by: goal edit experience.

- [app/api/goals/[goalId]/submit/route.js](../app/api/goals/[goalId]/submit/route.js)
  - Purpose: Submit a goal to approval queue.
  - Key logic: owner-only, status gate draft or needs_changes, updates to submitted.
  - Used by: employee and manager goal submit action.

- [app/api/goals/feedback/route.js](../app/api/goals/feedback/route.js)
  - Purpose: Return latest feedback decisions tied to goals.
  - Key logic: scope and access filtering, latest decision per goal.
  - Used by: goals UI feedback chips and notes.

- [app/api/approvals/route.js](../app/api/approvals/route.js)
  - Purpose: Manager and leadership decision endpoint for submitted goals.
  - GET logic: pending approval queue retrieval with hierarchy-aware scope checks.
  - POST logic: decision validation, ownership and anti-self-approval rules, writes approval history and updates goal status.
  - Used by: manager and leadership approvals workflows.

### Check-ins

- [app/api/check-ins/route.js](../app/api/check-ins/route.js)
  - Purpose: List and create check-ins.
  - GET logic: role-aware list scoping, enrichment with latest HR review and manager cycle rating, rating visibility masking.
  - POST logic: validates goal state and ownership, enforces max check-in count, writes check-in with attachment schema fallback.
  - Used by: employee/manager check-in pages, manager team check-ins.

- [app/api/check-ins/[checkInId]/route.js](../app/api/check-ins/[checkInId]/route.js)
  - Purpose: Complete a check-in and optionally apply final rating.
  - PATCH logic: allowed transition to completed, final-check-in manager-only rating rules, goal final rating update, cycle score recompute.
  - Used by: manager check-in completion flow.

### Progress Updates

- [app/api/progress-updates/route.js](../app/api/progress-updates/route.js)
  - Purpose: List and create progress updates.
  - GET logic: scope and access filtered listing.
  - POST logic: validates percent and rag status, writes update with optional attachments.
  - Used by: employee and manager progress pages.

### Team and Assignment Management

- [app/api/team-members/route.js](../app/api/team-members/route.js)
  - Purpose: Return team member rows by role context.
  - Key logic: manager and leadership see hierarchy-aligned team scope, hr can see broader monitoring list.
  - Used by: manager, leadership, and HR pages that need employee directories.

- [app/api/team-assignments/route.js](../app/api/team-assignments/route.js)
  - Purpose: List and create employee to manager assignments.
  - GET logic: leadership-managed assignment listing with optional manager filtering.
  - POST logic: validates roles and references, updates assignment metadata/version.
  - Used by: leadership assignment workflows.

- [app/api/team-assignments/[employeeId]/route.js](../app/api/team-assignments/[employeeId]/route.js)
  - Purpose: Update or remove one employee assignment.
  - PUT logic: change manager mapping with validation.
  - DELETE logic: clear mapping and maintain assignment integrity.
  - Used by: leadership reassignment/removal controls.

- [app/api/manager-assignments/route.js](../app/api/manager-assignments/route.js)
  - Purpose: List and create manager to parent-manager hierarchy mappings.
  - GET logic: supports leadership filters and unassigned manager views.
  - POST logic: hierarchy validation and cycle prevention, updates version metadata.
  - Used by: leadership hierarchy management tools.

- [app/api/manager-assignments/[managerId]/route.js](../app/api/manager-assignments/[managerId]/route.js)
  - Purpose: Update or remove one manager to parent-manager mapping.
  - PUT logic: remap parent manager with hierarchy validation.
  - DELETE logic: clear parent-manager mapping for manager.
  - Used by: leadership management actions.

### HR Governance

- [app/api/hr/managers/route.js](../app/api/hr/managers/route.js)
  - Purpose: Build HR dashboard manager summary rows.
  - Key logic: aggregates team size, team goal counts, average progress, pending approvals, and cadence metrics.
  - Used by: HR home dashboard.

- [app/api/hr/managers/[managerId]/route.js](../app/api/hr/managers/[managerId]/route.js)
  - Purpose: HR drilldown for one manager and team.
  - Key logic: merges manager summary with employee-level goals/progress/check-ins and historical fields.
  - Used by: HR manager detail page.

- [app/api/hr/checkin-approvals/route.js](../app/api/hr/checkin-approvals/route.js)
  - Purpose: HR review queue for completed check-ins.
  - GET logic: status-filtered queue generation.
  - POST logic: writes HR decision record for a check-in.
  - Used by: HR approvals page.

- [app/api/hr/cycles/[cycleId]/close/route.js](../app/api/hr/cycles/[cycleId]/close/route.js)
  - Purpose: Close cycle and release ratings visibility.
  - Key logic: recompute employee scores, set rating visibility visible, close or create cycle state row.
  - Used by: HR cycle closure action.

- [app/api/hr/roles/[userId]/route.js](../app/api/hr/roles/[userId]/route.js)
  - Purpose: HR role reassignment endpoint.
  - Key logic: validates target role and updates user profile role fields.
  - Used by: HR dashboard role reassignment card.

### Attachments

- [app/api/attachments/route.js](../app/api/attachments/route.js)
  - Purpose: Upload attachment files.
  - Key logic: MIME and size validation, storage upload, metadata response.
  - Used by: progress and check-in forms.

- [app/api/attachments/[fileId]/download/route.js](../app/api/attachments/[fileId]/download/route.js)
  - Purpose: Securely stream file download.
  - Key logic: authenticated file fetch from storage and content headers.
  - Used by: attachment preview/download links.

### AI Endpoints

- [app/api/ai/chat/route.js](../app/api/ai/chat/route.js)
  - Purpose: Role-aware assistant chat with streamed response.
  - Key logic: gathers contextual data by role, constructs system prompt, streams OpenRouter output.
  - Used by: floating ChatBot component in landing and role layouts.

- [app/api/ai/goal-suggestion/route.js](../app/api/ai/goal-suggestion/route.js)
  - Purpose: Generate AI goal drafts.
  - Key logic: validates cycle/framework, enforces per-cycle usage cap, returns structured suggestions.
  - Used by: goals create form AI suggest button.

- [app/api/ai/checkin-summary/route.js](../app/api/ai/checkin-summary/route.js)
  - Purpose: Summarize check-in notes into structured output.
  - Key logic: usage cap enforcement and bounded JSON generation.
  - Used by: check-in notes summarization UI.

- [app/api/ai/_lib/aiUsage.js](../app/api/ai/_lib/aiUsage.js)
  - Purpose: Internal helper for AI cap tracking.
  - Key logic: per-feature per-user per-cycle counter and remaining quota calculation.
  - Used by: goal-suggestion and checkin-summary APIs.

## Library Files

- [lib/appwrite.js](../lib/appwrite.js)
  - Purpose: Browser Appwrite client instances and collection/bucket config object.
  - Key logic: centralizes endpoint/project setup and public config defaults.

- [lib/appwriteServer.js](../lib/appwriteServer.js)
  - Purpose: Server Appwrite client factory helpers.
  - Key logic: admin client, session client, jwt client creation; exports ID, Query, InputFile, databaseId.

- [lib/appwriteSchema.js](../lib/appwriteSchema.js)
  - Purpose: shared constants for statuses, frameworks, periods, visibility, collection ids.
  - Key logic: single source for enum-like business values.

- [lib/serverAuth.js](../lib/serverAuth.js)
  - Purpose: server-side auth and role enforcement primitives.
  - Key logic: authenticate session or jwt, fetch profile, provide requireRole and errorResponse wrappers.

- [lib/auth/roles.js](../lib/auth/roles.js)
  - Purpose: role normalization and route mapping.
  - Key logic: strict allowlist and expected route derivation.

- [lib/auth/session.js](../lib/auth/session.js)
  - Purpose: cookie reading/writing helpers for Appwrite session handling.
  - Key logic: support app cookie and project cookie formats, secure clear/build option helpers.

- [lib/teamAccess.js](../lib/teamAccess.js)
  - Purpose: relationship-aware access control and mapping helpers.
  - Key logic: manager subtree resolution from assignments plus fallback from goals, hierarchy assertions, summary mappers.

- [lib/cycle.js](../lib/cycle.js)
  - Purpose: cycle and check-in identity utilities.
  - Key logic: Qx-YYYY derivation, input normalization, check-in code formatter.

- [lib/ratings.js](../lib/ratings.js)
  - Purpose: rating parsing and weighted score math.
  - Key logic: convert labels/values, compute weighted score, map score bands to rating label.

- [lib/finalRatings.js](../lib/finalRatings.js)
  - Purpose: persist cycle scores and control visibility after cycle transitions.
  - Key logic: compute score from approved goals, upsert cycle scores, bulk toggle goal and score visibility.

- [lib/openrouter.js](../lib/openrouter.js)
  - Purpose: model invocation abstraction.
  - Key logic: non-streaming JSON and streaming text requests to OpenRouter with consistent error handling.

## Service Files

- [services/authService.js](../services/authService.js)
  - Purpose: client-side auth orchestration wrapper.
  - Key logic: OAuth launch, callback finalize, session polling, profile role fetch, onboarding completion, logout.
  - Used by: login, callback, onboarding, and role layouts.

## Quick use map

If you need to debug:
- login/redirect issues: auth routes + middleware + services/authService.js
- goal create/edit/approval issues: goals routes + approvals route + employee or manager goals page
- check-in completion/rating issues: check-ins routes + finalRatings + ratings
- missing visibility of ratings: hr cycle close route + finalRatings visibility helper
- team scope permission issues: teamAccess helpers + manager/HR routes
- AI cap or response shape issues: ai routes + aiUsage + openrouter wrapper

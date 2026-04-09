# HR Console Tech Stack

This document is the current technical baseline for the HR Console workspace.

## 1. Core runtime
- Next.js 16.1.6 (App Router, route handlers)
- React 19.2.3
- React DOM 19.2.3
- Node.js runtime for server routes and scripts
- TypeScript 5 across app surfaces (mixed TS/JS codebase)

## 2. Frontend and design system
- Tailwind CSS 4
- PostCSS with `@tailwindcss/postcss`
- Token-driven styling in `styles/tokens.css` and `styles/typography.css`
- Shared UI system in `src/components/ui`, `src/components/layout`, and `src/components/patterns`
- Role-based App Router modules under `app/employee`, `app/manager`, `app/hr`, and `app/leadership`

## 3. Backend architecture
- Next.js Route Handlers under `app/api/*`
- Server auth/context and role enforcement via `lib/serverAuth.js` and `lib/auth/roles.js`
- Team and hierarchy scope resolution via `lib/teamAccess.js`
- Compatibility-safe API patterns to tolerate partial Appwrite schema rollout

## 4. Database, auth, and storage
- Appwrite browser SDK: `appwrite` 23.0.0
- Appwrite server SDK: `node-appwrite` 22.1.3
- Appwrite database and object storage as primary persistence layer
- OAuth-based auth flow with Appwrite session cookies

## 5. AI and intelligence stack
- OpenRouter client wrapper in `lib/openrouter.js`
- AI route family in `app/api/ai/*` for chat, goal drafting, summaries, agenda, intelligence, and usage
- Explainability and decision helpers in `lib/ai/*`, `lib/decision/*`, and `lib/ratingDrop*`
- Usage governance persisted in `ai_events` and policy collections

## 6. Integrations
- Google APIs (`googleapis` 150.0.1)
- Google OAuth token lifecycle and role-safe token status APIs
- Google Calendar free/busy, event listing, and meeting creation endpoints
- Google Meet request lifecycle and intelligence/transcript integration routes

## 7. Feature and utility packages
- FullCalendar: `@fullcalendar/react`, `@fullcalendar/timegrid`, `@fullcalendar/interaction` (6.1.20)
- XLSX import/export: `xlsx` 0.18.5
- 3D/visual utilities: `three` 0.183.2

## 8. Code quality and tooling
- ESLint 9
- `eslint-config-next` 16.1.6
- Type packages: `@types/node`, `@types/react`, `@types/react-dom`, `@types/three`

## 9. Scripts and operational workflows
- Dev/build/start/lint:
	- `npm run dev`
	- `npm run dev:stable`
	- `npm run build`
	- `npm run start`
	- `npm run lint`
- Schema workflows:
	- `npm run schema:audit`
	- `npm run schema:apply`
- Seed workflows:
	- `npm run seed:users`
	- `npm run seed:medium`
	- `npm run seed:medium:autoauth`
	- `npm run seed:verify`
- Test and smoke workflows:
	- `npm run test:trajectory`
	- `npm run test:rating-drop`
	- `npm run smoke:api`
	- `npm run smoke:self-review`
	- `npm run smoke:ai:bulk-goals`
	- `npm run smoke:ui`

## 10. Appwrite data domains

### 10.1 Core PMS entities
- `users`
- `goals`
- `goal_approvals`
- `check_ins`
- `checkin_approvals`
- `progress_updates`
- `goal_cycles`
- `employee_cycle_scores`
- `manager_cycle_ratings`

### 10.2 Self-review and check-in linkage
- `goal_self_reviews`
- Goal-level linkage fields: `selfReviewId`, `selfReviewStatus`, `selfReviewSubmittedAt`
- Final check-in linkage fields: `goalSelfReviewId`, `goalSelfReviewStatus`

### 10.3 AI, policy, and analytics entities
- `ai_events`
- `ai_policies`
- `rating_drop_insights`
- `rating_drop_analysis`
- `talent_snapshots`

### 10.4 Collaboration, governance, and notifications
- `matrix_reviewer_assignments`
- `matrix_reviewer_feedback`
- `framework_policies`
- `goal_kpi_library`
- `import_jobs`
- `calibration_sessions`
- `calibration_decisions`
- `notification_templates`
- `notification_jobs`
- `notifications`
- `notification_events`

### 10.5 Meetings and external sync
- `google_tokens`
- `google_meet_requests`
- `meeting_metadata`
- `meeting_intelligence`
- `meeting_intelligence_details`
- `aop_documents`
- Attachments bucket: `pms_attachments` (override via env)

## 11. Configuration model
- Core appwrite envs (`NEXT_PUBLIC_APPWRITE_ENDPOINT`, `NEXT_PUBLIC_APPWRITE_PROJECT_ID`, `NEXT_PUBLIC_DATABASE_ID`, `APPWRITE_API_KEY`)
- Collection/bucket IDs are overrideable via `NEXT_PUBLIC_*` env variables in `lib/appwrite.js`
- OAuth and callback envs for Appwrite and Google integrations
- Feature flags for selective UI/analytics rollout

## 12. Notes on compatibility
- The project intentionally supports schema drift with safe fallbacks in route handlers.
- Mixed TS/JS route files are expected and supported.
- Existing legacy route aliases (for example region-admin paths) are maintained as redirect-compatible shims.

# HR Console Tech Stack

This file lists the technologies currently used in this project.

## Core framework
- Next.js 16.1.6 (App Router)
- React 19.2.3
- React DOM 19.2.3
- TypeScript 5

## Styling and UI
- Tailwind CSS 4
- PostCSS (`@tailwindcss/postcss`)
- Custom design system with CSS tokens and typography styles

## Backend and APIs
- Next.js Route Handlers (`app/api/*`) for server APIs
- Node.js runtime

## Database, auth, and storage
- Appwrite Web SDK (`appwrite`) 23.0.0
- Appwrite Server SDK (`node-appwrite`) 22.1.3

## AI and integrations
- OpenRouter integration (via `lib/openrouter.js`)
- Google APIs (`googleapis`) 150.0.1

## Calendar and data utilities
- FullCalendar (`@fullcalendar/react`, `@fullcalendar/timegrid`, `@fullcalendar/interaction`) 6.1.20
- XLSX (`xlsx`) 0.18.5

## Visualization
- Three.js (`three`) 0.183.2

## Code quality and tooling
- ESLint 9
- `eslint-config-next` 16.1.6
- Type definitions: `@types/node`, `@types/react`, `@types/react-dom`, `@types/three`

## Package manager and scripts
- npm scripts for development, build, start, lint, schema sync, seeding, and smoke tests

## Data model extension: goal self reviews
- New Appwrite collection: goal_self_reviews
- Purpose: one employee self-review per goal per cycle, with structured fields for analytics and AI.

### Core linkage fields
- employeeId (string, required)
- goalId (string, required)
- cycleId (string, required)

### Review content fields
- selfRatingValue (integer 1..5, optional)
- selfRatingLabel (enum: EE, DE, ME, SME, NI, optional)
- selfComment (string text, optional)
- achievements (string text, optional)
- challenges (string text, optional)
- evidenceLinks (string array, optional) for attachment IDs or URLs

### Workflow fields
- status (enum: draft, submitted; default draft)
- submittedAt (datetime, optional)

### AI-ready structured fields
- achievementsJson (string JSON payload, optional)
- challengesJson (string JSON payload, optional)

### Uniqueness and constraints
- reviewKey (required synthetic key: employeeId|goalId|cycleId)
- Unique index on reviewKey enforces one self-review per goal per cycle per employee.

### Integration with existing schema (non-breaking)
- goals collection adds optional linkage/summary fields:
	- selfReviewId
	- selfReviewStatus (draft/submitted)
	- selfReviewSubmittedAt
- check_ins collection adds optional linkage fields:
	- goalSelfReviewId
	- goalSelfReviewStatus (draft/submitted)
- Existing check-in self-review fields remain intact for backward compatibility.

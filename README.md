# HR Console

HR Console is a Next.js application for performance management workflows across multiple personas (employee, manager, HR, leadership, and region admin). It includes goal management, approvals, self-review/check-in flow, AI-assisted insights, and Google/Appwrite integrations.

## Tech Stack

- Next.js 16 (App Router)
- React 19
- TypeScript + JavaScript (mixed codebase)
- Tailwind CSS 4
- Appwrite (auth, database, storage)
- Google APIs (Calendar/Meet/OAuth)
- Nodemailer (email notifications)

For full stack details, see [docs/TECH_STACK.md](docs/TECH_STACK.md).

## Prerequisites

- Node.js 20+
- npm 10+
- Appwrite project with configured database/collections
- Optional: Google OAuth credentials for Calendar/Meet workflows

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables in `.env` (or `.env.local`) based on the configuration section below.

3. Start development server:

```bash
npm run dev
```

4. Open http://localhost:3000

For a more stable local startup flow on Windows, use:

```bash
npm run dev:stable
```

## Core Environment Variables

At minimum, configure:

- `NEXT_PUBLIC_APPWRITE_ENDPOINT`
- `NEXT_PUBLIC_APPWRITE_PROJECT_ID`
- `NEXT_PUBLIC_DATABASE_ID`
- `APPWRITE_API_KEY`

Common optional integrations:

- Google OAuth and API keys (for Calendar/Meet features)
- `EMAIL_USER` and `EMAIL_PASS` (SMTP email sending)
- Feature flags:
	- `NEXT_PUBLIC_ENABLE_EMPLOYEE_TRAJECTORY`
	- `NEXT_PUBLIC_ENABLE_GAMIFICATION`
	- `NEXT_PUBLIC_ENABLE_GROWTH_HUB`
	- `NEXT_PUBLIC_ENABLE_CONTRIBUTION_BADGE`

Reference docs:

- [docs/TECH_STACK.md](docs/TECH_STACK.md)
- [docs/EMAIL_AND_GOOGLE_SETUP.md](docs/EMAIL_AND_GOOGLE_SETUP.md)
- [docs/googleMeet-setup.md](docs/googleMeet-setup.md)

## Scripts

### App Lifecycle

- `npm run dev` - start dev server
- `npm run dev:stable` - stable dev startup helper script
- `npm run build` - production build
- `npm run start` - start production server
- `npm run lint` - run ESLint

### Appwrite Schema

- `npm run schema:audit` - inspect schema/state
- `npm run schema:apply` - apply schema updates

### Data Seeding

- `npm run seed:users` - print seed user plan
- `npm run seed:medium` - seed medium dataset
- `npm run seed:medium:autoauth` - seed dataset and create auth users
- `npm run seed:verify` - validate seeded data

### Tests and Smoke Checks

- `npm run test:trajectory`
- `npm run test:rating-drop`
- `npm run smoke:api`
- `npm run smoke:gamification`
- `npm run smoke:self-review`
- `npm run smoke:ai:bulk-goals`
- `npm run smoke:ai:modes`
- `npm run smoke:contribution-badge`
- `npm run smoke:growth-hub`
- `npm run smoke:ui`

## Project Structure (High-Level)

- `app/` - App Router pages, route handlers, and role-based modules
- `components/` - reusable UI blocks
- `lib/` - domain logic, integrations, auth helpers, AI utilities
- `scripts/` - schema, seed, smoke, and diagnostic scripts
- `docs/` - product and engineering documentation

## Key Documentation

- [docs/master-prd.md](docs/master-prd.md)
- [docs/PROJECT_LOGIC_COMPLETE_GUIDE.md](docs/PROJECT_LOGIC_COMPLETE_GUIDE.md)
- [docs/PROJECT_UI_COMPONENTS_GUIDE.md](docs/PROJECT_UI_COMPONENTS_GUIDE.md)
- [docs/PRODUCTION_READINESS_SPRINT6.md](docs/PRODUCTION_READINESS_SPRINT6.md)

## Notes

- This codebase contains both TypeScript and JavaScript modules by design.
- Route handlers include compatibility-safe fallbacks to tolerate staged Appwrite schema rollouts.
- Legacy route aliases may exist for backward compatibility.

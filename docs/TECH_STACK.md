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

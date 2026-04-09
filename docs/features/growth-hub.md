# Growth Hub
Employee-facing growth workspace for trajectory, readiness, TNA, and AI pathway guidance.

## Feature Flag
`NEXT_PUBLIC_ENABLE_GROWTH_HUB`

## New API Routes
- `GET /api/growth/summary`: Deterministic growth summary (cycle history labels, TNA items, readiness, goals, self-review summary).
- `POST /api/ai/growth-pathway`: AI career pathway text generation with per-cycle usage cap.
- `POST /api/ai/growth-hub`: Employee growth hub AI endpoint for consolidated guidance payload.

## New and Modified UI Files
- `app/employee/growth/page.tsx` (new/updated Growth Hub page)
- `src/components/ui/ReadinessBadge.tsx` (new)
- `src/components/ui/CycleHistoryTimeline.tsx` (new)
- `src/components/patterns/CareerPathwayPanel.tsx` (new)
- `src/components/patterns/TnaSkillCard.tsx` (new)
- `app/employee/page.tsx` (dashboard promo CTA)
- `app/employee/layout.tsx` (sidebar nav item)

## Data Sources Used
- `employee_cycle_scores`: `employeeId`, `cycleId`, `scoreLabel`, `computedAt` (labels only in employee UI)
- `talent_snapshots`: `employeeId`, `cycleId`, `performanceBand`, `potentialBand`, `readinessBand`, `computedAt`
- `goals`: `title`, `cycleId`, `progressPercent`, `status`, `managerFinalRatingLabel` (only when visible)
- `goal_self_reviews`: `employeeId`, `goalId`, `cycleId`, `status`, `selfRatingLabel`, `achievements`, `challenges`
- `ai_events`: usage tracking for growth AI features

## Rating Visibility Compliance
Numeric rating fields are excluded from employee-facing Growth Hub UI logic.
The UI consumes qualitative labels (for example `scoreLabel`, `managerFinalRatingLabel` when visible) and readiness bands only.
No `scoreX100` rendering is allowed in Growth Hub components.

## AI Endpoint: growth-pathway
- Route: `POST /api/ai/growth-pathway`
- Usage cap: `3` requests per user per cycle
- 429 response used when cap is reached

## Readiness Derivation
- Primary: use latest `talent_snapshots.readinessBand` mapped to UI label.
- Fallback: derive from recent cycle `scoreLabel` history when snapshot readiness is unavailable.

## TNA Computation Logic
Deterministic and non-AI:
- Rating signals from visible low labels (SME/NI)
- Self-review challenge text signals
- Low progress signals (for example progress below threshold)
- Deduped and limited output list

## Known Limitation (v1)
Career pathway output is AI-generated narrative text, not a structured role graph.

## How to Disable
Set `NEXT_PUBLIC_ENABLE_GROWTH_HUB=false` in active environment config.

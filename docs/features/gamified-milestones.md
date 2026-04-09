# Gamified Milestones
One-line description: Celebrates employee progress thresholds and check-in consistency with persistent milestone events.

## Feature flag
- `NEXT_PUBLIC_ENABLE_GAMIFICATION`
- `true`: enable milestone creation, streak API/UI, toast stack, and inline celebrations.
- `false`: all milestone/streak endpoints return safe empty defaults and UI remains non-gamified.

## New collection
- `milestone_events`
- Attributes: `userId`, `milestoneType`, `referenceId`, `cycleId`, `cycleStreak`, `triggeredAt`, `acknowledged`, `createdAt`

## New API routes
- `GET /api/milestones`: Returns latest unacknowledged milestones for current employee.
- `PATCH /api/milestones`: Acknowledges milestone IDs owned by current employee.
- `GET /api/milestones/streak`: Returns `{ streak, cycleNames }` for current employee.
- `GET /api/gamification/events`: Legacy-compatible milestone feed for UI consumers.
- `GET /api/gamification/streak`: Legacy-compatible streak endpoint for dashboard consumers.

## New components
- `src/components/ui/MilestoneToast.tsx`
- `src/components/patterns/MilestoneToastStack.tsx`
- `src/components/ui/StreakBadge.tsx`

## Modified files
- `lib/milestones.js`: Milestone constants/messages and non-throwing helper logic.
- `scripts/appwrite-schema-sync.mjs`: Registers `milestone_events` schema and indexes.
- `lib/appwrite.js`: Adds milestone collection ID + gamification flag exports.
- `app/api/progress-updates/route.js`: Creates progress milestones on threshold crossing.
- `app/api/check-ins/[checkInId]/route.js`: Creates completion/streak milestones on transition.
- `app/api/milestones/route.js`: Employee milestone fetch + acknowledge route.
- `app/employee/layout.tsx`: Mounts global milestone toast stack for employee shell.
- `app/employee/page.tsx`: Adds streak KPI card and streak fetch wiring.
- `app/employee/progress/page.tsx`: Adds inline post-submit milestone celebration.

## Milestone types reference
| Type | Threshold | Message |
|---|---:|---|
| `progress_25` | 25% | Great start! |
| `progress_50` | 50% | Halfway there! |
| `progress_75` | 75% | Almost there! |
| `progress_100` | 100% | Goal Achieved! |
| `checkin_completed` | n/a | Check-in done! |
| `streak_2` | 2 cycles | On a roll! |
| `streak_3` | 3 cycles | 3-Quarter Streak! |
| `streak_5` | 5 cycles | 5-Quarter Legend! |
| `streak_10` | 10 cycles | 10-Quarter Icon! |

## Streak logic
- Fetch closed cycles ordered by latest end date.
- For each closed cycle, require at least one completed check-in date inside cycle start/end window.
- Stop counting at first closed cycle with no completed check-in.

## Known limitation
- Streak only counts `COMPLETED` check-ins in `CLOSED` cycles.

## Disable without code change
- Set `NEXT_PUBLIC_ENABLE_GAMIFICATION=false` and restart the app process.

# Dual Reporting — Sprint Plan

**Status:** Planned (not yet in development)
**Scope:** Data model change + full feature across employee, manager, and HR surfaces

---

## What It Is

An employee can report to two managers simultaneously, each assigned a weight that sums to 100%.

```
Employee → Manager A (60%) + Manager B (40%)
```

Both managers independently review the same goals and give ratings. The final rating is the weighted average.

```
Manager A rating: 4  →  4 × 0.60 = 2.40
Manager B rating: 3  →  3 × 0.40 = 1.20
Final rating: 3.60
```

---

## Current State (what exists today)

Every user document has a single `managerId: string` field. Goals, check-ins, meetings, and meet-requests all reference this single `managerId`. Team queries (`getManagerTeamEmployeeIds`) resolve the manager's team by filtering `users` where `managerId == <managerId>`.

Affected collections (from `scripts/appwrite-schema-sync.mjs`):
- `users` — line 79 (`managerId`, optional)
- `goals` — line 90 (`managerId`, required)
- `check_ins` — line 120 (`managerId`, required)
- `meet_requests` — lines 166, 213 (`managerId`, required)
- `progress_updates` — line 231 (`managerId`, optional)
- `rating_drop_insights` — line 507 (`managerId`, optional)

---

## Proposed Data Model

### New collection: `manager_assignments`

Replace the scattered `managerId` fields on the `users` collection with a dedicated join table. This is queryable, auditable, and allows weight changes over time.

```
manager_assignments {
  $id             string   — Appwrite document ID
  employeeId      string   — FK → users.$id
  managerId       string   — FK → users.$id
  weightPercent   integer  — 0–100 (must sum to 100 across all rows for one employee)
  isPrimary       boolean  — true for the manager with majority weight
  assignedAt      datetime
  assignedBy      string   — FK → users.$id (HR who set this)
  effectiveFrom   string   — ISO date (for future-dated reassignments)
  notes           string   — optional reason for dual reporting
}

indexes:
  idx_ma_employee     [employeeId]
  idx_ma_manager      [managerId]
  idx_ma_emp_mgr      [employeeId, managerId]  — unique constraint
```

The `managerId` on the `users` collection becomes **deprecated** — kept read-only for backwards compatibility during migration, then removed in a follow-up sprint.

### Changes to `goals` collection

Goals still carry a single `managerId` (the primary manager who created/approved the goal). What changes is the **ratings** model — goals need per-manager rating records.

Add new fields to `goals`:

```
managerRatings    string   — JSON array, serialized
                            [{ managerId, rating, ratingLabel, ratedAt, weightPercent }]
finalRating       float    — computed weighted average (written by API on completion)
finalRatingLabel  string   — "EE" | "DE" | "ME" | "SME" | "NI" derived from finalRating
ratingsComplete   boolean  — true when all assigned managers have submitted a rating
```

> Why JSON string instead of a sub-collection? Appwrite does not support nested objects as attributes. A `goal_ratings` sub-collection is the cleaner long-term option (see Alternative below), but a serialized JSON string on the goal document is faster to ship and avoids an extra collection for MVP.

**Alternative (recommended for production):**

```
goal_ratings {
  $id           string
  goalId        string   — FK → goals.$id
  managerId     string   — FK → users.$id
  weightPercent integer
  rating        integer
  ratingLabel   string
  ratedAt       datetime
  notes         string
}
```

This makes it easy to query "all goals where manager X hasn't rated yet" and keeps the goals document lean.

### Changes to `check_ins` collection

Check-ins are currently tied to one manager. With dual reporting, both managers should be able to view and comment, but only one drives the scheduled check-in.

Keep `managerId` as the **scheduling manager** (usually the primary). Add:

```
secondaryManagerId     string   — optional, set when employee has dual reporting
secondaryManagerNotes  string   — notes from the secondary manager
secondaryManagerSeenAt datetime — when secondary manager first viewed the check-in
```

---

## Migration Plan

1. **Backfill script** (`scripts/migrate-dual-reporting.mjs`):
   - Read all users where `managerId` is set
   - Create one `manager_assignments` record per user: `{ employeeId: user.$id, managerId: user.managerId, weightPercent: 100, isPrimary: true }`
   - Mark original `managerId` field as migrated (do not delete until sprint N+2)

2. **API reads**: Switch all team-scope queries from `Query.equal("managerId", managerId)` on the `users` collection to querying `manager_assignments` by `managerId`. Introduce a shared helper `getManagerTeamEmployeeIds(managerId)` that reads from `manager_assignments` — this function already exists, just update its internals.

3. **API writes**: HR assignment endpoint writes to `manager_assignments`. Validate weights sum to 100 server-side before committing.

4. **Deprecate `managerId` on users**: After all reads are migrated and tested, remove the field from new writes. Keep it for one sprint as fallback.

---

## API Changes

### New endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/manager-assignments?employeeId=` | Get all managers for an employee with weights |
| `GET` | `/api/manager-assignments?managerId=` | Get all employees under a manager |
| `POST` | `/api/manager-assignments` | HR assigns managers to employee (replaces existing assignments) |
| `PATCH` | `/api/manager-assignments/:id` | Update a single assignment's weight |
| `DELETE` | `/api/manager-assignments/:id` | Remove a manager assignment |
| `POST` | `/api/goals/:goalId/rate` | Manager submits their rating for a goal |
| `GET` | `/api/goals/:goalId/ratings` | Get all manager ratings + computed final |

### Modified endpoints

- **`GET /api/goals?scope=team`** — query `manager_assignments` for team members instead of `users.managerId`
- **`GET /api/check-ins?scope=team`** — same change
- **`POST /api/goals/:goalId/approve`** — requires both managers to approve before status moves to `approved` (or configurable: primary-only approval)
- **`POST /api/goals/:goalId/rate`** — replaces current single-manager rating flow; triggers `computeFinalRating()` after each submission
- **`GET /api/hr/managers`** (existing) — return `assignedEmployeeCount` from `manager_assignments`

### Rating computation (server-side, `lib/goals/computeFinalRating.ts`)

```typescript
function computeFinalRating(ratings: { rating: number; weightPercent: number }[]): number {
  const totalWeight = ratings.reduce((sum, r) => sum + r.weightPercent, 0);
  if (totalWeight === 0) return 0;
  const weighted = ratings.reduce((sum, r) => sum + r.rating * r.weightPercent, 0);
  return Math.round((weighted / totalWeight) * 10) / 10; // 1 decimal place
}
```

Triggered when:
- A manager submits a rating → check if all assigned managers for that employee have rated → if yes, compute and write `finalRating` + `ratingsComplete = true`

---

## UI Changes

### HR — Employee Assignment

**Where:** `app/hr/team-assignments/page.tsx` (new page) or within `app/hr/managers/[managerId]/page.tsx`

- Show current manager(s) for each employee
- "Add Manager" button → select manager from dropdown + enter weight %
- Validate: weights must sum to exactly 100% before saving
- Show warning if employee currently has no assignments after a deletion

### Manager Dashboard

- Employee rows in the heat map show a badge like **"Shared (60%)"** when the employee is a dual-report
- Clicking an employee opens a panel showing both managers and their weights
- Rating input shows: "Your weight: 60% — Other manager has [rated / not yet rated]"

### Goal Review Flow (Manager)

- When a manager opens a goal for rating, show:
  - Their own rating input
  - Read-only: other manager's rating (if submitted) — or "Pending"
  - Computed preview of final rating (updates live as they adjust their input)
- Cannot see the other manager's rating until they submit their own (prevent anchoring bias) — configurable via HR settings

### Employee View

- Profile page shows: "Reporting to: Manager A (60%), Manager B (40%)"
- Goal detail shows final rating + breakdown: "Final: 3.6 (Manager A: 4 × 60%, Manager B: 3 × 40%)"

---

## Approval Flow with Dual Reporting

Two options — HR configures per cycle:

| Mode | Behaviour |
|------|-----------|
| **Both approve** | Goal stays `submitted` until both managers approve. Either can request changes. |
| **Primary only** | Only the primary manager (higher weight) needs to approve. Secondary manager is notified and can comment. |

Default: **Primary only** (less friction for MVP). HR can switch to **Both approve** per cycle in settings.

---

## Notifications

- When HR assigns a second manager to an employee → notify both managers + employee
- When primary manager approves a goal → notify secondary manager they can now rate
- When secondary manager submits rating → trigger `computeFinalRating()` → notify employee if `ratingsComplete`
- When weights change → notify affected managers + employee

---

## Edge Cases to Handle

| Scenario | Handling |
|----------|----------|
| Weights don't sum to 100 | Blocked at API + UI validation |
| One manager leaves the company | HR must reassign weight before account deactivation. Block deactivation if open assignments exist. |
| Manager rates, then weight changes | Lock ratings once cycle is closed. Weight changes only apply to future cycles. |
| Employee moves to single manager mid-cycle | Allowed — existing ratings are preserved with their original weights. New goals use new assignment. |
| Both managers give the same goal the same rating | Fine — weighted average equals that rating regardless of weights |
| Only one manager has rated when cycle closes | HR can force-close with available ratings only. System flags the goal as `partiallyRated`. |

---

## What Does NOT Change

- Self-review flow — still per employee, independent of manager count
- Check-in scheduling — still owned by primary manager
- Goal creation — employee still selects primary manager when creating a goal
- Lineage / cascade — goal hierarchy unchanged

---

## Implementation Order (suggested sprint breakdown)

### Sprint N — Foundation
1. Create `manager_assignments` collection in Appwrite schema sync
2. Write and run backfill migration script
3. Update `getManagerTeamEmployeeIds()` to read from `manager_assignments`
4. New HR assignment UI (add/remove managers with weights, validation)
5. `GET /api/manager-assignments` endpoints

### Sprint N+1 — Rating Flow
1. Add `managerRatings` / `goal_ratings` collection to goals
2. `POST /api/goals/:goalId/rate` + `computeFinalRating()`
3. Manager rating UI update (per-manager input + live preview)
4. Employee goal detail — show final rating breakdown
5. Notifications for dual-report events

### Sprint N+2 — Cleanup
1. Remove deprecated `managerId` field from `users` collection
2. HR settings: configure approval mode (primary-only vs both-approve)
3. Reporting / download: include both managers + weights in the XLSX export

---

## Files To Create / Modify (reference)

| File | Action |
|------|--------|
| `scripts/appwrite-schema-sync.mjs` | Add `manager_assignments` collection + `goal_ratings` collection |
| `scripts/migrate-dual-reporting.mjs` | New backfill script |
| `lib/goals/computeFinalRating.ts` | New utility |
| `app/api/manager-assignments/route.js` | New CRUD endpoints |
| `app/api/goals/[goalId]/rate/route.js` | New rating endpoint |
| `app/api/goals/[goalId]/ratings/route.js` | New ratings fetch |
| `app/employee/_lib/pmsClient.ts` | Add `fetchManagerAssignments()`, `submitGoalRating()` |
| `app/hr/team-assignments/page.tsx` | New page |
| `app/manager/page.tsx` | Show shared-employee badge in heat map |
| `app/manager/team-goals/page.tsx` | Per-manager rating inputs |
| `app/employee/goals/page.tsx` | Final rating breakdown display |

# Rating Drop Analysis - Feature Definition

## Objective
Detect employees whose final rating has dropped significantly between two consecutive closed performance cycles.

Significant drop rule:
- A drop is significant when `previousRating - currentRating > 1`.
- Examples: `4 -> 2`, `3 -> 1` are significant.

## Trigger
The analysis is triggered only after a cycle is successfully marked as `closed`.

Trigger source:
- HR cycle closure flow at `app/api/hr/cycles/[cycleId]/close/route.js`.

Trigger behavior:
- Must execute asynchronously after cycle closure writes succeed.
- Must be non-blocking for API response.
- Must never fail cycle closure if analysis fails.

Recommended invocation pattern:
- Fire-and-forget call from the cycle close handler.
- Catch and log failures inside the async task.

## Scope
Input cycle:
- `cycleId` (closed cycle being analyzed).

Population:
- Employees with a computed current-cycle rating for the specified closed cycle.

Comparison basis:
- Current cycle rating from the closed cycle.
- Previous cycle rating from the most recent prior closed cycle for the same employee.

## Data Shape
Persist one insight record per employee per analyzed cycle when both ratings are available.

```ts
type RatingDropInsightRecord = {
  employeeId: string;
  managerId?: string | null; // added for manager-level dashboard filtering
  cycleId: string;
  previousRating: number;
  currentRating: number;
  drop: number; // previousRating - currentRating
  riskLevel: "HIGH RISK" | "MODERATE";
  createdAt: string; // ISO-8601

  // Forward-compatible fields for AI explanation layer
  explanationStatus?: "not_requested" | "queued" | "generated" | "failed";
  explanationId?: string | null;
};
```

Notes:
- Required output fields from request are included: `employeeId`, `previousRating`, `currentRating`, `drop`, `riskLevel`, `cycleId`, `createdAt`.
- `managerId` is additionally stored for manager-scope filtering.
- `createdAt` is the insight generation time, not cycle close time.

## Function Contract

```ts
type AnalyzeRatingDropResult = {
  cycleId: string;
  processedEmployees: number;
  recordsWritten: number;
  significantDrops: number;
  skippedMissingPrevious: number;
  failedEmployees: number;
  startedAt: string;
  finishedAt: string;
};

async function analyzeRatingDrop(cycleId: string): Promise<AnalyzeRatingDropResult>;
```

Contract requirements:
- Validates that `cycleId` is non-empty.
- Confirms cycle state is `closed`; if not closed, exits safely with zero writes.
- Reads current cycle rating per employee.
- Reads previous closed cycle rating per employee.
- Computes `dropAmount = previousRating - currentRating`.
- Marks significant drop when `dropAmount > 1`.
- Persists analysis record with required fields and timestamp.
- Continues processing other employees if one employee fails.
- Returns a summary object for observability.

Error behavior:
- Throws for unrecoverable setup/runtime errors when called directly.
- When invoked from cycle closure flow, caller must isolate errors so closure response is unaffected.

## Processing Rules
1. Resolve employee list from current cycle score source (do not recalculate ratings).
2. For each employee, fetch:
   - current rating in `cycleId`
   - previous rating from immediate previous closed cycle
3. If previous rating is missing, skip employee and increment `skippedMissingPrevious`.
4. Write one record with computed drop metadata.
5. Count significant drops where `dropAmount > 1`.

## Non-Functional Constraints
- Do not modify existing rating calculation logic.
- Do not block cycle closure API path.
- Must be async and non-blocking.
- Must be idempotent for the same `cycleId` and `employeeId` (upsert or deterministic overwrite recommended).
- Must support future AI explanation enrichment without schema migration risk.

## Suggested Persistence Keys
To keep reruns safe:
- Unique key recommendation: `(cycleId, employeeId)`.
- Upsert behavior recommendation: overwrite computed fields and refresh `timestamp`.

## Integration Guidance (Non-breaking)
In cycle close handler:
- Keep existing closure and visibility logic unchanged.
- After successful close response data is ready, invoke analysis in background:
  - `void analyzeRatingDrop(cycleId).catch(logError)`
- Do not await analysis before returning close response.

This preserves current behavior while adding post-close intelligence.
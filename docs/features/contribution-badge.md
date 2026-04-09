# Contribution Badge

Contribution Badge visualizes how an individual goal connects upward to team and business targets.
It provides deterministic lineage context (badge, chain, summary) across employee and manager surfaces.

## Files Added
- `lib/goalContribution.js`
- `src/components/ui/ContributionBadge.tsx`
- `src/components/patterns/GoalLineageCard.tsx`
- `docs/features/contribution-badge.md`

## Files Modified
- `app/api/goals/[goalId]/lineage/route.js`
- `app/api/goals/lineage/route.js`
- `app/api/goals/[goalId]/cascade/route.js`
- `app/api/goals/for-employee/route.js`
- `app/employee/_lib/pmsClient.ts`
- `app/employee/goals/page.tsx`
- `app/employee/page.tsx`
- `app/manager/team-goals/page.tsx`
- `app/manager/approvals/page.tsx`
- `src/components/patterns/GoalLineageView.tsx`
- `src/components/patterns/index.ts`
- `src/components/ui/index.ts`
- `lib/appwrite.js`
- `scripts/appwrite-schema-sync.mjs`
- `.env`

## New API Endpoint
- `GET /api/goals/[goalId]/lineage`

## Feature Flag
- `NEXT_PUBLIC_ENABLE_CONTRIBUTION_BADGE=true`

## LineageRef Requirement
- For chain resolution to work, child goals must persist `lineageRef` to the direct parent goal id.
- Cascade flow now writes `lineageRef = parentGoalId` with schema-compat fallback.

## Known Limitation (v1)
- Chain accuracy depends on cascade-created linkage.
- Goals created/edited outside cascade without valid `lineageRef` are treated as standalone.

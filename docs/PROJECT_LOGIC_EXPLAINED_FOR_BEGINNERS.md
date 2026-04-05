# HR Console - Beginner Friendly Project Explanation

This guide is written so you can explain the project to someone who is new to the codebase.

## 1. One-line summary

HR Console is a role-based performance management application where employees set goals, managers and leadership coach and approve, and HR monitors fairness and cycle closure.

## 2. Think of the app as 3 layers

### Layer 1: Screens users interact with
- Landing, Login, Onboarding
- Employee workspace
- Manager workspace
- HR workspace
- Leadership workspace

### Layer 2: Frontend data helpers
- A shared client file sends all API requests:
  - [app/employee/_lib/pmsClient.ts](../app/employee/_lib/pmsClient.ts)

### Layer 3: Server APIs and database operations
- Route handlers in [app/api](../app/api)
- Auth and role checks in [lib/serverAuth.js](../lib/serverAuth.js)
- Appwrite database/storage access in [lib/appwriteServer.js](../lib/appwriteServer.js)

## 3. How users enter the app

### 3.1 Login flow
1. User opens [app/login/page.jsx](../app/login/page.jsx).
2. Clicks Continue with Google.
3. OAuth callback lands at [app/auth/callback/page.jsx](../app/auth/callback/page.jsx).
4. Callback calls `/api/auth/session` to create server session cookies.
5. App asks `/api/auth/redirect` where user should go based on role.
6. User lands on employee, manager, hr, leadership dashboard, or onboarding.

### 3.2 Why middleware exists
- Middleware checks access before pages load.
- If user has no session for protected routes, it redirects to login.
- If user tries wrong role route, it redirects to correct role route.

File: [middleware.ts](../middleware.ts)

## 4. What each role does

### Employee
- Create and edit own goals
- Submit goals for approval
- Add progress updates
- Schedule and track check-ins
- View timeline and statuses

### Manager
- Do own goals/check-ins/progress
- View team progress and check-ins
- Approve or request changes for submitted team goals

### HR
- Monitor manager and team performance
- Review check-in governance queue
- Close cycle and reveal ratings

### Leadership
- Manage manager hierarchy and team assignment structure
- Monitor manager and team performance
- Approve team goals/check-ins within hierarchy scope

## 5. The most important object in the system: Goal

A goal has:
- owner employee
- approving manager
- cycle id
- framework type (OKR/MBO/HYBRID)
- weightage (contribution)
- status (draft/submitted/approved/needs_changes/closed)
- optional final rating details

Goal lifecycle:
1. draft
2. submitted
3. approved or needs_changes
4. closed

Key rule:
- Total goal weightage inside a cycle cannot exceed 100.

## 6. End-to-end logic example: create goal

1. Employee fills form in [app/employee/goals/page.tsx](../app/employee/goals/page.tsx).
2. Page calls createGoal in pmsClient.
3. pmsClient posts to `/api/goals`.
4. API authenticates and checks role.
5. API validates fields and total cycle weightage.
6. API normalizes cycle id and resolves manager mapping.
7. API writes draft goal to Appwrite.
8. UI refreshes goal list and shows success message.

If validation fails, UI shows error alert.

## 7. What approvals actually do

Approval endpoint: [app/api/approvals/route.js](../app/api/approvals/route.js)

When manager or leadership submits decision:
- validates decision type
- ensures goal is still submitted
- prevents manager self-approval
- updates goal status
- stores approval history row

HR remains monitor-only for goals/check-ins approvals.

So approval is not just status update, it is also audit logging.

## 8. Check-ins and ratings in simple words

### Check-ins
- Created only for approved goals.
- Max 5 check-ins per goal.
- Can include notes, transcript text, and attachments.

### Final check-in
- Manager can mark final check-in and assign rating 1 to 5.
- System writes rating to goal final rating fields.
- System computes weighted cycle score.

### Visibility rule
- Employees do not see final ratings until HR closes cycle.

## 9. Why cycle close is powerful

Endpoint: [app/api/hr/cycles/[cycleId]/close/route.js](../app/api/hr/cycles/[cycleId]/close/route.js)

When HR closes a cycle:
1. Finds approved and closed goals in that cycle.
2. Computes employee cycle scores.
3. Marks ratings as visible.
4. Updates cycle state to closed.

This is the switch from private manager evaluation to visible final outcome.

## 10. Team assignment logic

There are two mapping layers:
- employee -> manager
- manager -> parent manager

Endpoints:
- [app/api/team-assignments/route.js](../app/api/team-assignments/route.js)
- [app/api/manager-assignments/route.js](../app/api/manager-assignments/route.js)

Why this matters:
- Determines who can see what.
- Determines who can approve what.
- Preserves hierarchy boundaries and approval routing.

## 11. AI features explained simply

### AI chat
- Endpoint: `/api/ai/chat`
- Gives role-aware assistant responses.
- Streams output to UI.

### AI goal suggestion
- Endpoint: `/api/ai/goal-suggestion`
- Generates structured goal suggestions.
- Has usage cap per user per cycle.

### AI check-in summary
- Endpoint: `/api/ai/checkin-summary`
- Turns raw notes into highlights/blockers/actions.
- Also capped per user per cycle.

Usage cap tracking file:
- [app/api/ai/_lib/aiUsage.js](../app/api/ai/_lib/aiUsage.js)

## 12. Core helper files you should know first

- [lib/serverAuth.js](../lib/serverAuth.js): auth and role guard foundation.
- [lib/teamAccess.js](../lib/teamAccess.js): manager subtree, leadership scope, and HR monitoring checks.
- [lib/finalRatings.js](../lib/finalRatings.js): score persistence and visibility toggles.
- [lib/ratings.js](../lib/ratings.js): rating math and labels.
- [lib/cycle.js](../lib/cycle.js): cycle id and check-in code generation.
- [services/authService.js](../services/authService.js): frontend auth operations.

## 13. How to explain this project in an interview or handover

Use this script:

"The app is a role-based PMS with strict middleware and API-level authorization. Employees create and submit goals, managers and leadership review and coach through check-ins, and HR monitors governance and closes cycles. The frontend uses a shared API client, while route handlers enforce business constraints such as cycle weightage limits, status transition rules, and visibility gating for final ratings. AI features assist writing and summarization with usage caps tracked per cycle. Closing a cycle computes final scores and makes ratings visible." 

## 14. If you want to learn the code quickly

Read in this order:
1. [middleware.ts](../middleware.ts)
2. [services/authService.js](../services/authService.js)
3. [lib/serverAuth.js](../lib/serverAuth.js)
4. [app/employee/_lib/pmsClient.ts](../app/employee/_lib/pmsClient.ts)
5. [app/api/goals/route.js](../app/api/goals/route.js)
6. [app/api/check-ins/route.js](../app/api/check-ins/route.js)
7. [app/api/approvals/route.js](../app/api/approvals/route.js)
8. [app/api/hr/cycles/[cycleId]/close/route.js](../app/api/hr/cycles/[cycleId]/close/route.js)

After this sequence, the rest of the codebase becomes much easier to understand.

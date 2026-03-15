## Employee PMS MVP Review Plan

This document captures the employee-first implementation plan using Appwrite backend and Next.js server APIs.

### Current Implementation Status (2026-03-15)
- Completed: Phase 1 Appwrite setup baseline (collections, indexes, bucket, env wiring).
- Completed: Core Phase 2 and Phase 3 workflows for employee goals, approvals, check-ins, progress, timeline, and role-protected APIs.
- Completed: Phase 4 basic AI assistance.
	- Goal suggestion endpoint with explainability metadata.
	- Check-in summary endpoint with explainability metadata.
	- Per-user, per-cycle usage cap enforcement and tracking via ai_events.
	- Manager check-ins UI integration for AI summary generation.
- Completed: Phase 5 quality gates.
	- Route protection and role checks on active APIs.
	- Loading, empty, and error states on core employee/manager pages.
	- Lint clean and production build successful.
- Completed: Check-in completion enhancement.
	- Employee can mark a planned check-in as final for a goal.
	- Manager must provide a 1-5 rating when completing a final check-in.
	- Server-side validation added for final-check-in rating requirements.
- Remaining: manual workflow QA pass with real seeded data and cross-role access validation in live-like environment.
- Remaining: add Appwrite check_ins attributes managerRating (integer) and ratedAt (datetime) in environments where schema is not yet updated.

### Scope for this MVP
- Include: employee goals, manager approval, check-ins, progress tracking, basic AI assistance.
- Exclude for now: Google Calendar/Meet integration, full review/rating engine, HR/leadership advanced analytics.

### Phase 1: Appwrite Setup
1. Create/extend collections:
- users
- goals
- goal_approvals
- check_ins
- progress_updates
- goal_cycles
- ai_events
2. Create storage bucket for check-in/progress proof attachments.
3. Add indexes for employee and manager queries.
4. Configure role/document permissions:
- Employee: own docs
- Manager: direct-report docs + approval writes
- HR: broad read (governance)
5. Seed baseline data:
- One active cycle
- Manager-employee mappings
- Framework options (OKR/MBO/Hybrid)

### Phase 2: Backend API Layer
1. Build Next.js server APIs/server actions for:
- Goal create/edit/submit/list
- Approval list/approve/reject
- Check-in create/list
- Progress update/list
2. Add strict server-side validation and authorization.
3. Add audit fields on writes.

### Phase 3: Employee Frontend
1. Replace employee dashboard placeholder with:
- Cycle summary
- Progress snapshot
- Pending actions
- Next check-in
2. Add goal workspace with conversational drafting UX and inline edits.
3. Add single vertical lifecycle timeline:
- Goal Creation
- Goal Approval
- Check-ins
- Review (locked placeholder)
- Cycle Closed
4. Add check-in page with manual scheduling and attachments.
5. Add progress visuals and status chips.

### Phase 4: Basic AI Assistance
1. Add AI suggestion endpoints for:
- Goal suggestion
- Check-in summary suggestion
2. Track/cap usage per user per cycle in ai_events.
3. Keep human decision control: Accept/Edit/Regenerate.
4. Return simple explainability metadata.

### Phase 5: Hardening and QA
1. Add route protection for role/auth.
2. Add loading/empty/error states.
3. Verify role-based access restrictions.
4. Run lint/build and complete manual workflow QA.

### Appwrite Action Checklist
1. Collections and attributes:
- users: managerId, domain, businessUnit, designation
- goals: employeeId, managerId, cycleId, frameworkType, title, description, weightage, status, progressPercent, dueDate, lineageRef, aiSuggested, timestamps
- goal_approvals: goalId, managerId, decision, comments, decidedAt
- check_ins: goalId, employeeId, managerId, scheduledAt, status, notes, transcriptText, isFinalCheckIn, managerRating, ratedAt
- progress_updates: goalId, employeeId, percentComplete, ragStatus, updateText, attachmentIds, createdAt
- goal_cycles: name, periodType, startDate, endDate, state
- ai_events: userId, featureType, cycleId, requestCount, lastUsedAt, metadata
2. Storage bucket for attachments with size/type limits.
3. Indexes:
- goals(employeeId, cycleId, status)
- goals(managerId, status)
- goal_approvals(managerId, decision)
- check_ins(employeeId, scheduledAt)
- progress_updates(goalId, createdAt)
4. Secrets/env:
- endpoint, project id, database id, bucket id, server key for trusted server routes.

### Verification Criteria
1. Employee creates and submits goals.
2. Manager approves/rejects and status reflects for employee.
3. Employee logs check-ins and progress with optional proof attachments.
4. Timeline node state transitions correctly.
5. AI usage cap and logging work.
6. Unauthorized cross-user access fails.

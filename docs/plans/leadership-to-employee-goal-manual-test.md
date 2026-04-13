# Leadership to Employee Goal Flow Manual Test Guide

## 1. Purpose
This guide helps you manually test the full goal lifecycle across roles, from leadership and manager planning to employee execution, manager approvals, and leadership verification.

## 2. Scope
Roles covered:
- Leadership
- Manager
- Employee
- HR (final visibility verification)

Core flow covered:
- Goal setup and cascade
- Employee goal submission
- Manager approval and rework loop
- Employee check-in upload and manager completion
- Self-review gating and submission
- Manager final rating
- Leadership overview verification

## 3. Preconditions
Complete these before starting test execution.

### 3.1 Environment
- App is running and reachable in browser.
- Active performance cycle exists (example: Q2-2026).
- Appwrite schema is up to date.
- Feature flags needed for goal lineage and related UI are enabled if used in your environment.

### 3.2 Test Users
Prepare at least these users:
- 1 leadership user
- 1 manager user
- 1 employee user mapped to that manager
- 1 HR user

### 3.3 Relationship Setup
- Employee reports to manager.
- Manager appears in leadership reporting tree.

### 3.4 Data State
- Employee has no conflicting draft/submitted goals for the same test objective.
- You have one unique naming prefix for test records (example: MANUAL-E2E-2026-04-14).

## 4. Execution Rules
- Run phases in order.
- Capture evidence for each expected result (screenshot and/or API payload).
- Mark each test step as PASS or FAIL.
- If one step fails, log defect and continue where possible.

## 5. Test Run Metadata
Fill this before execution.

- Run date:
- Environment:
- Build or commit:
- Tester:
- Leadership user:
- Manager user:
- Employee user:
- HR user:
- Active cycle:

## 6. Phase A - Leadership and Manager Goal Setup + Cascade

### A1. Manager creates parent goal
Precondition:
- Manager is logged in.

Action:
- Go to /manager/goals.
- Create a new manager goal with title prefix MANUAL-E2E.
- Set weightage and cycle.

Expected UI Result:
- Goal appears in manager goal list with status draft.

Data or API Check:
- Verify record created through manager goals listing endpoint.
- Capture goalId for downstream tests.

Result:
- PASS/FAIL
- Evidence:

### A2. Manager submits parent goal
Precondition:
- Parent goal is in draft.

Action:
- Submit the parent goal.

Expected UI Result:
- Status changes from draft to submitted.

Data or API Check:
- Verify status is submitted for goalId.

Result:
- PASS/FAIL
- Evidence:

### A3. Manager approves or finalizes parent goal if required by your flow
Precondition:
- Parent goal is submitted.

Action:
- Complete the required manager-side approval step for own/team goal governance if your tenant enforces it.

Expected UI Result:
- Parent goal is in state allowed for team distribution.

Data or API Check:
- Confirm current status supports cascade action.

Result:
- PASS/FAIL
- Evidence:

### A4. Manager cascades goal to employee
Precondition:
- Parent goal is distributable.

Action:
- Use Distribute to Team on /manager/goals.
- Select test employee.
- Use equal or custom split contribution percent.
- Confirm action.

Expected UI Result:
- Success message shown.
- Child goal appears for selected employee.

Data or API Check:
- Child goal has reference to parent lineage.
- Contribution percent stored for child goal.

Result:
- PASS/FAIL
- Evidence:

## 7. Phase B - Employee Receives and Submits Goal

### B1. Employee verifies cascaded goal visibility
Precondition:
- Cascade action completed.

Action:
- Log in as employee and open /employee/goals.

Expected UI Result:
- Cascaded goal is visible with lineage or parent context.

Data or API Check:
- Goal appears in employee goal list for current cycle.

Result:
- PASS/FAIL
- Evidence:

### B2. Employee updates goal details (if editable)
Precondition:
- Goal is editable in current state.

Action:
- Edit allowed fields such as description, milestones, or timeline.
- Save changes.

Expected UI Result:
- Save confirmation shown and updated values persist.

Data or API Check:
- Fetch goal again and verify updated values.

Result:
- PASS/FAIL
- Evidence:

### B3. Employee submits goal
Precondition:
- Goal is in draft or needs_changes.

Action:
- Submit goal from employee goals page.

Expected UI Result:
- Status updates to submitted.

Data or API Check:
- Submit endpoint confirms status transition.

Result:
- PASS/FAIL
- Evidence:

## 8. Phase C - Manager Approval and Rework Loop

### C1. Manager approves employee goal
Precondition:
- Employee goal status is submitted.

Action:
- Log in as manager and open /manager/approvals.
- Approve employee goal with comments.

Expected UI Result:
- Goal moves out of pending queue.
- Decision confirmation displayed.

Data or API Check:
- Approval record exists.
- Goal status is approved.

Result:
- PASS/FAIL
- Evidence:

### C2. Rework path (needs changes)
Precondition:
- Use a second test goal or repeat with controlled status reset.

Action:
- Manager marks goal as needs changes.
- Employee updates and resubmits.
- Manager approves.

Expected UI Result:
- Correct round-trip status transitions are visible in both role views.

Data or API Check:
- Sequence should follow submitted -> needs_changes -> submitted -> approved.

Result:
- PASS/FAIL
- Evidence:

## 9. Phase D - Employee Check-In Upload + Manager Completion

### D1. Employee uploads check-ins
Precondition:
- Approved goal exists for employee.

Action:
- Open /employee/check-ins.
- Use template flow if provided.
- Upload check-in file, run preview, then commit.

Expected UI Result:
- Preview succeeds and commit success message is shown.

Data or API Check:
- Check-in records are created with expected initial status.

Result:
- PASS/FAIL
- Evidence:

### D2. Manager completes or approves check-ins
Precondition:
- Employee check-ins are present for manager team.

Action:
- Open /manager/team-check-ins.
- Select employee check-ins and run manager approval/completion action.

Expected UI Result:
- Check-ins move to completed state.

Data or API Check:
- Check-in status updates and audit fields are stored.

Result:
- PASS/FAIL
- Evidence:

### D3. Final check-in gate preparation
Precondition:
- At least one check-in is eligible to be marked final.

Action:
- Ensure one completed check-in is treated as final check-in for the goal in this cycle.

Expected UI Result:
- Goal timeline reflects final check-in completion.

Data or API Check:
- Final check-in marker fields are present as expected.

Result:
- PASS/FAIL
- Evidence:

## 10. Phase E - Employee Self-Review Eligibility and Submission

### E1. Verify self-review is blocked before final check-in (negative)
Precondition:
- Use a goal without completed final check-in.

Action:
- Try to open or submit self-review for that goal.

Expected UI Result:
- Self-review action is hidden or blocked with clear message.

Data or API Check:
- API rejects submission until final check-in requirement is met.

Result:
- PASS/FAIL
- Evidence:

### E2. Submit self-review after gate is satisfied
Precondition:
- Goal has completed final check-in.

Action:
- Submit self-review content for goal.

Expected UI Result:
- Submission success and self-review status shown.

Data or API Check:
- Self-review record exists with submitted state and linked goal/cycle.

Result:
- PASS/FAIL
- Evidence:

## 11. Phase F - Manager Final Rating + Employee Visibility

### F1. Manager rates goal
Precondition:
- Goal is in state that allows final rating.

Action:
- Open /manager/team-goals (or rating view used in your tenant).
- Submit final rating for employee goal.

Expected UI Result:
- Rating saved confirmation shown.

Data or API Check:
- Rating fields stored on rating document and/or goal record.

Result:
- PASS/FAIL
- Evidence:

### F2. Employee visibility check
Precondition:
- Rating exists.

Action:
- Log in as employee and inspect goal rating visibility.

Expected UI Result:
- Rating visibility follows cycle policy (hidden before release, visible after release).

Data or API Check:
- Visibility flag behavior matches expected cycle state.

Result:
- PASS/FAIL
- Evidence:

## 12. Phase G - Leadership Outcome Verification

### G1. Leadership dashboard aggregation
Precondition:
- Prior phases completed with test data.

Action:
- Log in as leadership and open /leadership/overview.

Expected UI Result:
- Aggregate cards and charts reflect the goal/check-in updates from this run.

Data or API Check:
- Leadership overview API reflects updated counts, completion rates, and risk indicators.

Result:
- PASS/FAIL
- Evidence:

### G2. Trace sample employee goal lineage to top-level objective
Precondition:
- Cascaded goal exists.

Action:
- Inspect lineage view from employee or manager side.

Expected UI Result:
- Parent-to-child linkage and contribution context are visible.

Data or API Check:
- Lineage endpoint returns chain including parent goal reference.

Result:
- PASS/FAIL
- Evidence:

## 13. Negative and Edge Case Checklist

### N1. Duplicate cascade prevention
Action:
- Attempt cascading the same parent goal again to same employee in same context.

Expected:
- Operation blocked or conflict response returned.

### N2. Unauthorized role access
Action:
- Try accessing manager-only approval actions with employee session.

Expected:
- Access denied or redirect.

### N3. Invalid check-in import payload
Action:
- Upload malformed check-in file.

Expected:
- Preview or commit fails with clear validation message.

### N4. Self-review gate bypass attempt
Action:
- Attempt direct self-review submission API call before final check-in completion.

Expected:
- API rejection and no record creation.

### N5. Rating visibility timing
Action:
- Verify employee cannot see final rating before release condition.

Expected:
- Rating remains hidden until policy condition is met.

## 14. Traceability Matrix

| Test Area | UI Route | Primary API Family | Key Validation |
|---|---|---|---|
| Goal create and submit | /manager/goals, /employee/goals | /api/goals, /api/goals/[goalId]/submit | Correct status transitions |
| Goal approvals | /manager/approvals | /api/approvals | submitted -> approved or needs_changes |
| Goal cascade | /manager/goals | /api/goals/cascade, /api/goals/[goalId]/cascade | Parent-child lineage and contribution percent |
| Employee check-ins | /employee/check-ins | /api/check-ins/import/* | Preview and commit integrity |
| Manager check-in completion | /manager/team-check-ins | /api/check-ins/manager-approvals | planned -> completed updates |
| Self-review | Employee goal detail/timeline | /api/self-review | Blocked before final check-in, allowed after |
| Final rating | /manager/team-goals | /api/goals/[goalId]/rate | Rating stored and policy-based visibility |
| Leadership validation | /leadership/overview | /api/leadership/overview | Aggregated KPI correctness |

## 15. Defect Logging Template
Use this format for each failure.

- Defect ID:
- Test Case ID:
- Role:
- Route:
- API endpoint (if known):
- Steps to reproduce:
- Expected:
- Actual:
- Severity:
- Evidence links:
- Notes:

## 16. Exit Criteria
The manual run is complete when:
- All mandatory phases A to G are executed.
- No Critical or High defects remain open for core flow.
- Leadership to employee goal lineage and approval lifecycle is validated end to end.

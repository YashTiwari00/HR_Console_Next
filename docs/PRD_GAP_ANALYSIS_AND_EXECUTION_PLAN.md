# HR Console PRD Gap Analysis and Execution Plan

## 1. Purpose of This Document

This document compares:

- Current implementation intent in `docs/PROJECT_LOGIC_COMPLETE_GUIDE.md`
- Target product direction in `docs/master-prd.md`

It defines:

- What is already aligned
- What is missing or partial
- What to build first (priority order)
- How to implement each major change safely
- Suggested production-grade features that improve adoption and decision quality

This is a planning artifact only. No code changes are proposed here.

Companion planning documents:

- `docs/PRD_EXECUTIVE_DECISION_BRIEF.md` (leadership and product decision layer)
- `docs/PRD_ENGINEERING_EXECUTION_PLAYBOOK.md` (ticket-ready build and production readiness layer)

---

## 2. Comparison Method

The comparison was done requirement-by-requirement across these dimensions:

1. Role model and visibility
2. Goal framework and lifecycle
3. AI capabilities and explainability
4. Check-ins and meeting intelligence
5. Ratings, calibration, and analytics
6. UX paradigm (timeline-first, conversational)
7. Notifications, governance, and compliance
8. Decision-intelligence and leadership surfaces

Status labels used:

- **Implemented**: clearly present in current guide
- **Partial**: some support exists, but target PRD behavior is incomplete
- **Missing**: not present or not evidenced in current guide

---

## 3. Executive Summary

### 3.1 Strongly Aligned Areas

The project already has a strong operational base:

- Multi-role PMS architecture (employee, manager, hr, leadership)
- Robust role-based API authorization and route protection
- Core lifecycle support (goals, approvals, progress, check-ins, final ratings, cycle close)
- Google Calendar / Meet integration for scheduling flows
- AI features with usage caps and chatbot foundation
- Cycle-close visibility toggle for employee rating release

### 3.2 Primary Gaps Against Master PRD

The biggest product gaps are in higher-order intelligence and experience:

1. No dedicated **Leadership Command Center** persona and aggregated decision cockpit
2. No true **single lifecycle timeline UX** as the primary cross-stage interaction model
3. Limited **framework engine** (currently OKR/MBO/HYBRID; PRD asks broader configurable frameworks)
4. No mature **goal cascading + lineage graph** (manager-to-team allocation and business linkage clarity)
5. Missing **decision explainability model** (confidence, factors, time window)
6. No full **notifications and nudge engine** (admin-scheduled reminders and lifecycle nudges)
7. Missing **calibration and bias workflows** for HR and leadership decisions
8. Missing **bulk goal import** (sheet/excel ingestion)
9. Missing **additional reviewer / matrix reporting** support
10. Missing explicit **compliance, audit depth, and governance dashboards** expected in PRD

### 3.3 Recommendation

Build in three waves:

- **Wave 1 (Foundation, P0/P1)**: Timeline UX, framework configurability, notifications, lineage baseline
- **Wave 2 (Intelligence, P1)**: Explainable AI decisions, calibration, trajectory and risk insights, leadership dashboard
- **Wave 3 (Scale, P2)**: Matrix reviewers, import pipelines, succession and 9-box, advanced governance

---

## 4. Requirement Coverage Matrix

| PRD Capability | Current Status | Notes |
|---|---|---|
| Multi-role PMS core lifecycle | Implemented | Strong foundation across employee/manager/hr/leadership |
| Leadership persona and command center | Partial | Leadership role surfaces exist; command-center depth still needs expansion |
| Single vertical timeline UX as core interaction | Partial | Timeline pages exist, but lifecycle still split across modules |
| Conversational goal setup flow | Partial | AI goal suggestion exists, but form-led flow dominates |
| Multi-framework engine (OKR/MBO/BSC/Competency/Hybrid) | Partial | Current supports OKR/MBO/HYBRID only |
| Framework recommendation by role/domain | Missing | No documented recommendation engine |
| Goal cascading (drag/drop allocation) | Missing | Team assignment exists, but no cascading allocator UX |
| Goal lineage view to business objective | Partial | `lineageRef` exists, no complete graph/view with contribution logic |
| Goal drift detection | Missing | No drift alerts/audit timeline behavior documented |
| AI check-in agenda and coaching quality scoring | Partial | AI summary exists; no manager coaching score/tone feedback loop |
| Auto transcript intelligence pipeline | Partial | Transcript field exists; automated ingestion/structuring not fully defined |
| Explainable AI recommendations (factors/confidence/window) | Missing | Not yet modeled in response contracts |
| Stack ranking and hidden employee visibility controls | Partial | Some manager views; PRD-level calibrated ranking workflow not detailed |
| Calibration workflows and bias detection | Missing | Not in current feature map |
| Notifications and nudges engine | Missing | No scheduling/templating/dispatch service documented |
| AI usage governance with visible counters and audit | Partial | AI usage capping exists; user-facing counters and governance views unclear |
| Additional reviewer matrix model (dual reporting) | Missing | Manager/HR only in current approval system |
| Bulk goal import (sheet/excel templates) | Missing | No import endpoint/UI documented |
| Succession, 9-box, readiness pathways | Missing | Mentioned in PRD, absent in system guide |
| Security/compliance program-level controls | Partial | RBAC present; explicit GDPR/DPDP controls and audit surfaces not documented |

---

## 5. Prioritized Change Backlog (What to Do First)

## 5.1 Priority Model

- **P0**: Blocks PRD identity or trust-critical production readiness
- **P1**: High impact for adoption, quality, and managerial effectiveness
- **P2**: Strategic scale and differentiation

## 5.2 P0 Changes (Start Here)

### P0-1: Single Lifecycle Timeline Workspace

**Why first:** This is a core PRD UX principle and reduces navigation friction.

**Current gap:** Lifecycle is distributed across separate goals/progress/check-ins/reviews pages.

**Scope:**

- Create one role-aware timeline workspace per cycle
- Nodes: Goal Creation -> Goal Approval -> Check-ins -> Review -> Cycle Closed
- Each node should expand inline, show status, and expose one primary next action

**How to implement:**

1. Add timeline aggregate API that composes data from goals, approvals, progress, check-ins, cycle state.
2. Build timeline state resolver (deterministic stage + blockers + next action).
3. Introduce role-aware timeline page for employee/manager/hr.
4. Keep existing pages as deep links and fallback while adoption stabilizes.
5. Add telemetry events for node interactions and drop-off points.

**Definition of done:**

- 80% of core actions reachable from timeline without page switching
- Stage progression is deterministic and audited
- No role can perform disallowed stage transitions

---

### P0-2: Notifications and Nudge Engine

**Why first:** Prevents process stalls and improves completion rate.

**Current gap:** No centralized reminder scheduling and lifecycle nudges.

**Scope:**

- Admin/HR configurable templates and schedules
- Triggered reminders (goal pending, check-in overdue, approvals pending, review deadline)
- Digest + immediate channels (start with email)

**How to implement:**

1. Add `notification_templates`, `notification_jobs`, `notification_events` entities.
2. Add scheduler worker/cron route for due jobs.
3. Add notification policy settings UI for HR/admin.
4. Add in-app banner/toast feed backed by notification events.
5. Add suppression rules to avoid spam.

**Definition of done:**

- Deadline events automatically trigger reminders
- Delivery status is traceable by role and event
- Users can view pending actions from notifications

---

### P0-3: Goal Lineage Baseline (Employee -> Team -> Business)

**Why first:** Makes performance contribution transparent and increases trust.

**Current gap:** `lineageRef` exists but no full lineage visualization and contribution math.

**Scope:**

- Hierarchical lineage model with contribution percentage
- Visual lineage panel on goal detail
- Contribution badge and progress contribution to parent objective

**How to implement:**

1. Define parent-child goal relation schema (`parentGoalId`, `contributionPct`, `lineageLevel`).
2. Create lineage read API returning graph-safe tree.
3. Add validation to ensure child contribution totals are bounded.
4. Add lineage UI card with plain-language explanation.
5. Add fallback rendering for legacy goals lacking lineage metadata.

**Definition of done:**

- Every cascaded goal shows upstream objective path
- Contribution values reconcile to parent boundaries
- Managers can explain why a goal exists and how it maps upward

---

### P0-4: PRD-Compliant Framework Engine Expansion

**Why first:** Framework flexibility is central to PRD and enterprise fit.

**Current gap:** Only OKR/MBO/HYBRID modeled; PRD expects broader configurable frameworks.

**Scope:**

- Add Balanced Scorecard and Competency framework types
- Add HR-configurable allowed frameworks and defaults
- Add framework recommendation metadata hooks for AI

**How to implement:**

1. Extend framework enum and validation paths.
2. Add HR settings endpoint/UI for enabled frameworks by business unit.
3. Update goal creation UI with framework guidance per role/domain.
4. Backfill migration logic for existing goals with safe defaults.
5. Extend tests for framework-specific validations.

**Definition of done:**

- Framework choices are policy-driven, not hard-coded
- Existing data remains backward-compatible
- Role/domain-specific recommendation placeholders are available for AI layer

---

## 5.3 P1 Changes (Next)

### P1-1: Explainable Decision Intelligence Layer

**Gap:** AI output does not consistently expose factors, confidence, and time window.

**Build:**

- Standardize AI response envelope:
  - `recommendation`
  - `whyFactors[]`
  - `timeWindow`
  - `confidence`
  - `editableByHuman`
- Use same envelope across goal suggestions, check-in summaries, rating suggestions, risk prompts.

**Impact:** Trust, auditability, safer adoption for manager/HR decisions.

---

### P1-2: Leadership Command Center

**Gap:** No leadership persona with aggregated decision-safe insights.

**Build:**

- Add `leadership` role + scoped read-only analytics APIs
- Command center dashboard:
  - org trend lines
  - risk heatmaps
  - high-potential indicators
  - succession readiness snapshots
- Exclude personally sensitive details where not needed.

**Impact:** Aligns directly to PRD strategic decision intent.

---

### P1-3: HR Calibration and Bias Monitoring Workbench

**Gap:** No formal calibration workflow.

**Build:**

- Calibration sessions by cycle and population
- Distribution views by team/manager/department
- Drift and anomaly flags for rating concentration
- Explainability links to underlying evidence

**Impact:** Better fairness controls and governance readiness.

---

### P1-4: Check-in Intelligence Upgrade

**Gap:** PRD expects pre/during/post meeting intelligence depth beyond current baseline.

**Build:**

- Pre-meeting agenda auto-generation by goal state
- During/post structured summary with commitments and blockers
- Manager feedback quality score (internal coaching metric)
- Tone guidance suggestions before submission

**Impact:** Raises manager coaching quality and check-in consistency.

---

### P1-5: User-Facing AI Governance UX

**Gap:** Usage caps exist, but visibility and transparency are not complete.

**Build:**

- AI usage counters per feature/cycle on relevant pages
- Budget messaging before action
- HR governance panel for AI usage trends and outliers

**Impact:** Cost control + user trust.

---

## 5.4 P2 Changes (Strategic Scale)

### P2-1: Additional Reviewers / Matrix Reporting

- Add optional secondary reviewer assignments
- Capture feedback weights without allowing unauthorized final ratings
- Blend feedback into manager decision support summaries

### P2-2: Goal Import Pipeline (Google Sheet / Excel)

- Template definition + schema validation
- Preview, conflict detection, and safe import
- Audit trail of who imported and what changed

### P2-3: Succession and 9-Box Features

- Potential vs performance matrix
- Readiness bands and recommended development actions
- HR and leadership-only visibility controls

### P2-4: Navigation Buddy Onboarding Layer

- Persona-aware guided tours and "what next" helper
- Triggered walkthroughs for first-time users per cycle stage

---

## 6. Detailed Implementation Blueprint by Layer

## 6.1 Data Model Additions (Suggested)

1. `framework_policies`
2. `goal_lineage_edges`
3. `notification_templates`
4. `notification_jobs`
5. `notification_events`
6. `calibration_sessions`
7. `calibration_decisions`
8. `ai_explanations`
9. `leadership_access_policies`
10. `import_jobs`

Design notes:

- Prefer additive schema with backward compatibility
- Keep role-ownership fields explicit on all new entities
- Add `createdBy`, `updatedBy`, `source`, and audit timestamps by default

## 6.2 API Surface Additions (Suggested)

1. `GET /api/timeline/[cycleId]`
2. `GET/POST /api/framework-policies`
3. `GET /api/goals/[goalId]/lineage`
4. `GET/POST /api/notifications/policies`
5. `POST /api/notifications/dispatch`
6. `GET/POST /api/hr/calibration-sessions`
7. `GET /api/leadership/overview`
8. `POST /api/import/goals`
9. `GET /api/ai/explanations/[contextId]`

Design notes:

- Reuse existing `requireAuth`, `requireRole`, and team-scope assertions
- Use policy-first validation to prevent hidden privilege expansion
- Include machine-readable reason codes in all denied responses

## 6.3 Frontend Experience Additions (Suggested)

1. Timeline-first role home modules
2. Goal lineage panel and contribution badges
3. Framework guidance cards during goal creation
4. Notification inbox + pending actions tray
5. Calibration workspace for HR
6. Leadership command center dashboards
7. AI explanation drawer component (factors/confidence/window)

Design notes:

- Keep existing route modules while gradually migrating to timeline-first
- Use feature flags for high-risk surfaces
- Maintain existing mobile-safe responsive patterns

## 6.4 Platform and Governance Additions (Suggested)

1. Notification scheduler reliability and retries
2. Event-level audit logging for AI recommendations and overrides
3. Compliance metadata exports (policy decisions, rating visibility events)
4. Secure retention and deletion policy metadata for regulated data

---

## 7. Recommended Build Sequence (Practical)

## Phase A (2-4 weeks): Foundations

1. Framework policy engine
2. Timeline aggregate API and basic timeline page
3. Goal lineage schema + read API
4. Notification entities + scheduler MVP

## Phase B (3-6 weeks): Product Intelligence

1. Explainable AI envelope and UI explanation drawer
2. Check-in intelligence upgrade (agenda, summary, coaching score)
3. HR calibration workspace v1
4. AI usage visibility counters

## Phase C (4-8 weeks): Strategic Expansion

1. Leadership role and command center
2. Import pipeline for goals
3. Matrix reviewer support
4. Succession and 9-box views

---

## 8. Risk Register and Mitigation

1. **Schema drift risk**
   - Mitigation: additive schema, compatibility writes, guarded fallbacks
2. **Role boundary regression risk**
   - Mitigation: mandatory authorization matrix tests per endpoint
3. **AI trust risk**
   - Mitigation: explainability envelope + human override defaults
4. **Notification fatigue risk**
   - Mitigation: suppression windows, digests, user-level opt controls
5. **Dashboard over-complexity risk**
   - Mitigation: phase-wise release and persona-specific MVP slices

---

## 9. Validation Plan Before Any Implementation

1. Approve requirement status matrix with product owner
2. Confirm role expansion decision (`leadership` role) with security team
3. Freeze v1 contracts for timeline and explainability envelope
4. Sign off telemetry and KPI baselines for adoption and completion metrics
5. Define acceptance tests per phase before coding starts

---

## 10. Better Features Recommended for Production (Beyond PRD Baseline)

1. **Actionability Score per Employee**
   - Combines stale updates, missed check-ins, and blocker severity into one coaching priority score.
2. **Manager Quality Index**
   - Tracks check-in quality, feedback specificity, and follow-through trends over time.
3. **Goal Health Forecast**
   - Predictive trajectory for each goal with early warning confidence.
4. **Calibration Replay**
   - Timeline of rating changes and rationale during calibration sessions.
5. **Policy Simulator for HR**
   - "What if" simulation for cycle policies (check-in cadence, AI caps, deadline windows).

These features can meaningfully differentiate the product while staying aligned with the existing architecture.

---

## 11. Final Recommendation

To align with `master-prd.md` while preserving current system strengths:

1. Start with timeline-first UX, framework policy expansion, notifications, and lineage.
2. Add explainable decision intelligence and calibration next.
3. Introduce leadership command center and strategic talent features after governance foundations are stable.

This order reduces execution risk, preserves backward compatibility, and moves the platform from a strong operational PMS to a true decision-intelligent performance system.

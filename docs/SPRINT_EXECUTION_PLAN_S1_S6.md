# HR Console Sprint Execution Plan (Sprint 1 to Sprint 6)

## 1. Purpose

This plan converts the approved PRD backlog into a practical six-sprint sequence with production-readiness controls.

Aligned source docs:

1. docs/PRD_GAP_ANALYSIS_AND_EXECUTION_PLAN.md
2. docs/PRD_EXECUTIVE_DECISION_BRIEF.md
3. docs/PRD_ENGINEERING_EXECUTION_PLAYBOOK.md
4. docs/JIRA_IMPORT_EPICS.csv
5. docs/JIRA_IMPORT_STORIES_TASKS.csv

---

## 2. Planning Assumptions

1. Sprint length: 2 weeks
2. Team structure: 2 backend engineers, 2 frontend engineers, 1 full-stack engineer, 1 QA engineer, 1 PM
3. Story points are relative and calibrated from existing Jira import file
4. Feature flags are mandatory for all new P0 and P1 capabilities
5. No major schema break allowed during this plan

---

## 3. Release Objectives by Sprint

1. Sprint 1: Timeline and framework foundations
2. Sprint 2: Notifications and lineage completion
3. Sprint 3: Explainable AI and calibration foundation
4. Sprint 4: Check-in intelligence and AI governance UX
5. Sprint 5: Leadership and strategic features part 1
6. Sprint 6: Strategic features part 2 and production hardening

---

## 4. Sprint 1 (Foundation Start)

## Goal

Stand up the core timeline API path and framework policy data model.

## Planned Scope

1. Create timeline aggregate API
2. Implement timeline state resolver
3. Add timeline telemetry events
4. Introduce framework policy schema
5. Expand framework support
6. Add HR framework policy API

## Exit Criteria

1. Timeline API returns deterministic stage and blockers
2. Framework policy can disable and enable framework options safely
3. Regression tests pass for role-safe API behavior

## Risks

1. Timeline stage ambiguity from legacy data
2. Framework migration edge cases in existing goals

## Mitigation

1. Add fallback rules and explicit unknown-stage handling
2. Add migration-safe compatibility checks before toggling validations

---

## 5. Sprint 2 (Foundation Completion)

## Goal

Complete P0 user impact by launching timeline pages, notifications base, and lineage baseline.

## Planned Scope

1. Build employee timeline page v1
2. Build manager and HR timeline pages v1
3. Add deep-link compatibility for existing pages
4. Create notification entities
5. Build notification scheduler
6. Implement email dispatcher abstraction
7. Build in-app pending action feed
8. Add HR notification policy UI
9. Create lineage edge schema
10. Implement lineage read API
11. Add contribution validation guardrails
12. Build lineage UI panel
13. Add legacy fallback rendering for lineage
14. Update goal validation to policy-driven checks
15. Add migration-safe handling for existing goals

## Exit Criteria

1. Timeline-first path usable for employee manager and HR
2. Reminder scheduling works with traceable dispatch states
3. Goal lineage visible and bounded by validation rules

## Risks

1. Notification reliability under retry load
2. UI regressions from timeline-first navigation changes

## Mitigation

1. Add retry backoff and delivery failure alerting
2. Keep fallback links to legacy pages during rollout

---

## 6. Sprint 3 (Decision Intelligence Start)

## Goal

Standardize explainability and establish calibration backend foundations.

## Planned Scope

1. Define shared explainable AI response contract
2. Apply explainable contract to goal suggestion API
3. Apply explainable contract to check-in summary API
4. Add explainability drawer component
5. Create calibration session entities
6. Build calibration API surface
7. Add calibration audit timeline

## Exit Criteria

1. AI outputs include recommendation factors confidence and time window
2. Calibration session CRUD and decision capture APIs are stable
3. Audit trail available for calibration decisions

## Risks

1. Contract drift across AI endpoints
2. Calibration API complexity growth

## Mitigation

1. Add response schema tests for all AI endpoints
2. Version API contracts and block undocumented fields

---

## 7. Sprint 4 (Decision Intelligence Completion)

## Goal

Deliver manager quality and governance-facing UX improvements.

## Planned Scope

1. Build pre-check-in AI agenda service
2. Add commitments extractor after meeting
3. Implement manager coaching quality score
4. Add tone guidance suggestions
5. Add AI usage counters in user flows
6. Build HR AI governance panel
7. Add AI budget warning thresholds
8. Create calibration distribution views

## Exit Criteria

1. Check-in intelligence is visible before and after meetings
2. AI usage visibility exists for users and HR governance views
3. Calibration distribution/drift visuals are usable for HR

## Risks

1. Low trust in manager quality score if not explainable
2. AI usage counters diverge from backend counts

## Mitigation

1. Display score factors and confidence, not just scalar value
2. Use backend as source of truth and add reconciliation checks

---

## 8. Sprint 5 (Strategic Scale Part 1)

## Goal

Introduce leadership role safely and begin strategic workflows.

## Planned Scope

1. Introduce leadership role and route protection
2. Build leadership overview API
3. Create leadership dashboard v1
4. Add metric definition registry
5. Define matrix reviewer data model
6. Build matrix feedback capture flow
7. Blend matrix feedback into manager summary

## Exit Criteria

1. Leadership access is role-safe and data-minimized
2. Leadership dashboard provides decision-safe aggregates only
3. Matrix feedback workflow runs without final-rating privilege leaks

## Risks

1. Sensitive data exposure through leadership analytics
2. Matrix feedback complexity affecting manager decision speed

## Mitigation

1. Add strict allow-list fields for leadership API responses
2. Keep matrix workflow optional in first release

---

## 9. Sprint 6 (Strategic Scale Part 2 + Hardening)

## Goal

Close strategic scope and complete production go-live readiness gates.

## Planned Scope

1. Define goal import template and parser
2. Implement import preview endpoint
3. Implement idempotent commit endpoint
4. Add import audit and rollback report
5. Create 9-box model and readiness schema
6. Build HR 9-box dashboard
7. Build leadership succession snapshot
8. Run authorization regression matrix
9. Add audit trail coverage checks
10. Complete data minimization review
11. Define SLO dashboards and alerts
12. Create incident runbooks
13. Execute backup restore drill
14. Define rollback triggers and ownership

## Exit Criteria

1. Strategic features available behind controlled rollout flags
2. Security and compliance gate checklist green
3. Reliability and incident readiness validated in drills

## Risks

1. Overloading sprint with strategic and hardening scope
2. Incomplete operational readiness artifacts

## Mitigation

1. Prioritize production gate tasks as hard blockers
2. Move any non-blocking UX polish to post-release sprint

---

## 10. Go-Live Decision Checklist

All must be true before broad production rollout:

1. No open high-severity authorization defects
2. Lifecycle regression suite pass rate is 100 percent for critical paths
3. Notification dispatch reliability target reached
4. Explainability fields present on all target AI outputs
5. Audit coverage confirmed for approvals ratings and overrides
6. Data minimization verified for leadership and non-HR roles
7. Incident runbooks tested and owned
8. Rollback decision matrix approved

---

## 11. Suggested Post-Sprint Cadence

1. Weekly production readiness review
2. Fortnightly security and compliance checkpoint
3. Monthly KPI review for adoption and quality metrics

---

## 12. Notes for Jira Use

Use docs/JIRA_SPRINT_ALLOCATION.csv to bulk assign sprint names to imported stories and tasks.

If sprint names differ in Jira, update the Sprint column values before import.

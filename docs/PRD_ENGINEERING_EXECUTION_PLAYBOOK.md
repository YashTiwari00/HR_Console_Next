# HR Console Engineering Execution Playbook

## 1. Document Intent

This document is the implementation companion to:

- `docs/PRD_GAP_ANALYSIS_AND_EXECUTION_PLAN.md`
- `docs/PRD_EXECUTIVE_DECISION_BRIEF.md`

It provides:

1. Ticket-ready engineering workstreams
2. Contract and schema direction
3. Production readiness quality gates
4. Rollout, observability, and incident preparedness guidance

No code changes are included here.

---

## 2. Engineering Principles

1. Preserve role-based access control invariants first
2. Prefer additive, backward-compatible schema changes
3. Introduce contract changes behind feature flags
4. Keep AI suggestions editable and never auto-finalize decisions
5. Build for observability and rollback from day one

---

## 3. Scope by Engineering Wave

## Wave A (P0): Foundation

1. Timeline workspace and aggregate API
2. Framework policy engine
3. Notification and nudge platform
4. Goal lineage baseline

## Wave B (P1): Decision Intelligence

1. Explainable AI response standard
2. HR calibration workspace
3. Check-in intelligence upgrade
4. AI usage visibility and governance panel

## Wave C (P2): Strategic Scale

1. Leadership command center
2. Matrix reviewer model
3. Goal import pipeline
4. Succession and 9-box features

---

## 4. Ticket-Ready Workstreams

## WS-1: Timeline Workspace

### Epic

Build a role-aware timeline-first lifecycle workspace with deterministic stage state.

### Stories

1. Add `GET /api/timeline/[cycleId]` with stage payload and blockers.
2. Build timeline state resolver from goals/approvals/check-ins/cycle state.
3. Add employee timeline page v1.
4. Add manager timeline page v1.
5. Add hr timeline page v1.
6. Add telemetry for stage interaction and transition attempts.

### Acceptance Criteria

1. Every stage has machine-readable status and next action.
2. Role-ineligible actions return deterministic forbidden reasons.
3. Existing deep-link pages remain functional.

### Dependencies

1. Auth context and role checks from existing server auth stack
2. Cycle state source consistency

---

## WS-2: Framework Policy Engine

### Epic

Replace hardcoded framework behavior with HR-configurable policy-driven behavior.

### Stories

1. Add `framework_policies` collection and seed defaults.
2. Extend framework enum to include BSC and Competency.
3. Add `GET/POST /api/framework-policies` (HR-only updates).
4. Update goal create/edit validations to use effective policy.
5. Add UI policy editor for HR.

### Acceptance Criteria

1. Disabled frameworks cannot be submitted.
2. Existing goals remain readable and editable under migration-safe rules.
3. Policy changes are audited with actor and timestamp.

---

## WS-3: Notifications and Nudges

### Epic

Deliver reminder scheduling and lifecycle nudge execution with delivery observability.

### Stories

1. Add `notification_templates`, `notification_jobs`, `notification_events`.
2. Add scheduler route or worker for due jobs.
3. Add email dispatcher abstraction and retries.
4. Add in-app pending actions feed endpoint.
5. Add HR/admin policy UI for schedule and suppression.

### Acceptance Criteria

1. Critical reminder types trigger on schedule.
2. Every dispatch has success or failure event state.
3. Suppression prevents repeated spam notifications.

---

## WS-4: Goal Lineage

### Epic

Provide transparent goal-to-business alignment via lineage graph and contribution rules.

### Stories

1. Add lineage edge schema (`parentGoalId`, `childGoalId`, `contributionPct`).
2. Add lineage read API and validation guardrails.
3. Add goal detail lineage panel with contribution badges.
4. Add compatibility fallback for legacy goals without lineage.

### Acceptance Criteria

1. Lineage API returns stable ordered paths.
2. Contribution totals are validated and bounded.
3. UI renders both lineage and non-lineage goals gracefully.

---

## WS-5: Explainable AI Contract

### Epic

Standardize all AI outputs to include recommendation rationale metadata.

### Stories

1. Define shared AI response envelope type.
2. Update `/api/ai/goal-suggestion` responses.
3. Update `/api/ai/checkin-summary` responses.
4. Update `/api/ai/chat` context answer metadata where relevant.
5. Add explanation drawer UI component.

### Acceptance Criteria

1. Response includes `whyFactors`, `timeWindow`, `confidence`.
2. Missing metadata fails schema validation in tests.
3. Manager and HR flows show explanation before final submission.

---

## WS-6: HR Calibration Workbench

### Epic

Enable structured calibration sessions and distribution analysis.

### Stories

1. Add `calibration_sessions` and `calibration_decisions` entities.
2. Add API for creating and managing sessions.
3. Build distribution and drift visualizations.
4. Add decision rationale capture flow.

### Acceptance Criteria

1. Session decisions are versioned and auditable.
2. Drift alerts are reproducible from source data.
3. HR-only authorization is enforced on all operations.

---

## WS-7: Leadership Command Center

### Epic

Add leadership persona with aggregated decision-safe analytics.

### Stories

1. Introduce `leadership` role model and route protection.
2. Add `GET /api/leadership/overview` with aggregated metrics only.
3. Build leadership dashboard v1.
4. Add policy filters for data minimization.

### Acceptance Criteria

1. Leadership endpoints never expose unnecessary employee-level detail.
2. Access is denied for non-leadership users with deterministic reason codes.
3. Metrics definitions are documented and versioned.

---

## WS-8: Import Pipeline

### Epic

Support spreadsheet-based goal import with strict validation and safe writes.

### Stories

1. Define template format and parser contract.
2. Add `import_jobs` entity and idempotent execution key.
3. Add preview endpoint with validation errors.
4. Add commit endpoint with partial failure report.

### Acceptance Criteria

1. Preview never mutates data.
2. Commit provides per-row status and rollback guidance.
3. Import events are fully audited.

---

## 5. Cross-Cutting Engineering Tasks

1. Feature flags for each major workstream
2. Authorization test matrix expansion
3. Audit logging enrichment
4. Contract tests for all new response envelopes
5. Performance budgets and query profiling

---

## 6. Suggested API Contract Patterns

Use consistent API response envelope:

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "requestId": "...",
    "version": "v1"
  },
  "error": null
}
```

Use consistent deny shape:

```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "ROLE_SCOPE_DENIED",
    "message": "You do not have access to this resource.",
    "details": {
      "requiredRole": "hr"
    }
  }
}
```

---

## 7. Data Migration Strategy

1. Additive schema first, reads before writes
2. Backfill scripts for new required derived fields
3. Dual-write where compatibility is required
4. Flip reads to new model after verification window
5. Keep rollback path for one release cycle minimum

Migration checklist per release:

1. Schema audit pass
2. Backfill dry run in non-prod
3. Row count and invariant reconciliation
4. Rollback rehearsal

---

## 8. Testing Strategy

## 8.1 Unit and Contract

1. Role enforcement tests for every new endpoint
2. Schema validation tests for AI explainability envelope
3. Deterministic state resolver tests for timeline

## 8.2 Integration

1. End-to-end lifecycle tests for employee, manager, hr
2. Notification scheduler integration tests
3. Google token and meeting flow regression tests

## 8.3 Smoke and Regression

1. Extend `scripts/smoke-api-routes.mjs` for new endpoints
2. Extend `scripts/smoke-ui-pages.mjs` for new pages
3. Add wave-based regression suite per feature flag state

---

## 9. SLO and Observability Baseline

## 9.1 SLO Targets

1. Core lifecycle API success rate >= 99.5%
2. p95 latency for lifecycle APIs <= 600 ms
3. Notification dispatch success >= 98%

## 9.2 Required Telemetry

1. Timeline stage transition events
2. Authorization denial reason codes
3. AI recommendation usage and override events
4. Notification dispatch and retry events
5. Calibration decision events

## 9.3 Alerting

1. Spike in role-denied responses
2. Notification failure burst
3. AI endpoint error rate threshold breach
4. Scheduler lag threshold breach

---

## 10. Security and Compliance Readiness

1. RBAC matrix reviewed per endpoint and page
2. Sensitive data exposure review for analytics surfaces
3. Google OAuth token storage and rotation checks
4. Audit log integrity and retention policy validation
5. PII minimization for leadership and exported reports

---

## 11. Release and Rollout Plan

1. Internal dogfood (feature flags on for selected roles)
2. Pilot tenant release (limited HR and manager cohorts)
3. Controlled ramp (25%, 50%, 100%)
4. Post-release monitoring window with rollback readiness

Rollback triggers:

1. Authorization regression
2. Lifecycle completion drop > defined threshold
3. Notification failure sustained over threshold
4. Data integrity mismatch in lineage or calibration data

---

## 12. Production Readiness Checklist (Go/No-Go)

All items must be green before production rollout.

## 12.1 Functional

1. All P0 acceptance criteria passed
2. Backward compatibility verified for legacy records
3. Core lifecycle can complete end-to-end for each role

## 12.2 Reliability

1. Load and stress baselines collected and accepted
2. Scheduler and async retries validated
3. Error budgets defined and monitored

## 12.3 Security

1. Access control regression tests pass
2. Secret handling and token flows reviewed
3. Audit and traceability checks complete

## 12.4 Operability

1. Dashboards and alerts live
2. Runbooks validated in simulation
3. On-call ownership and escalation tree finalized

---

## 13. Implementation Ticket Template

Use this template for each story:

1. Story title
2. Business objective
3. Technical scope
4. API/schema changes
5. Authorization impact
6. Telemetry additions
7. Acceptance criteria
8. Test plan
9. Rollback plan
10. Dependencies

---

## 14. Final Engineering Recommendation

Execute Wave A immediately with strict feature flags and contract-first development.

Do not start Wave C strategic features until Wave A and Wave B trust and governance gates are complete.

This approach gives a safer path to production while preserving the long-term PRD vision.

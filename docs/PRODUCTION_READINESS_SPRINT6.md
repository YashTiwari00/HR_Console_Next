# Sprint 6 Production Readiness Checklist

## Scope

This checklist tracks production controls for Sprint 6 strategic delivery:

1. Goal import pipeline
2. 9-box talent map and succession snapshot
3. Auth and data minimization hardening
4. Reliability and rollback preparedness

## 1. Feature Controls

1. Goal import endpoints implemented:
- `GET /api/goals/import/template`
- `POST /api/goals/import/preview`
- `POST /api/goals/import/commit`
2. Idempotency enforced in commit via `x-idempotency-key`.
3. Import audit persisted in `import_jobs`.
4. HR 9-box endpoint implemented: `GET /api/hr/9-box`.
5. Leadership succession endpoint implemented: `GET /api/leadership/succession`.

## 2. Role and Data Safety

1. Import endpoints restricted to `employee|manager|hr`.
2. 9-box endpoint restricted to `hr`.
3. Succession endpoint restricted to `leadership`.
4. Leadership endpoint returns aggregate-only payloads.
5. No employee identifiers returned from leadership succession API.

## 3. Schema and Compatibility

1. Schema apply includes:
- `import_jobs`
- `talent_snapshots`
2. Import and talent logic use compatibility-safe handling where schema may lag.
3. Existing lifecycle and matrix collections unchanged.

## 4. Validation and Test Evidence

1. Lint run for touched files.
2. API smoke run after schema apply.
3. Target smoke result: full pass with matrix and import checks.
4. Leadership-specific endpoint should be validated when leadership seeded user exists.

## 5. Operational Readiness

1. Alerting plan (minimum):
- Import commit 5xx rate threshold
- Notification scheduler failure threshold
- Auth forbidden spike for new endpoints
2. Runbook pointers:
- Import job rollback/retry handling
- Schema apply recovery steps
- Role access verification steps
3. Rollback trigger:
- Any authz regression on role-scoped APIs
- Repeated 5xx in import commit path post-release window

## 6. Sign-off Template

1. Product: ____________________ Date: __________
2. Engineering: ________________ Date: __________
3. Security/Compliance: ________ Date: __________
4. Operations/SRE: _____________ Date: __________

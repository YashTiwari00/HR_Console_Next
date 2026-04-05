# Jira Backlog Import Guide

## 1. Purpose

This guide helps you import a production-ready PRD backlog into Jira using the files below:

1. `docs/JIRA_IMPORT_EPICS.csv`
2. `docs/JIRA_IMPORT_STORIES_TASKS.csv`

---

## 2. Recommended Import Order

1. Import epics first from `docs/JIRA_IMPORT_EPICS.csv`
2. Confirm epic keys generated in Jira
3. In `docs/JIRA_IMPORT_STORIES_TASKS.csv`, replace each Epic Link value with the actual Jira Epic Key
4. Import stories and tasks CSV

Example replacement:

- Replace `P0 Timeline Workspace Foundation` with actual epic key like `PMS-101`

---

## 3. Jira CSV Mapping

Map these columns in Jira importer:

1. Issue Type -> Issue Type
2. Summary -> Summary
3. Description -> Description
4. Priority -> Priority
5. Labels -> Labels
6. Epic Name -> Epic Name (for epics file)
7. Epic Link -> Epic Link (for stories/tasks file)
8. Story Points -> Story Points

If your Jira instance uses a custom story points field, map `Story Points` to that custom field.

---

## 4. Post-Import Validation Checklist

1. All epics imported and visible on roadmap board
2. All stories and tasks linked to correct epics
3. No issue imported without priority
4. Labels are present for phase and domain filtering
5. Production gate epics appear with Highest priority

---

## 5. Suggested Jira Filters

Use these labels for quick planning views:

1. `phase-a` for P0 foundation sprint planning
2. `phase-b` for P1 intelligence planning
3. `phase-c` for P2 strategic planning
4. `production` for go-live readiness tracking
5. `security` and `compliance` for release governance checks

---

## 6. Suggested Jira Board Setup

1. Board A: Product Roadmap (Epics only)
2. Board B: Delivery Execution (Stories and Tasks)
3. Board C: Production Readiness (Production labels)

---

## 7. Governance Recommendation

Before implementation begins:

1. Mark all P0 items as must-have for release candidate
2. Mark production/security epics as release blockers
3. Add owners to every story before sprint allocation
4. Require acceptance criteria sign-off for done state

---

## 8. Source Alignment

This import pack is aligned to:

1. `docs/PRD_GAP_ANALYSIS_AND_EXECUTION_PLAN.md`
2. `docs/PRD_EXECUTIVE_DECISION_BRIEF.md`
3. `docs/PRD_ENGINEERING_EXECUTION_PLAYBOOK.md`

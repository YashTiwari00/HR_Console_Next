# HR Console UI and Components Complete Guide

This document is a dedicated UI handbook for LLM-assisted development in this repository.
It explains:
- UI architecture and rendering model
- theming and design tokens
- shared component system (layout, primitives, patterns)
- role-based page and layout structure
- feature-specific UI surfaces
- practical rules for safely adding or changing UI

Use this guide when you want an LLM to make UI changes with consistent structure and styling.

---

## 1. UI architecture at a glance

### 1.1 Rendering model
- Framework: Next.js App Router (`app/*`)
- UI runtime: React 19
- Styling model: Tailwind CSS 4 + CSS variables from token files
- Primary shell: role-specific layouts under:
  - `app/employee/layout.tsx`
  - `app/manager/layout.tsx`
  - `app/hr/layout.tsx`
  - `app/leadership/layout.tsx`

### 1.2 Global wrapper stack
1. `app/layout.tsx` initializes theme early in `<head>` before hydration.
2. `ThemeProvider` (`src/theme/ThemeProvider.tsx`) manages light/dark/system preference.
3. Role layout wraps page content with:
   - `SidebarLayout`
   - role sidebar + quick actions + account panel
   - `AiModeProvider` (mode gating by role)
   - floating assistant (`Companion`) and top-right `NotificationBell`
4. Pages compose reusable primitives/patterns and fetch data from route handlers.

### 1.3 Composition philosophy
- Build pages from this order:
  1. layout primitives (`Stack`, `Grid`, `Container`, `SidebarLayout`)
  2. UI primitives (`Card`, `Button`, `Input`, `Badge`, etc.)
  3. feature patterns (`DataTable`, `PageHeader`, `GoalLineageView`, etc.)
- Keep role-specific business logic in page modules.
- Keep reusable visuals in `src/components/*`.

---

## 2. Design system and visual rules

### 2.1 Canonical rules file
- `UI-RULES.md` is the source of truth for design behavior.

### 2.2 Key visual constraints (must-follow)
- Spacing: use token variables only (`--space-*`).
- Radius:
  - controls: `--radius-sm`
  - cards: `--radius-md`
  - large shells: `--radius-lg`
- Shadows:
  - cards: `--shadow-sm`
  - floating: `--shadow-md`
  - modals: `--shadow-lg`
- Typography classes:
  - page title: `.heading-xl`
  - section title: `.heading-lg`
  - body text: `.body` / `.body-sm`
  - metadata: `.caption`
- Animation: subtle only; avoid heavy motion.
- Layout: prefer `Stack` and `Grid` over custom nested flex scaffolding.

### 2.3 Theme and tokens
Files:
- `styles/tokens.css`
- `styles/typography.css`
- `app/globals.css`

Token groups:
- Colors: primary, surface, background, border, text, semantic status colors
- Spacing: 4px to 48px scale (`--space-1` ... `--space-6`)
- Radius: sm/md/lg
- Shadows: sm/md/lg
- Typography sizes: xs/sm/md/lg/xl
- Semantic UI tokens:
  - badge variants
  - alert variants
  - overlay

Theme behavior:
- Light-first palette with dark-mode overrides under `.dark`.
- Effective theme is mirrored into:
  - root class (`dark`)
  - `data-theme`
  - `color-scheme`

### 2.4 Global visual behaviors in `globals.css`
- Ambient radial background + slow breathing animation
- Grain overlay texture
- Custom selection color
- Shared fade utility (`.fade-in`)
- Custom scrollbars
- FullCalendar-specific styling class: `.availability-calendar-shell`

---

## 3. Providers and UI contexts

### 3.1 Theme provider
- File: `src/theme/ThemeProvider.tsx`
- Storage key: `hr-console-theme-preference`
- Allowed preference values: `light | dark | system`
- Responsibilities:
  - sync theme to local storage
  - listen to system dark-mode media query
  - apply root-level class/dataset/style

### 3.2 AI mode provider
- File: `src/context/AiModeContext.tsx`
- Storage key: `hr_console_ai_mode`
- Modes: `suggestion | decision_support`
- Role gate:
  - only allowed roles can use decision support
  - unauthorized mode is auto-downgraded to default

---

## 4. Shared component system

## 4.1 Layout primitives (`src/components/layout`)

### Container
- File: `src/components/layout/Container/index.tsx`
- Role: max-width control and horizontal page padding wrapper.
- Type export: `ContainerProps`, `ContainerMaxWidth`

### Grid
- File: `src/components/layout/Grid/index.tsx`
- Role: consistent responsive column layout.
- Type export: `GridProps`, `GridCols`, `GridGap`

### Stack
- File: `src/components/layout/Stack/index.tsx`
- Role: vertical/horizontal spacing utility with tokenized gaps.
- Type export: `StackProps`, `StackGap`, `StackDirection`, `StackAlign`, `StackJustify`

### SidebarLayout
- File: `src/components/layout/SidebarLayout/index.tsx`
- Role: app-shell with sidebar + content split for role dashboards.
- Type export: `SidebarLayoutProps`

## 4.2 UI primitives (`src/components/ui`)

### Core form and action primitives
- `Button` (`ButtonProps`, variants/sizes)
- `Input` (`InputProps`)
- `Textarea` (`TextareaProps`)
- `Select` (`SelectProps`, `SelectOption`)
- `Checkbox` (`CheckboxProps`)

### Feedback and state primitives
- `Alert` (`AlertProps`, `AlertVariant`)
- `Badge` (`BadgeProps`, `BadgeVariant`)
- `Spinner` (`SpinnerProps`, `SpinnerSize`)
- `Skeleton` (`SkeletonProps`, `SkeletonVariant`)
- `Tooltip` (`TooltipProps`, `TooltipPosition`)
- `Modal` (`ModalProps`)

### Display and structural primitives
- `Card` (`CardProps`)
- `Avatar` (`AvatarProps`, `AvatarSize`)
- `Divider` (`DividerProps`)
- `Dropdown` (`DropdownProps`, `DropdownOption`)

### AI, assistant, and workflow primitives
- `ChatBot` (`ChatBotProps`) - embedded chat UI
- `Companion` (`CompanionProps`) - floating role-aware assistant shell
- `AiModeToggle` - AI mode switch control
- `SpeechToTextButton` (`SpeechToTextButtonProps`) - browser speech input trigger

### Notifications and gamification primitives
- `NotificationBell` - header feed trigger
- `ContributionBadge` (`ContributionBadgeProps`)
- `StreakBadge` (`StreakBadgeProps`)
- `MilestoneToast` (`MilestoneToastProps`)
- `ReadinessBadge` (`ReadinessBadgeProps`)
- `CycleHistoryTimeline` (`CycleHistoryTimelineProps`)

### UI helper
- `TutorialBuddy` (`TutorialBuddyProps`) for guided interactions.

## 4.3 Pattern components (`src/components/patterns`)

### Structural patterns
- `PageHeader` (`PageHeaderProps`)
- `FormSection` (`FormSectionProps`)
- `DataTable` (`DataTableProps`, `DataTableColumn`)

### Goals and planning patterns
- `ConversationalGoalComposer` (`ConversationalGoalComposerProps`)
- `CascadeGoalComposer` (`CascadeGoalComposerProps`)
- `GoalLineageView` (`GoalLineageViewProps`)
- `GoalLineageCard` (`GoalLineageCardProps`)
- `GoalAllocationSuggestionCard` (`GoalAllocationSuggestionCardProps`)
- `GoalAiComparisonCard` (`GoalAiComparisonCardProps`, `GoalAiDraft`)
- `BulkGoalAiReviewPanel` (`BulkGoalAiReviewPanelProps`)
- `BulkGoalDashboardImportCard` (`BulkGoalDashboardImportCardProps`)

### Explainability and analytics patterns
- `ExplainabilityDrawer` (`ExplainabilityDrawerProps`, `ExplainabilityPayload`)
- `RatingDropWarningSection` (`RatingDropWarningSectionProps`, `RatingDropWarningItem`)

### Growth and training patterns
- `CareerPathwayPanel` (`CareerPathwayPanelProps`)
- `TnaSkillCard` (`TnaSkillCardProps`)
- `TrainingNeedsSummaryCard` (`TrainingNeedsSummaryCardProps`)
- `TrainingNeedsTable` (`TrainingNeedsTableProps`)

### Milestone/gamification composition
- `MilestoneToastStack` (enabled by feature flag and role layout integration)

## 4.4 AI governance component module (`src/components/ai-governance`)
- `KpiCards`
- `FiltersBar`
- `FeatureBreakdown`
- `RiskPanel`
- `TopUsersPanel`
- shared local typing in `types.ts`

These are specialized composites for `app/hr/ai-governance/page.tsx`.

---

## 5. Role layout behavior and navigation model

## 5.1 Employee layout
File: `app/employee/layout.tsx`
- Adds role-aware sidebar and quick actions.
- Feature flag insertion:
  - growth route appears only when `NEXT_PUBLIC_ENABLE_GROWTH_HUB` is true.
- Shows `NotificationBell` in top-right content wrapper.
- Mounts `MilestoneToastStack` when `NEXT_PUBLIC_ENABLE_GAMIFICATION` is true.
- Mounts `Companion` with role `employee`.

## 5.2 Manager layout
File: `app/manager/layout.tsx`
- Supports persona switching:
  - Manager View and Employee View in one shell.
- Persists persona in local storage (`managerConsolePersona`).
- Chooses nav and quick actions based on persona.
- Mounts `Companion` and `NotificationBell`.

## 5.3 HR layout
File: `app/hr/layout.tsx`
- Uses a governance-focused nav set.
- Includes links for settings, analytics, AI governance, calibration, training-needs, 9-box, notifications.
- Mounts `Companion` with role `hr`.

## 5.4 Leadership layout
File: `app/leadership/layout.tsx`
- Minimal nav (command center emphasis).
- Explicit aggregate-only messaging in sidebar content.
- Uses same shell primitives and notification/assistant pattern.

## 5.5 Legacy region-admin
Files under `app/region-admin/*` remain as compatibility/alias surfaces and should not be used as the primary extension point.

---

## 6. UI route inventory (pages and shells)

### 6.1 Root/auth pages
- `app/page.tsx`
- `app/login/page.jsx`
- `app/auth/callback/page.jsx`
- `app/onboarding/page.jsx`
- `app/signup/page.jsx`

### 6.2 Employee pages
- `app/employee/page.tsx`
- `app/employee/goals/page.tsx`
- `app/employee/progress/page.tsx`
- `app/employee/check-ins/page.tsx`
- `app/employee/matrix-feedback/page.tsx`
- `app/employee/meetings/page.tsx`
- `app/employee/meetings/page.tsx`
- `app/employee/timeline/page.tsx`
- `app/employee/growth/page.tsx`

### 6.3 Manager pages
- `app/manager/page.tsx`
- `app/manager/employee-dashboard/page.tsx`
- `app/manager/goals/page.tsx`
- `app/manager/progress/page.tsx`
- `app/manager/check-ins/page.tsx`
- `app/manager/timeline/page.tsx`
- `app/manager/team-goals/page.tsx`
- `app/manager/team-progress/page.tsx`
- `app/manager/team-check-ins/page.tsx`
- `app/manager/team-approvals/page.tsx`
- `app/manager/team-analytics/page.tsx`
- `app/manager/matrix-reviews/page.tsx`
- `app/manager/approvals/page.tsx`
- `app/manager/meeting-calendar/page.tsx`
- `app/manager/meetings/page.tsx`
- `app/manager/google-token-setup/page.tsx`

### 6.4 HR pages
- `app/hr/page.tsx`
- `app/hr/settings/page.tsx`
- `app/hr/team-analytics/page.tsx`
- `app/hr/check-ins/page.tsx`
- `app/hr/ai-governance/page.tsx`
- `app/hr/calibration/page.tsx`
- `app/hr/training-needs/page.tsx`
- `app/hr/succession/page.tsx`
- `app/hr/9-box/page.tsx`
- `app/hr/notifications/page.tsx`
- `app/hr/approvals/page.tsx`
- `app/hr/managers/[managerId]/page.tsx`
- `app/hr/team-assignments/page.tsx` (legacy/redirect)

### 6.5 Leadership pages
- `app/leadership/page.tsx`

### 6.6 Legacy region-admin pages
- `app/region-admin/page.tsx`
- `app/region-admin/check-ins/page.tsx`
- `app/region-admin/team-analytics/page.tsx`

### 6.7 UI library showcase
- `app/uilibrary/page.tsx`

This page is the live component showcase and should be used as a visual reference before introducing new primitive variants.

---

## 7. Feature-flagged UI behavior

- `NEXT_PUBLIC_ENABLE_GAMIFICATION`
  - Enables milestone/streak/contribution surfaces and toast stack behavior.

- `NEXT_PUBLIC_ENABLE_GROWTH_HUB`
  - Enables employee growth route/nav and growth composites.

- `NEXT_PUBLIC_ENABLE_CONTRIBUTION_BADGE`
  - Controls contribution badge exposure paths.

- `NEXT_PUBLIC_ENABLE_EMPLOYEE_TRAJECTORY`
  - Controls employee trajectory visualization surfaces.

Guideline:
- Wrap feature-specific UI in stable empty-state or hidden-state behavior.
- Do not crash layout if feature flags are disabled.

---

## 8. How pages should compose components

Recommended implementation pattern for new pages:
1. Start with `Container` and `Stack` for shell spacing.
2. Use `PageHeader` for title/subtitle/actions.
3. Place KPI/summary cards with `Grid` + `Card`.
4. Use `FormSection` for grouped forms.
5. Use `DataTable` for list/queue surfaces.
6. Add `Alert`, `Skeleton`, `Spinner`, and empty-state copy for async states.
7. Keep role access logic in API and page loader, not inside low-level primitives.

---

## 9. LLM guidance: safe UI change protocol

When asking an LLM to edit UI in this project, include these requirements:

1. Preserve tokenized styling.
- Use CSS variables and existing utility classes.
- Do not hardcode random spacing/font/shadow values.

2. Prefer existing components before adding new ones.
- Check `src/components/ui`, `src/components/layout`, `src/components/patterns` first.

3. Keep role boundaries intact.
- Do not mix manager/hr/leadership page concerns in one component unless shared by design.

4. Keep accessibility basics.
- labels, button text, aria attributes, keyboard focus consistency.

5. Keep visual language consistent.
- warm palette, card-first dashboard patterns, subtle transitions.

6. Add feature-gated UI when needed.
- read and respect `NEXT_PUBLIC_ENABLE_*` flags.

7. Reuse app shell conventions.
- do not bypass role layout wrappers for internal pages.

8. Use existing client helper APIs for data fetching.
- avoid creating duplicate fetch wrappers unless required.

---

## 10. Recommended LLM prompts for this UI codebase

### 10.1 Add a new page in an existing role
"Create a new page under app/hr with PageHeader, KPI cards, and DataTable using existing Stack/Grid/Card primitives. Follow UI-RULES and use tokenized spacing/classes only."

### 10.2 Refactor repeated JSX into a pattern component
"Extract the repeated panel into src/components/patterns preserving current props and visual output; keep API stable and update usages."

### 10.3 Add a new primitive variant safely
"Add a conservative new variant to Button and Badge; update uilibrary demo to showcase it; do not modify unrelated variants."

### 10.4 Add feature-flagged UI
"Add a growth feature card that renders only when NEXT_PUBLIC_ENABLE_GROWTH_HUB is true and provide a graceful fallback state otherwise."

---

## 11. Full shared component file inventory

### 11.1 `src/components/layout`
- `src/components/layout/index.ts`
- `src/components/layout/Container/index.tsx`
- `src/components/layout/Grid/index.tsx`
- `src/components/layout/SidebarLayout/index.tsx`
- `src/components/layout/Stack/index.tsx`

### 11.2 `src/components/ui`
- `src/components/ui/index.ts`
- `src/components/ui/Alert/index.tsx`
- `src/components/ui/Avatar/index.tsx`
- `src/components/ui/Badge/index.tsx`
- `src/components/ui/Button/index.tsx`
- `src/components/ui/Card/index.tsx`
- `src/components/ui/ChatBot/index.tsx`
- `src/components/ui/Checkbox/index.tsx`
- `src/components/ui/Companion/index.tsx`
- `src/components/ui/ContributionBadge.tsx`
- `src/components/ui/CycleHistoryTimeline.tsx`
- `src/components/ui/Divider/index.tsx`
- `src/components/ui/Dropdown/index.tsx`
- `src/components/ui/Input/index.tsx`
- `src/components/ui/MilestoneToast.tsx`
- `src/components/ui/Modal/index.tsx`
- `src/components/ui/NotificationBell/index.tsx`
- `src/components/ui/ReadinessBadge.tsx`
- `src/components/ui/Select/index.tsx`
- `src/components/ui/Skeleton/index.tsx`
- `src/components/ui/SpeechToTextButton/index.tsx`
- `src/components/ui/Spinner/index.tsx`
- `src/components/ui/StreakBadge.tsx`
- `src/components/ui/Textarea/index.tsx`
- `src/components/ui/Tooltip/index.tsx`
- `src/components/ui/TutorialBuddy/index.tsx`
- `src/components/ui/AiModeToggle/index.tsx`

### 11.3 `src/components/patterns`
- `src/components/patterns/index.ts`
- `src/components/patterns/PageHeader/index.tsx`
- `src/components/patterns/FormSection/index.tsx`
- `src/components/patterns/DataTable/index.tsx`
- `src/components/patterns/ConversationalGoalComposer.tsx`
- `src/components/patterns/CascadeGoalComposer.tsx`
- `src/components/patterns/ExplainabilityDrawer.tsx`
- `src/components/patterns/GoalLineageView.tsx`
- `src/components/patterns/GoalLineageCard.tsx`
- `src/components/patterns/GoalAllocationSuggestionCard.tsx`
- `src/components/patterns/GoalAiComparisonCard.tsx`
- `src/components/patterns/BulkGoalAiReviewPanel.tsx`
- `src/components/patterns/BulkGoalDashboardImportCard.tsx`
- `src/components/patterns/RatingDropWarningSection.tsx`
- `src/components/patterns/TnaSkillCard.tsx`
- `src/components/patterns/TrainingNeedsSummaryCard.tsx`
- `src/components/patterns/TrainingNeedsTable.tsx`
- `src/components/patterns/CareerPathwayPanel.tsx`
- `src/components/patterns/MilestoneToastStack.tsx`
- `src/components/patterns/AiModeToggle.tsx`

### 11.4 `src/components/ai-governance`
- `src/components/ai-governance/index.ts`
- `src/components/ai-governance/types.ts`
- `src/components/ai-governance/KpiCards.tsx`
- `src/components/ai-governance/FiltersBar.tsx`
- `src/components/ai-governance/FeatureBreakdown.tsx`
- `src/components/ai-governance/RiskPanel.tsx`
- `src/components/ai-governance/TopUsersPanel.tsx`

### 11.5 Theme components
- `src/components/theme/SidebarThemeToggle.tsx`

---

## 12. Maintenance checklist for future UI changes

If UI structure changes, update this document in these sections:
- route inventory
- component inventory
- role layout behavior
- feature flags
- provider/context behavior

If a new component category is introduced (for example charts), add:
- folder ownership
- expected usage pattern
- prop contract summary
- where it is used by role/page

---

## 13. Quick instruction block for LLM handoff

Use this block when handing context to another LLM:

"This project uses a token-driven design system with role-based App Router layouts. Build UI using existing layout primitives (Stack/Grid/Container/SidebarLayout), then UI primitives, then pattern components. Respect UI-RULES.md and avoid hardcoded styles. Keep feature-flag behavior safe and role boundaries intact. Prefer edits in src/components and app role pages over introducing parallel UI systems."

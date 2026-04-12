Create a reusable DashboardLayout component in:

src/components/patterns/dashboard/DashboardLayout.tsx

Requirements:

- Use Container + Stack internally
- Accept props:
  - title
  - subtitle
  - actions (right side buttons)
  - kpis (ReactNode)
  - primaryAction (ReactNode)
  - main (ReactNode)
  - sidebar (ReactNode)
  - extra (ReactNode)

Structure:

1. PageHeader (title, subtitle, actions)
2. KPI Section
3. Primary Action Section
4. Two-column Grid:
   - left: main
   - right: sidebar
5. Extra section

Use Grid + Stack for layout.
Use token spacing only.

This should become the standard layout for all dashboards.
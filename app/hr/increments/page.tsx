"use client";

import { Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Badge, Card } from "@/src/components/ui";

const PLANNED_FEATURES = [
  {
    title: "Cycle Closure Trigger",
    description:
      "When HR closes the annual cycle, the system identifies all employees with a final year rating and queues them for increment/promotion review.",
    status: "planned",
  },
  {
    title: "Increment Recommendation Engine",
    description:
      "Auto-suggest increment bands based on final rating (EE → high band, DE → standard band, ME → standard band, SME/NI → no increment / performance plan). HR can override before approval.",
    status: "planned",
  },
  {
    title: "Promotion Nomination",
    description:
      "Managers nominate employees for promotion from the Talent Bench. HR reviews nominations alongside succession readiness scores and approves or defers.",
    status: "planned",
  },
  {
    title: "Approval Workflow",
    description:
      "Multi-step approval: Manager → HR → Finance sign-off. Each step has a deadline; escalates to the next approver if missed.",
    status: "planned",
  },
  {
    title: "Letter Generation",
    description:
      "Auto-generate increment and promotion letters as PDF using employee details, new CTC, effective date, and approver signature block.",
    status: "planned",
  },
  {
    title: "Audit Trail",
    description:
      "Full history of who recommended, who approved, what changed, and when. Immutable once cycle is locked.",
    status: "planned",
  },
];

export default function HrIncrementsPage() {
  return (
    <Stack gap="4">
      <PageHeader
        title="Increment / Promotion Workflow"
        subtitle="Initiate increment and promotion recommendations after the annual cycle closes, based on each employee's final year rating."
      />

      <Card>
        <div className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--color-warning)] bg-[color-mix(in_srgb,var(--color-warning)_8%,var(--color-surface))] p-4">
          <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--color-warning)] text-[var(--color-warning)]">
            <span className="caption font-bold">!</span>
          </div>
          <div>
            <p className="body-sm font-medium text-[var(--color-text)]">Future Phase — Not Yet Available</p>
            <p className="caption mt-1 text-[var(--color-text-muted)]">
              This feature is scoped for a future sprint. The workflow will be triggered automatically once an annual cycle is closed.
              Increment bands and promotion logic will be configurable in HR Settings. The page below outlines what will be built.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <Card title="Increments">
          <p className="heading-xl text-[var(--color-text-muted)]">—</p>
          <p className="caption text-[var(--color-text-muted)]">Pending cycle closure</p>
        </Card>
        <Card title="Promotions">
          <p className="heading-xl text-[var(--color-text-muted)]">—</p>
          <p className="caption text-[var(--color-text-muted)]">Pending nominations</p>
        </Card>
        <Card title="Awaiting Approval">
          <p className="heading-xl text-[var(--color-text-muted)]">—</p>
          <p className="caption text-[var(--color-text-muted)]">No active approvals</p>
        </Card>
      </div>

      <Card
        title="Planned Features"
        description="Capabilities that will be built in this module when the sprint is scheduled."
      >
        <div className="space-y-3">
          {PLANNED_FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="body-sm font-medium text-[var(--color-text)]">{feature.title}</p>
                  <Badge variant="default">Planned</Badge>
                </div>
                <p className="caption mt-1 text-[var(--color-text-muted)]">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="How it will work"
        description="End-to-end flow once this module is live."
      >
        <ol className="space-y-3 body-sm text-[var(--color-text-muted)]">
          {[
            "HR closes the annual performance cycle.",
            "System auto-generates increment recommendations for all employees with a final rating.",
            "HR reviews and adjusts recommendations — can override band or flag for promotion.",
            "Manager receives notification to confirm or add a promotion nomination.",
            "HR + Finance approve the finalized list.",
            "Letters are generated and sent. Employee sees updated CTC in their profile.",
            "Full audit log is frozen and attached to the cycle record.",
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] caption font-medium text-[var(--color-text)]">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </Card>
    </Stack>
  );
}

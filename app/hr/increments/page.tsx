"use client";

import { useState } from "react";
import Link from "next/link";
import { Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Badge, Button } from "@/src/components/ui";

interface WorkflowStep {
  id: number;
  title: string;
  shortDesc: string;
  detail: string;
}

const WORKFLOW_STEPS: WorkflowStep[] = [
  { id: 1, title: "Close Cycle", shortDesc: "HR closes annual cycle", detail: "When the annual cycle is closed, the system automatically identifies every employee who received a final year rating. These employees are queued for increment and promotion review. No manual CSV uploads — the pipeline is fully automated from existing ratings data." },
  { id: 2, title: "Auto Recommend", shortDesc: "System generates bands", detail: "Based on final ratings, the engine suggests increment bands: EE = high band, DE/ME = standard, SME/NI = no increment or PIP. All recommendations are editable — HR can override any suggestion before approval." },
  { id: 3, title: "HR Review", shortDesc: "Review & adjust", detail: "HR sees a full table: suggested band, current CTC, proposed new CTC, promotion flags. Bulk edit mode for large orgs. Filters by department, rating, and manager." },
  { id: 4, title: "Manager Input", shortDesc: "Confirm or nominate", detail: "Managers receive a notification with their team's proposals. They confirm, add promotion nominations, or flag concerns. Deadline-driven with auto-escalation." },
  { id: 5, title: "Approval Chain", shortDesc: "HR + Finance sign-off", detail: "Configurable approval chain with aggregate budget impact view. Finance can approve, adjust, or partially approve. Full audit at every step." },
  { id: 6, title: "Letters & Notify", shortDesc: "Generate & deliver", detail: "PDF increment/promotion letters auto-generated with employee details, new CTC, effective date, and signatures. Profiles update automatically." },
  { id: 7, title: "Audit & Lock", shortDesc: "Immutable record", detail: "Complete audit trail frozen and attached to cycle. No further modifications possible once locked. Available for compliance review." },
];

const CAPABILITIES = [
  {
    title: "Increment Engine",
    desc: "Rating-to-band mapping with HR override capability",
    items: ["EE → High band", "DE/ME → Standard band", "SME/NI → PIP / No increment", "Custom rules in HR Settings"],
    accent: "var(--color-primary)",
  },
  {
    title: "Promotion Pipeline",
    desc: "Nominations from Talent Bench to approval",
    items: ["Manager nominates from Talent Bench", "HR reviews with succession scores", "9-box placement informs decisions", "Readiness threshold configurable"],
    accent: "var(--color-success)",
  },
  {
    title: "Approval Workflow",
    desc: "Multi-step with deadlines and escalation",
    items: ["Manager → HR → Finance", "Configurable deadlines", "Auto-escalation on timeout", "Partial approval supported"],
    accent: "var(--color-warning)",
  },
];

export default function HrIncrementsPage() {
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [expandedCap, setExpandedCap] = useState<number | null>(null);

  return (
    <Stack gap="5" className="fade-in">
      <PageHeader
        title="Increment / Promotion Workflow"
        subtitle="Initiate increment and promotion recommendations after cycle closure."
      />

      {/* ── Hero glass card ──────────────────────────────────────────── */}
      <div className="glass-strong rounded-[var(--radius-lg)] p-6 md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--color-warning)_15%,transparent)] glow-ring">
              <span className="heading-lg text-[var(--color-warning)]">!</span>
            </div>
            <div>
              <p className="heading-lg text-[var(--color-text)]">
                Activates after your first cycle closes
              </p>
              <p className="body-sm mt-2 text-[var(--color-text-muted)] max-w-[520px]">
                Once an annual cycle ends with final ratings, the engine auto-generates increment recommendations.
                Configure bands and approval chains in HR Settings now.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-3">
            <Link href="/hr/settings">
              <Button variant="primary">HR Settings</Button>
            </Link>
            <Link href="/hr/succession">
              <Button variant="secondary">View Succession</Button>
            </Link>
          </div>
        </div>
      </div>

      {/* ── Stat pills ───────────────────────────────────────────────── */}
      <div className="grid gap-3 md:grid-cols-3 stagger-in">
        {[
          { label: "Increments", value: "—", sub: "Pending cycle closure", accent: "var(--color-primary)" },
          { label: "Promotions", value: "—", sub: "Pending nominations", accent: "var(--color-success)" },
          { label: "Awaiting Approval", value: "—", sub: "No active approvals", accent: "var(--color-warning)" },
        ].map((card) => (
          <div
            key={card.label}
            className="glass-stat rounded-[var(--radius-md)] p-5"
            style={{ borderLeftWidth: 4, borderLeftColor: card.accent }}
          >
            <p className="caption text-[var(--color-text-muted)]">{card.label}</p>
            <p className="heading-xl mt-1 text-[var(--color-text-muted)]">{card.value}</p>
            <p className="caption mt-1 text-[var(--color-text-muted)]">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Interactive stepper ───────────────────────────────────────── */}
      <div className="glass rounded-[var(--radius-lg)] p-5 md:p-6">
        <p className="heading-lg text-[var(--color-text)] mb-1">How it works</p>
        <p className="caption text-[var(--color-text-muted)] mb-5">Click a step to explore details</p>

        {/* Horizontal connected nodes */}
        <div className="overflow-x-auto pb-2">
          <div className="flex items-start min-w-[680px]">
            {WORKFLOW_STEPS.map((step, i) => {
              const isActive = activeStep === step.id;
              return (
                <div key={step.id} className="flex flex-1 flex-col items-center">
                  <div className="flex w-full items-center">
                    <div className={`h-[2px] flex-1 transition-colors duration-300 ${i === 0 ? "bg-transparent" : isActive || activeStep === step.id - 1 ? "bg-[var(--color-primary)]" : "bg-[color-mix(in_srgb,var(--color-border)_60%,transparent)]"}`} />
                    <button
                      type="button"
                      onClick={() => setActiveStep(isActive ? null : step.id)}
                      className={`
                        relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all duration-250 glow-ring
                        ${isActive
                          ? "bg-[var(--color-primary)] text-[var(--color-button-text)] scale-115 shadow-[0_4px_16px_color-mix(in_srgb,var(--color-primary)_35%,transparent)]"
                          : "glass-subtle text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:scale-105"
                        }
                      `}
                    >
                      <span className="body-sm font-bold">{step.id}</span>
                    </button>
                    <div className={`h-[2px] flex-1 transition-colors duration-300 ${i === WORKFLOW_STEPS.length - 1 ? "bg-transparent" : isActive || activeStep === step.id + 1 ? "bg-[var(--color-primary)]" : "bg-[color-mix(in_srgb,var(--color-border)_60%,transparent)]"}`} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveStep(isActive ? null : step.id)}
                    className="mt-2.5 text-center group"
                  >
                    <p className={`caption font-semibold transition-colors duration-200 ${isActive ? "text-[var(--color-primary)]" : "text-[var(--color-text)] group-hover:text-[var(--color-primary)]"}`}>
                      {step.title}
                    </p>
                    <p className="caption text-[var(--color-text-muted)] max-w-[100px] mx-auto mt-0.5">{step.shortDesc}</p>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detail panel — glass inner card */}
        {activeStep !== null && (() => {
          const step = WORKFLOW_STEPS.find((s) => s.id === activeStep);
          if (!step) return null;
          return (
            <div className="mt-5 glass rounded-[var(--radius-md)] p-5 border-[color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))]" style={{ animation: "slideUp 0.3s ease-out both" }}>
              <div className="flex items-start gap-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary)] text-[var(--color-button-text)] shadow-[0_2px_8px_color-mix(in_srgb,var(--color-primary)_25%,transparent)]">
                  <span className="caption font-bold">{step.id}</span>
                </div>
                <div>
                  <p className="body font-semibold text-[var(--color-text)]">
                    Step {step.id}: {step.title}
                  </p>
                  <p className="body-sm mt-2 text-[var(--color-text-muted)] leading-relaxed">{step.detail}</p>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── Capability cards — expandable ─────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-3 stagger-in">
        {CAPABILITIES.map((cap, i) => {
          const isOpen = expandedCap === i;
          return (
            <button
              key={cap.title}
              type="button"
              onClick={() => setExpandedCap(isOpen ? null : i)}
              className={`
                text-left glass rounded-[var(--radius-md)] p-5 transition-all duration-250
                ${isOpen
                  ? "shadow-[0_8px_28px_color-mix(in_srgb,var(--color-primary)_12%,transparent)] scale-[1.01]"
                  : "hover:shadow-[var(--shadow-md)] hover:scale-[1.005]"
                }
              `}
              style={{ borderLeftWidth: 4, borderLeftColor: cap.accent }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: cap.accent }} />
                  <p className="body-sm font-semibold text-[var(--color-text)]">{cap.title}</p>
                </div>
                <Badge variant="default">Planned</Badge>
              </div>
              <p className="caption mt-1.5 text-[var(--color-text-muted)]">{cap.desc}</p>

              <div className={`overflow-hidden transition-all duration-300 ${isOpen ? "mt-3 max-h-44 opacity-100" : "max-h-0 opacity-0"}`}>
                <div className="space-y-2 border-t border-[color-mix(in_srgb,var(--color-border)_50%,transparent)] pt-3">
                  {cap.items.map((item) => (
                    <div key={item} className="flex items-center gap-2.5">
                      <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cap.accent, opacity: 0.7 }} />
                      <span className="caption text-[var(--color-text-muted)]">{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <p className={`caption mt-2.5 transition-all duration-200 ${isOpen ? "opacity-0 h-0 mt-0" : "text-[var(--color-text-muted)] opacity-50"}`}>
                Click to expand
              </p>
            </button>
          );
        })}
      </div>
    </Stack>
  );
}

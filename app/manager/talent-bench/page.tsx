"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Tooltip } from "@/src/components/ui";
import {
  fetchManagerTalentBench,
  ManagerTalentBenchRow,
} from "@/app/employee/_lib/pmsClient";

type TagFilter = "all" | "ready" | "needs_development" | "watch";

function tagColor(tag: string | null): string {
  const t = String(tag || "").toLowerCase();
  if (t === "ready") return "var(--color-success)";
  if (t === "needs_development") return "var(--color-warning)";
  if (t === "watch") return "var(--color-danger)";
  return "var(--color-border)";
}

function tagVariant(tag: string | null) {
  if (tag === "ready") return "success" as const;
  if (tag === "needs_development") return "warning" as const;
  if (tag === "watch") return "danger" as const;
  return "default" as const;
}

function bandVariant(band: string | null) {
  if (band === "high") return "success" as const;
  if (band === "medium") return "info" as const;
  if (band === "low") return "warning" as const;
  return "default" as const;
}

function trendVariant(trend: string | null) {
  if (trend === "improving") return "success" as const;
  if (trend === "stable") return "info" as const;
  if (trend === "declining") return "danger" as const;
  return "default" as const;
}

function fmt(value: string | null) {
  if (!value) return "—";
  return value.replace(/_/g, " ");
}

function readinessLabel(band: string | null) {
  if (band === "ready_now") return "Ready Now";
  if (band === "ready_1_2_years") return "1–2 Years";
  if (band === "emerging") return "Emerging";
  return "—";
}

function readinessBandVariant(band: string | null) {
  if (band === "ready_now") return "success" as const;
  if (band === "ready_1_2_years") return "info" as const;
  return "default" as const;
}

function nineBoxDot(perf: string | null, pot: string | null): { color: string; label: string } {
  const p = String(perf || "").toLowerCase();
  const po = String(pot || "").toLowerCase();
  if (p === "high" && po === "high") return { color: "var(--color-success)", label: "Star" };
  if (p === "high" && po === "medium") return { color: "#4ade80", label: "High Perf" };
  if (p === "high" && po === "low") return { color: "#86efac", label: "Workhorse" };
  if (p === "medium" && po === "high") return { color: "#60a5fa", label: "High Pot" };
  if (p === "medium" && po === "medium") return { color: "var(--color-info)", label: "Core" };
  if (p === "medium" && po === "low") return { color: "var(--color-warning)", label: "Effective" };
  if (p === "low" && po === "high") return { color: "#c084fc", label: "Enigma" };
  if (p === "low" && po === "medium") return { color: "#fb923c", label: "Dilemma" };
  if (p === "low" && po === "low") return { color: "var(--color-danger)", label: "Concern" };
  return { color: "var(--color-border)", label: "—" };
}

// ── Funnel ──────────────────────────────────────────────────────────────────

interface FunnelStage { label: string; count: number; color: string; width: string }

function PipelineFunnel({ stages }: { stages: FunnelStage[] }) {
  return (
    <div className="flex flex-col gap-2 items-center">
      {stages.map((stage) => (
        <div key={stage.label} className="flex items-center w-full" style={{ maxWidth: stage.width }}>
          <div
            className="flex-1 flex items-center justify-between rounded-[var(--radius-sm)] px-4 py-3 glass-stat transition-all duration-250 hover:scale-[1.015]"
            style={{ borderLeftWidth: 4, borderLeftColor: stage.color }}
          >
            <span className="body-sm font-medium text-[var(--color-text)]">{stage.label}</span>
            <span className="heading-md font-bold" style={{ color: stage.color }}>{stage.count}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

export default function ManagerTalentBenchPage() {
  const [rows, setRows] = useState<ManagerTalentBenchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tagFilter, setTagFilter] = useState<TagFilter>("all");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setRows((await fetchManagerTalentBench()).rows || []); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to load talent bench."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => rows.filter((r) => tagFilter === "all" || r.successionTag === tagFilter), [rows, tagFilter]);
  const promoReady = useMemo(() => rows.filter((r) => r.isPromotionReady), [rows]);

  const funnelStages: FunnelStage[] = useMemo(() => [
    { label: "Emerging", count: rows.filter((r) => r.readinessBand === "emerging").length, color: "var(--color-text-muted)", width: "100%" },
    { label: "Ready 1–2 Years", count: rows.filter((r) => r.readinessBand === "ready_1_2_years").length, color: "var(--color-info)", width: "80%" },
    { label: "Ready Now", count: rows.filter((r) => r.readinessBand === "ready_now").length, color: "var(--color-primary)", width: "60%" },
    { label: "Promotion Ready", count: promoReady.length, color: "var(--color-success)", width: "44%" },
  ], [rows, promoReady]);

  const counts = useMemo(() => ({
    ready: rows.filter((r) => r.successionTag === "ready").length,
    needs_development: rows.filter((r) => r.successionTag === "needs_development").length,
    watch: rows.filter((r) => r.successionTag === "watch").length,
  }), [rows]);

  return (
    <Stack gap="4" className="fade-in">
      <PageHeader
        title="Talent Bench"
        subtitle="Your team's succession readiness and promotion pipeline."
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowGuide((p) => !p)}>
              {showGuide ? "Hide guide" : "How it works"}
            </Button>
            <Button variant="secondary" onClick={load} disabled={loading}>Refresh</Button>
          </div>
        }
      />

      {error && <Alert variant="error" title="Error" description={error} onDismiss={() => setError("")} />}

      {/* Collapsible guide */}
      {showGuide && (
        <div className="glass rounded-[var(--radius-md)] p-5" style={{ animation: "slideUp 0.25s ease-out both" }}>
          <div className="grid gap-4 md:grid-cols-3 body-sm text-[var(--color-text-muted)]">
            <div>
              <p className="font-semibold text-[var(--color-text)] mb-1">Performance & Potential</p>
              <p>Derived from cycle scores and trajectory. High ≥380, Medium ≥280, Low &lt;280.</p>
            </div>
            <div>
              <p className="font-semibold text-[var(--color-text)] mb-1">Readiness & 9-Box</p>
              <p>High/High = Star (Ready Now). Mixed = 1–2 Yrs. Rest = Emerging. Score 0–100.</p>
            </div>
            <div>
              <p className="font-semibold text-[var(--color-text)] mb-1">Tags & Promotion</p>
              <p>Tags auto-computed or HR-set. Promotion Ready explicitly marked by HR.</p>
            </div>
          </div>
        </div>
      )}

      {/* Funnel + stats */}
      <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
        <div className="glass rounded-[var(--radius-lg)] p-5">
          <p className="heading-lg text-[var(--color-text)] mb-1">Succession Funnel</p>
          <p className="caption text-[var(--color-text-muted)] mb-4">Bench depth at a glance</p>
          {loading
            ? <p className="caption py-6 text-center text-[var(--color-text-muted)]">Loading...</p>
            : <PipelineFunnel stages={funnelStages} />
          }
        </div>

        <div className="grid grid-cols-2 gap-3 content-start stagger-in">
          {[
            { label: "Team Size", value: rows.length, color: "var(--color-text)" },
            { label: "Ready", value: counts.ready, color: "var(--color-success)" },
            { label: "Needs Dev", value: counts.needs_development, color: "var(--color-warning)" },
            { label: "Watch", value: counts.watch, color: "var(--color-danger)" },
          ].map((c) => (
            <div key={c.label} className="glass-stat rounded-[var(--radius-md)] p-3.5" style={{ borderLeftWidth: 4, borderLeftColor: c.color }}>
              <p className="caption text-[var(--color-text-muted)]">{c.label}</p>
              <p className="heading-lg mt-0.5" style={{ color: c.color }}>{loading ? "..." : c.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Promotion pipeline */}
      {promoReady.length > 0 && (
        <div className="glass rounded-[var(--radius-lg)] p-5">
          <p className="heading-lg text-[var(--color-text)] mb-1">Promotion Pipeline</p>
          <p className="caption text-[var(--color-text-muted)] mb-3">Marked ready by HR</p>
          <div className="space-y-2">
            {promoReady.map((r) => {
              const dot = nineBoxDot(r.performanceBand, r.potentialBand);
              return (
                <div key={r.employeeId} className="flex items-center justify-between gap-3 glass-subtle rounded-[var(--radius-sm)] px-4 py-3 transition-all duration-200 hover:shadow-[var(--shadow-sm)]" style={{ borderLeftWidth: 3, borderLeftColor: "var(--color-success)" }}>
                  <div className="flex items-center gap-3">
                    <div className="h-3.5 w-3.5 rounded-full ring-2 ring-[color-mix(in_srgb,var(--color-surface)_80%,transparent)]" style={{ backgroundColor: dot.color }} />
                    <div>
                      <p className="body-sm font-medium text-[var(--color-text)]">{r.name}</p>
                      <p className="caption text-[var(--color-text-muted)]">{r.department || "—"} · {dot.label}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="success">Promotion Ready</Badge>
                    {r.readinessScore !== null && <span className="caption text-[var(--color-text-muted)]">Score: {r.readinessScore}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pill filters */}
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "ready", "needs_development", "watch"] as TagFilter[]).map((pill) => {
          const active = tagFilter === pill;
          const count = pill === "all" ? rows.length : counts[pill as keyof typeof counts] ?? 0;
          const label = pill === "all" ? "All" : pill === "needs_development" ? "Needs Dev" : pill.charAt(0).toUpperCase() + pill.slice(1);
          return (
            <button key={pill} type="button" onClick={() => setTagFilter(pill)}
              className={`rounded-full px-4 py-1.5 caption font-medium transition-all duration-200 ${active ? "pill-active" : "glass-subtle text-[var(--color-text-muted)] hover:text-[var(--color-text)] glow-ring"}`}
            >{label} ({count})</button>
          );
        })}
        <span className="ml-auto caption text-[var(--color-text-muted)]">Showing {filtered.length}</span>
      </div>

      {/* Table */}
      <div className="glass rounded-[var(--radius-lg)] overflow-hidden">
        {loading && <p className="caption py-8 text-center text-[var(--color-text-muted)]">Loading talent bench...</p>}
        {!loading && (
          <div className="overflow-x-auto">
            <table className="w-full text-left body-sm">
              <thead>
                <tr className="border-b border-[color-mix(in_srgb,var(--color-border)_50%,transparent)]" style={{ background: "color-mix(in srgb, var(--color-surface) 50%, transparent)" }}>
                  <th className="py-3.5 pl-4 pr-2 w-[20px]" />
                  <th className="py-3.5 pr-4 font-semibold text-[var(--color-text-muted)]">Employee</th>
                  <th className="py-3.5 pr-4 font-semibold text-[var(--color-text-muted)]">Performance</th>
                  <th className="py-3.5 pr-4 font-semibold text-[var(--color-text-muted)]">Potential</th>
                  <th className="py-3.5 pr-4 font-semibold text-[var(--color-text-muted)]">Readiness</th>
                  <th className="py-3.5 pr-4 font-semibold text-[var(--color-text-muted)]">Score</th>
                  <th className="py-3.5 pr-4 font-semibold text-[var(--color-text-muted)]">Tag</th>
                  <th className="py-3.5 pr-4 font-semibold text-[var(--color-text-muted)]">Trend</th>
                  <th className="py-3.5 pr-4 font-semibold text-[var(--color-text-muted)]">Promotion</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const isOpen = expandedRow === row.employeeId;
                  const dot = nineBoxDot(row.performanceBand, row.potentialBand);
                  return (
                    <Fragment key={row.employeeId}>
                      <tr
                        className={`border-b border-[color-mix(in_srgb,var(--color-border)_40%,transparent)] transition-all duration-150 cursor-pointer ${isOpen ? "bg-[color-mix(in_srgb,var(--color-primary)_5%,transparent)]" : "hover:bg-[color-mix(in_srgb,var(--color-primary)_3%,transparent)]"}`}
                        style={{ borderLeftWidth: 3, borderLeftColor: tagColor(row.successionTag) }}
                        onClick={() => setExpandedRow(isOpen ? null : row.employeeId)}
                      >
                        <td className="py-3.5 pl-4 pr-2">
                          <Tooltip content={`9-Box: ${dot.label}`} position="top">
                            <div className="h-3.5 w-3.5 rounded-full ring-2 ring-[color-mix(in_srgb,var(--color-surface)_80%,transparent)]" style={{ backgroundColor: dot.color }} />
                          </Tooltip>
                        </td>
                        <td className="py-3.5 pr-4">
                          <p className="body-sm font-medium text-[var(--color-text)]">{row.name}</p>
                          <p className="caption text-[var(--color-text-muted)]">{row.department || "—"}</p>
                        </td>
                        <td className="py-3.5 pr-4"><Badge variant={bandVariant(row.performanceBand)}>{fmt(row.performanceBand)}</Badge></td>
                        <td className="py-3.5 pr-4"><Badge variant={bandVariant(row.potentialBand)}>{fmt(row.potentialBand)}</Badge></td>
                        <td className="py-3.5 pr-4"><Badge variant={readinessBandVariant(row.readinessBand)}>{readinessLabel(row.readinessBand)}</Badge></td>
                        <td className="py-3.5 pr-4"><span className="body-sm font-semibold text-[var(--color-text)]">{row.readinessScore !== null ? row.readinessScore : "—"}</span></td>
                        <td className="py-3.5 pr-4">{row.successionTag ? <Badge variant={tagVariant(row.successionTag)}>{fmt(row.successionTag)}</Badge> : <span className="caption text-[var(--color-text-muted)]">—</span>}</td>
                        <td className="py-3.5 pr-4">{row.trendLabel ? <Badge variant={trendVariant(row.trendLabel)}>{row.trendLabel}</Badge> : <span className="caption text-[var(--color-text-muted)]">—</span>}</td>
                        <td className="py-3.5 pr-4">{row.isPromotionReady ? <Badge variant="success">Ready</Badge> : <span className="caption text-[var(--color-text-muted)]">—</span>}</td>
                      </tr>

                      {isOpen && (
                        <tr className="border-b border-[color-mix(in_srgb,var(--color-border)_40%,transparent)]">
                          <td colSpan={9} className="p-0">
                            <div className="px-6 py-5" style={{ background: "color-mix(in srgb, var(--color-primary) 3%, transparent)", animation: "slideUp 0.25s ease-out both" }}>
                              <div className="flex flex-wrap gap-4">
                                {[
                                  { label: "9-Box", value: dot.label, dotColor: dot.color },
                                  { label: "Score", value: `${row.readinessScore ?? "—"} / 100` },
                                  { label: "Performance", value: fmt(row.performanceBand) },
                                  { label: "Potential", value: fmt(row.potentialBand) },
                                  { label: "Trend", value: fmt(row.trendLabel) },
                                ].map((item) => (
                                  <div key={item.label} className="glass-subtle rounded-[var(--radius-sm)] px-3.5 py-2.5">
                                    <p className="caption text-[var(--color-text-muted)]">{item.label}</p>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                      {"dotColor" in item && item.dotColor && <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.dotColor }} />}
                                      <span className="body-sm font-semibold text-[var(--color-text)] capitalize">{item.value}</span>
                                    </div>
                                  </div>
                                ))}
                                {row.isPromotionReady && (
                                  <div className="glass-subtle rounded-[var(--radius-sm)] px-3.5 py-2.5">
                                    <p className="caption text-[var(--color-text-muted)]">Promotion</p>
                                    <Badge variant="success">Ready</Badge>
                                  </div>
                                )}
                              </div>
                              {row.email && <p className="caption text-[var(--color-text-muted)] mt-3">{row.email}</p>}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-10 text-center">
                      <p className="body-sm text-[var(--color-text-muted)]">No employees match the current filter.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Stack>
  );
}

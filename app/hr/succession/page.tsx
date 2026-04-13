"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Select, Textarea, Tooltip } from "@/src/components/ui";
import {
  fetchHrSuccessionDashboard,
  HrSuccessionDashboardData,
  HrSuccessionDashboardRow,
  overrideHrSuccessionTag,
  markPromotionReady,
} from "@/app/employee/_lib/pmsClient";

type SuccessionTag = "ready" | "needs_development" | "watch";
type TagFilterValue = "all" | SuccessionTag;

const TAG_OPTIONS = [
  { value: "ready", label: "Ready" },
  { value: "needs_development", label: "Needs Development" },
  { value: "watch", label: "Watch" },
] as const;

const EMPTY_DATA: HrSuccessionDashboardData = {
  filters: { successionTag: null, department: null, performanceBand: null, cycleId: null },
  total: 0,
  rows: [],
};

function tagColor(tag: string | null): string {
  const t = String(tag || "").toLowerCase();
  if (t === "ready") return "var(--color-success)";
  if (t === "needs_development") return "var(--color-warning)";
  if (t === "watch") return "var(--color-danger)";
  return "var(--color-border)";
}

function toTagBadgeVariant(tag: string | null) {
  const t = String(tag || "").toLowerCase();
  if (t === "ready") return "success" as const;
  if (t === "needs_development") return "warning" as const;
  if (t === "watch") return "danger" as const;
  return "default" as const;
}

function toBandBadgeVariant(band: string | null) {
  const b = String(band || "").toLowerCase();
  if (b === "high") return "success" as const;
  if (b === "medium") return "info" as const;
  if (b === "low") return "warning" as const;
  return "default" as const;
}

function toTrendBadgeVariant(trend: string | null) {
  const t = String(trend || "").toLowerCase();
  if (t === "improving") return "success" as const;
  if (t === "stable") return "info" as const;
  if (t === "declining") return "danger" as const;
  return "default" as const;
}

function formatLabel(value: string | null) {
  const v = String(value || "").toLowerCase();
  if (!v) return "n/a";
  return v.replace(/_/g, " ");
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

function parseExplainability(value: string | null) {
  const text = String(value || "").trim();
  if (!text) return { summary: "", factors: [] as string[] };
  try {
    const parsed = JSON.parse(text);
    const summary = String(parsed?.summary || "").trim();
    const factors = Array.isArray(parsed?.factors) ? parsed.factors.map((i: unknown) => String(i || "").trim()).filter(Boolean) : [];
    if (summary || factors.length > 0) return { summary, factors };
  } catch { /* plain text fallback */ }
  return { summary: text, factors: [] as string[] };
}

// ── Distribution bar ────────────────────────────────────────────────────────

function DistributionBar({ ready, needsDev, watch, total }: { ready: number; needsDev: number; watch: number; total: number }) {
  if (total === 0) {
    return (
      <div className="flex h-7 items-center rounded-full glass-subtle px-4">
        <span className="caption text-[var(--color-text-muted)]">No data — run succession evaluation first</span>
      </div>
    );
  }
  const pR = (ready / total) * 100;
  const pN = (needsDev / total) * 100;
  const pW = (watch / total) * 100;
  return (
    <div className="space-y-2.5">
      <div className="flex h-6 w-full overflow-hidden rounded-full glass-subtle">
        {pR > 0 && <div className="flex items-center justify-center transition-all duration-700 ease-out" style={{ width: `${pR}%`, background: "linear-gradient(135deg, var(--color-success), color-mix(in srgb, var(--color-success) 80%, #4ade80))" }}>{pR >= 12 && <span className="caption font-semibold text-white">{ready}</span>}</div>}
        {pN > 0 && <div className="flex items-center justify-center transition-all duration-700 ease-out" style={{ width: `${pN}%`, background: "linear-gradient(135deg, var(--color-warning), color-mix(in srgb, var(--color-warning) 80%, #fbbf24))" }}>{pN >= 12 && <span className="caption font-semibold text-white">{needsDev}</span>}</div>}
        {pW > 0 && <div className="flex items-center justify-center transition-all duration-700 ease-out" style={{ width: `${pW}%`, background: "linear-gradient(135deg, var(--color-danger), color-mix(in srgb, var(--color-danger) 80%, #f87171))" }}>{pW >= 12 && <span className="caption font-semibold text-white">{watch}</span>}</div>}
      </div>
      <div className="flex gap-5">
        {[
          { label: "Ready", count: ready, color: "var(--color-success)" },
          { label: "Needs Dev", count: needsDev, color: "var(--color-warning)" },
          { label: "Watch", count: watch, color: "var(--color-danger)" },
        ].map((l) => (
          <span key={l.label} className="flex items-center gap-1.5 caption text-[var(--color-text-muted)]">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color }} /> {l.label} ({l.count})
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Toggle switch ───────────────────────────────────────────────────────────

function ToggleSwitch({ on, loading, onToggle }: { on: boolean; loading: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={loading}
      onClick={onToggle}
      className={`
        relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-all duration-250
        ${loading ? "opacity-40 cursor-not-allowed" : ""}
        ${on
          ? "bg-[var(--color-success)] shadow-[0_0_8px_color-mix(in_srgb,var(--color-success)_35%,transparent)]"
          : "glass-subtle"
        }
      `}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${on ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

export default function HrSuccessionPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingForEmployeeId, setSavingForEmployeeId] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<TagFilterValue>("all");
  const [data, setData] = useState<HrSuccessionDashboardData>(EMPTY_DATA);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [editTag, setEditTag] = useState<SuccessionTag>("watch");
  const [editReason, setEditReason] = useState("");
  const [promotionReadyIds, setPromotionReadyIds] = useState<Set<string>>(new Set());
  const [togglingPromotionFor, setTogglingPromotionFor] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const togglePromo = async (eid: string, current: boolean) => {
    setTogglingPromotionFor(eid);
    setError("");
    try {
      await markPromotionReady(eid, !current);
      setPromotionReadyIds((prev) => { const n = new Set(prev); if (!current) n.add(eid); else n.delete(eid); return n; });
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to update promotion status."); }
    finally { setTogglingPromotionFor(null); }
  };

  const loadData = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await fetchHrSuccessionDashboard({ successionTag: tagFilter === "all" ? undefined : tagFilter })); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to load data."); setData(EMPTY_DATA); }
    finally { setLoading(false); }
  }, [tagFilter]);

  useEffect(() => { void loadData(); }, [loadData]);

  const counts = useMemo(() => {
    const s = { ready: 0, needs_development: 0, watch: 0 };
    (data.rows || []).forEach((r) => { const t = String(r.successionTag || "").toLowerCase(); if (t === "ready") s.ready++; if (t === "needs_development") s.needs_development++; if (t === "watch") s.watch++; });
    return s;
  }, [data.rows]);

  const beginEdit = (row: HrSuccessionDashboardRow) => { setEditingEmployeeId(row.employeeId); setEditTag((row.successionTag || "watch") as SuccessionTag); setEditReason(""); };
  const cancelEdit = () => { setEditingEmployeeId(null); setEditTag("watch"); setEditReason(""); };

  const saveOverride = async () => {
    if (!editingEmployeeId) return;
    const reason = editReason.trim();
    if (!reason) { setError("Override reason is required."); return; }
    setSavingForEmployeeId(editingEmployeeId); setError("");
    try { await overrideHrSuccessionTag(editingEmployeeId, { successionTag: editTag, overrideReason: reason }); await loadData(); cancelEdit(); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to save override."); }
    finally { setSavingForEmployeeId(null); }
  };

  return (
    <Stack gap="4" className="fade-in">
      <PageHeader
        title="Succession Planning"
        subtitle="Readiness signals, 9-box mapping, and promotion pipeline."
        actions={<Button variant="secondary" onClick={loadData} disabled={loading}>Refresh</Button>}
      />

      {error && <Alert variant="error" title="Error" description={error} onDismiss={() => setError("")} />}

      {/* Distribution */}
      <div className="glass rounded-[var(--radius-md)] p-5">
        <DistributionBar ready={counts.ready} needsDev={counts.needs_development} watch={counts.watch} total={data.total} />
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 md:grid-cols-4 stagger-in">
        {[
          { label: "Employees", value: data.total, color: "var(--color-text)" },
          { label: "Ready", value: counts.ready, color: "var(--color-success)" },
          { label: "Needs Development", value: counts.needs_development, color: "var(--color-warning)" },
          { label: "Watch", value: counts.watch, color: "var(--color-danger)" },
        ].map((c) => (
          <div key={c.label} className="glass-stat rounded-[var(--radius-md)] p-4" style={{ borderLeftWidth: 4, borderLeftColor: c.color }}>
            <p className="caption text-[var(--color-text-muted)]">{c.label}</p>
            <p className="heading-xl mt-1" style={{ color: c.color }}>{loading ? "..." : c.value}</p>
          </div>
        ))}
      </div>

      {/* Pill filters */}
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "ready", "needs_development", "watch"] as TagFilterValue[]).map((pill) => {
          const active = tagFilter === pill;
          const label = pill === "all" ? "All" : pill === "needs_development" ? "Needs Dev" : pill.charAt(0).toUpperCase() + pill.slice(1);
          return (
            <button key={pill} type="button" onClick={() => setTagFilter(pill)}
              className={`rounded-full px-4 py-1.5 caption font-medium transition-all duration-200 ${active ? "pill-active" : "glass-subtle text-[var(--color-text-muted)] hover:text-[var(--color-text)] glow-ring"}`}
            >{label}</button>
          );
        })}
        <span className="ml-2 caption text-[var(--color-text-muted)]">{data.rows.length} employee{data.rows.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      <div className="glass rounded-[var(--radius-lg)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left body-sm">
            <thead>
              <tr className="border-b border-[color-mix(in_srgb,var(--color-border)_50%,transparent)]" style={{ background: "color-mix(in srgb, var(--color-surface) 50%, transparent)" }}>
                <th className="py-3.5 pl-4 pr-2 w-[20px]" />
                <th className="py-3.5 pr-4 font-semibold text-[var(--color-text-muted)]">Employee</th>
                <th className="py-3.5 pr-4 font-semibold text-[var(--color-text-muted)]">Performance</th>
                <th className="py-3.5 pr-4 font-semibold text-[var(--color-text-muted)]">Potential</th>
                <th className="py-3.5 pr-4 font-semibold text-[var(--color-text-muted)]">Score</th>
                <th className="py-3.5 pr-4 font-semibold text-[var(--color-text-muted)]">Tag</th>
                <th className="py-3.5 pr-4 font-semibold text-[var(--color-text-muted)]">Trend</th>
                <th className="py-3.5 pr-4 font-semibold text-[var(--color-text-muted)] text-center">Promote</th>
                <th className="py-3.5 pr-4 w-[32px]" />
              </tr>
            </thead>
            <tbody>
              {(data.rows || []).map((row) => {
                const isEditing = editingEmployeeId === row.employeeId;
                const isSaving = savingForEmployeeId === row.employeeId;
                const isPromo = promotionReadyIds.has(row.employeeId);
                const isToggling = togglingPromotionFor === row.employeeId;
                const isOpen = expandedRow === row.employeeId;
                const dot = nineBoxDot(row.performanceBand, row.potentialBand);
                const explain = parseExplainability(row.readinessReason);

                return (
                  <Fragment key={row.employeeId}>
                    <tr
                      className={`border-b border-[color-mix(in_srgb,var(--color-border)_40%,transparent)] transition-all duration-150 cursor-pointer ${isOpen ? "bg-[color-mix(in_srgb,var(--color-primary)_5%,transparent)]" : "hover:bg-[color-mix(in_srgb,var(--color-primary)_3%,transparent)]"}`}
                      style={{ borderLeftWidth: 3, borderLeftColor: tagColor(row.successionTag) }}
                      onClick={() => setExpandedRow(isOpen ? null : row.employeeId)}
                    >
                      <td className="py-4 pl-4 pr-2">
                        <Tooltip content={`9-Box: ${dot.label}`} position="top">
                          <div className="h-3.5 w-3.5 rounded-full ring-2 ring-[color-mix(in_srgb,var(--color-surface)_80%,transparent)]" style={{ backgroundColor: dot.color }} />
                        </Tooltip>
                      </td>
                      <td className="py-4 pr-4">
                        <p className="body-sm font-medium text-[var(--color-text)]">{row.name}</p>
                        <p className="caption text-[var(--color-text-muted)]">{row.role}</p>
                      </td>
                      <td className="py-4 pr-4"><Badge variant={toBandBadgeVariant(row.performanceBand)}>{formatLabel(row.performanceBand)}</Badge></td>
                      <td className="py-4 pr-4"><Badge variant={toBandBadgeVariant(row.potentialBand)}>{formatLabel(row.potentialBand)}</Badge></td>
                      <td className="py-4 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="body-sm font-semibold text-[var(--color-text)]">{row.readinessScore ?? "—"}</span>
                          {row.readinessReason && (
                            <Tooltip content={<div className="max-w-[320px] whitespace-normal"><p className="body-sm font-medium text-[var(--color-text)]">{explain.summary}</p>{explain.factors.length > 0 && <ul className="mt-1.5 list-disc pl-4 caption text-[var(--color-text)]">{explain.factors.map((f: string) => <li key={f}>{f}</li>)}</ul>}</div>} position="top">
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full glass-subtle caption text-[var(--color-text-muted)] cursor-help">i</span>
                            </Tooltip>
                          )}
                        </div>
                      </td>
                      <td className="py-4 pr-4"><Badge variant={toTagBadgeVariant(row.successionTag)}>{formatLabel(row.successionTag)}</Badge></td>
                      <td className="py-4 pr-4"><Badge variant={toTrendBadgeVariant(row.trendLabel)}>{formatLabel(row.trendLabel)}</Badge></td>
                      <td className="py-4 pr-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">
                          <ToggleSwitch on={isPromo} loading={isToggling} onToggle={() => togglePromo(row.employeeId, isPromo)} />
                          {isPromo && <span className="caption font-semibold text-[var(--color-success)]">Yes</span>}
                        </div>
                      </td>
                      <td className="py-4 pr-4">
                        <span className={`inline-block transition-transform duration-200 caption text-[var(--color-text-muted)] ${isOpen ? "rotate-90" : ""}`}>&#9654;</span>
                      </td>
                    </tr>

                    {/* Expanded detail */}
                    {isOpen && (
                      <tr className="border-b border-[color-mix(in_srgb,var(--color-border)_40%,transparent)]">
                        <td colSpan={9} className="p-0">
                          <div className="px-6 py-5 space-y-4" style={{ background: "color-mix(in srgb, var(--color-primary) 3%, transparent)", animation: "slideUp 0.25s ease-out both" }}>
                            <div className="flex flex-wrap gap-5">
                              {[
                                { label: "9-Box", value: dot.label, dotColor: dot.color },
                                { label: "Score", value: `${row.readinessScore ?? "—"} / 100` },
                                { label: "Performance", value: formatLabel(row.performanceBand) },
                                { label: "Potential", value: formatLabel(row.potentialBand) },
                                { label: "Trend", value: formatLabel(row.trendLabel) },
                              ].map((item) => (
                                <div key={item.label} className="glass-subtle rounded-[var(--radius-sm)] px-3.5 py-2.5">
                                  <p className="caption text-[var(--color-text-muted)]">{item.label}</p>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    {"dotColor" in item && item.dotColor && <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.dotColor }} />}
                                    <span className="body-sm font-semibold text-[var(--color-text)] capitalize">{item.value}</span>
                                  </div>
                                </div>
                              ))}
                              {isPromo && (
                                <div className="glass-subtle rounded-[var(--radius-sm)] px-3.5 py-2.5 border-[var(--color-success)]">
                                  <p className="caption text-[var(--color-text-muted)]">Promotion</p>
                                  <Badge variant="success">Ready</Badge>
                                </div>
                              )}
                            </div>

                            {explain.summary && (
                              <div className="glass-subtle rounded-[var(--radius-sm)] p-4">
                                <p className="caption font-semibold text-[var(--color-text)] mb-1">Readiness Analysis</p>
                                <p className="caption text-[var(--color-text-muted)] leading-relaxed">{explain.summary}</p>
                                {explain.factors.length > 0 && (
                                  <ul className="mt-2 space-y-1">{explain.factors.map((f: string) => (
                                    <li key={f} className="flex items-center gap-2 caption text-[var(--color-text-muted)]">
                                      <span className="h-1 w-1 rounded-full bg-[var(--color-text-muted)]" />{f}
                                    </li>
                                  ))}</ul>
                                )}
                              </div>
                            )}

                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                              <Button variant="secondary" size="sm" onClick={() => beginEdit(row)} disabled={Boolean(savingForEmployeeId)}>Override Tag</Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Override editor */}
                    {isEditing && (
                      <tr className="border-b border-[color-mix(in_srgb,var(--color-border)_40%,transparent)]">
                        <td colSpan={9} className="py-4 px-6">
                          <div className="glass rounded-[var(--radius-md)] p-4" style={{ animation: "slideUp 0.2s ease-out both" }}>
                            <p className="body-sm font-semibold text-[var(--color-text)] mb-3">HR Override — {row.name}</p>
                            <div className="grid gap-3 md:grid-cols-3">
                              <Select label="Succession Tag" options={TAG_OPTIONS.map((i) => ({ value: i.value, label: i.label }))} value={editTag} onChange={(e) => setEditTag(e.target.value as SuccessionTag)} />
                              <div className="md:col-span-2">
                                <Textarea label="Override Reason" value={editReason} onChange={(e) => setEditReason(e.target.value)} placeholder="Explain why HR is overriding the suggested tag..." rows={3} />
                              </div>
                            </div>
                            <div className="mt-3 flex items-center gap-2">
                              <Button onClick={saveOverride} disabled={isSaving}>{isSaving ? "Saving..." : "Save Override"}</Button>
                              <Button variant="ghost" onClick={cancelEdit} disabled={isSaving}>Cancel</Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}

              {!loading && data.rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-10 text-center">
                    <p className="body-sm text-[var(--color-text-muted)]">No succession data yet.</p>
                    <p className="caption text-[var(--color-text-muted)] mt-1">Run the succession evaluation to populate this table.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Stack>
  );
}

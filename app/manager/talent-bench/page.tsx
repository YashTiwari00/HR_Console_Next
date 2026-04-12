"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Card } from "@/src/components/ui";
import {
  fetchManagerTalentBench,
  ManagerTalentBenchRow,
} from "@/app/employee/_lib/pmsClient";

type TagFilter = "all" | "ready" | "needs_development" | "watch";
type BandFilter = "all" | "high" | "medium" | "low";

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

function readinessLabel(band: string | null) {
  if (band === "ready_now") return "Ready Now";
  if (band === "ready_1_2_years") return "Ready 1–2 Yrs";
  if (band === "emerging") return "Emerging";
  return "n/a";
}

function readinessBandVariant(band: string | null) {
  if (band === "ready_now") return "success" as const;
  if (band === "ready_1_2_years") return "info" as const;
  if (band === "emerging") return "default" as const;
  return "default" as const;
}

function fmt(value: string | null) {
  if (!value) return "n/a";
  return value.replace(/_/g, " ");
}

export default function ManagerTalentBenchPage() {
  const [rows, setRows] = useState<ManagerTalentBenchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [tagFilter, setTagFilter] = useState<TagFilter>("all");
  const [bandFilter, setBandFilter] = useState<BandFilter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchManagerTalentBench();
      setRows(data.rows || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load talent bench.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (tagFilter !== "all" && r.successionTag !== tagFilter) return false;
      if (bandFilter !== "all" && r.performanceBand !== bandFilter) return false;
      return true;
    });
  }, [rows, tagFilter, bandFilter]);

  const promotionReady = useMemo(() => rows.filter((r) => r.isPromotionReady), [rows]);

  const counts = useMemo(() => ({
    ready: rows.filter((r) => r.successionTag === "ready").length,
    needs_development: rows.filter((r) => r.successionTag === "needs_development").length,
    watch: rows.filter((r) => r.successionTag === "watch").length,
    ready_now: rows.filter((r) => r.readinessBand === "ready_now").length,
  }), [rows]);

  return (
    <Stack gap="4">
      <PageHeader
        title="Talent Bench"
        subtitle="Your team's succession readiness, performance bands, and promotion pipeline — powered by ratings and 9-box placement."
        actions={
          <Button variant="secondary" onClick={load} disabled={loading}>
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="error" title="Error" description={error} onDismiss={() => setError("")} />}

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card title="Team Size">
          <p className="heading-xl">{loading ? "..." : rows.length}</p>
        </Card>
        <Card title="Ready">
          <p className="heading-xl text-[var(--color-success)]">{loading ? "..." : counts.ready}</p>
        </Card>
        <Card title="Ready Now">
          <p className="heading-xl text-[var(--color-primary)]">{loading ? "..." : counts.ready_now}</p>
          <p className="caption text-[var(--color-text-muted)]">in 9-box</p>
        </Card>
        <Card title="Promotion Ready">
          <p className="heading-xl text-[var(--color-success)]">{loading ? "..." : promotionReady.length}</p>
          <p className="caption text-[var(--color-text-muted)]">marked by HR</p>
        </Card>
      </div>

      {/* Promotion pipeline */}
      {promotionReady.length > 0 && (
        <Card
          title="Promotion Pipeline"
          description="Employees HR has marked as ready for promotion."
        >
          <div className="space-y-2">
            {promotionReady.map((r) => (
              <div
                key={r.employeeId}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--color-success)] bg-[color-mix(in_srgb,var(--color-success)_6%,var(--color-surface))] px-3 py-2"
              >
                <div>
                  <p className="body-sm font-medium text-[var(--color-text)]">{r.name}</p>
                  <p className="caption text-[var(--color-text-muted)]">
                    {r.department || "No department"}
                    {r.readinessBand ? ` · ${readinessLabel(r.readinessBand)}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="success">Promotion Ready</Badge>
                  {r.successionTag && (
                    <Badge variant={tagVariant(r.successionTag)}>{fmt(r.successionTag)}</Badge>
                  )}
                  {r.readinessScore !== null && (
                    <span className="caption text-[var(--color-text-muted)]">Score: {r.readinessScore}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Filters */}
      <Card title="Filters">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="caption text-[var(--color-text-muted)]" htmlFor="tag-filter">
              Succession Tag
            </label>
            <select
              id="tag-filter"
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 body-sm text-[var(--color-text)]"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value as TagFilter)}
            >
              <option value="all">All</option>
              <option value="ready">Ready</option>
              <option value="needs_development">Needs Development</option>
              <option value="watch">Watch</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="caption text-[var(--color-text-muted)]" htmlFor="band-filter">
              Performance Band
            </label>
            <select
              id="band-filter"
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 body-sm text-[var(--color-text)]"
              value={bandFilter}
              onChange={(e) => setBandFilter(e.target.value as BandFilter)}
            >
              <option value="all">All</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <span className="caption text-[var(--color-text-muted)]">
            Showing {filtered.length} of {rows.length}
          </span>
        </div>
      </Card>

      {/* Team bench table */}
      <Card title="Team Readiness" description="Succession data derived from ratings, goal completion, and 9-box placement.">
        {loading && <p className="caption py-4">Loading...</p>}
        {!loading && (
          <div className="overflow-x-auto">
            <table className="w-full text-left body-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="py-3 pr-4">Employee</th>
                  <th className="py-3 pr-4">Performance</th>
                  <th className="py-3 pr-4">Potential</th>
                  <th className="py-3 pr-4">Readiness</th>
                  <th className="py-3 pr-4">Score</th>
                  <th className="py-3 pr-4">Tag</th>
                  <th className="py-3 pr-4">Trend</th>
                  <th className="py-3">Promotion</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.employeeId} className="border-b border-[var(--color-border)]">
                    <td className="py-3 pr-4">
                      <p className="body-sm font-medium text-[var(--color-text)]">{row.name}</p>
                      <p className="caption text-[var(--color-text-muted)]">{row.department || "No dept"}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant={bandVariant(row.performanceBand)}>
                        {fmt(row.performanceBand)}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant={bandVariant(row.potentialBand)}>
                        {fmt(row.potentialBand)}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant={readinessBandVariant(row.readinessBand)}>
                        {readinessLabel(row.readinessBand)}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="body-sm font-semibold text-[var(--color-text)]">
                        {row.readinessScore !== null ? row.readinessScore : "—"}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      {row.successionTag ? (
                        <Badge variant={tagVariant(row.successionTag)}>
                          {fmt(row.successionTag)}
                        </Badge>
                      ) : (
                        <span className="caption text-[var(--color-text-muted)]">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {row.trendLabel ? (
                        <Badge variant={trendVariant(row.trendLabel)}>
                          {row.trendLabel}
                        </Badge>
                      ) : (
                        <span className="caption text-[var(--color-text-muted)]">—</span>
                      )}
                    </td>
                    <td className="py-3">
                      {row.isPromotionReady ? (
                        <Badge variant="success">Ready</Badge>
                      ) : (
                        <span className="caption text-[var(--color-text-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-5 caption text-[var(--color-text-muted)]">
                      No employees match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* How data is computed */}
      <Card
        title="How this works"
        description="The talent bench is built automatically from your team's performance data."
      >
        <div className="space-y-2 body-sm text-[var(--color-text-muted)]">
          <p><strong className="text-[var(--color-text)]">Performance Band</strong> — derived from cycle scores (High ≥380, Medium ≥280, Low &lt;280).</p>
          <p><strong className="text-[var(--color-text)]">Potential Band</strong> — based on score trajectory and trend direction.</p>
          <p><strong className="text-[var(--color-text)]">Readiness Band</strong> — 9-box cell: High/High = Ready Now, mixed = Ready 1–2 Yrs, rest = Emerging.</p>
          <p><strong className="text-[var(--color-text)]">Readiness Score</strong> — 0–100, computed from last 3 cycles, goal completion %, and rating drops.</p>
          <p><strong className="text-[var(--color-text)]">Succession Tag</strong> — HR-assessed or auto-computed: Ready (80+), Needs Development (50–79), Watch (&lt;50).</p>
          <p><strong className="text-[var(--color-text)]">Promotion Ready</strong> — HR explicitly marks an employee as ready for promotion. Visible here and on the HR Succession dashboard.</p>
        </div>
      </Card>
    </Stack>
  );
}

"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Card, Select, Textarea, Tooltip } from "@/src/components/ui";
import {
  fetchHrSuccessionDashboard,
  HrSuccessionDashboardData,
  HrSuccessionDashboardRow,
  overrideHrSuccessionTag,
} from "@/app/employee/_lib/pmsClient";

type SuccessionTag = "ready" | "needs_development" | "watch";

type TagFilterValue = "all" | SuccessionTag;

const TAG_FILTER_OPTIONS = [
  { value: "all", label: "All Tags" },
  { value: "ready", label: "Ready" },
  { value: "needs_development", label: "Needs Development" },
  { value: "watch", label: "Watch" },
] as const;

const TAG_OPTIONS = [
  { value: "ready", label: "Ready" },
  { value: "needs_development", label: "Needs Development" },
  { value: "watch", label: "Watch" },
] as const;

const EMPTY_DATA: HrSuccessionDashboardData = {
  filters: {
    successionTag: null,
    department: null,
    performanceBand: null,
    cycleId: null,
  },
  total: 0,
  rows: [],
};

function toTagBadgeVariant(tag: string | null) {
  const normalized = String(tag || "").trim().toLowerCase();
  if (normalized === "ready") return "success" as const;
  if (normalized === "needs_development") return "warning" as const;
  if (normalized === "watch") return "danger" as const;
  return "default" as const;
}

function toBandBadgeVariant(band: string | null) {
  const normalized = String(band || "").trim().toLowerCase();
  if (normalized === "high") return "success" as const;
  if (normalized === "medium") return "info" as const;
  if (normalized === "low") return "warning" as const;
  return "default" as const;
}

function toTrendBadgeVariant(trend: string | null) {
  const normalized = String(trend || "").trim().toLowerCase();
  if (normalized === "improving") return "success" as const;
  if (normalized === "stable") return "info" as const;
  if (normalized === "declining") return "danger" as const;
  return "default" as const;
}

function formatTagLabel(tag: string | null) {
  const normalized = String(tag || "").trim().toLowerCase();
  if (!normalized) return "Unassigned";
  return normalized.replace(/_/g, " ");
}

function formatTrendLabel(trend: string | null) {
  const normalized = String(trend || "").trim().toLowerCase();
  if (!normalized) return "n/a";
  return normalized;
}

function formatBandLabel(band: string | null) {
  const normalized = String(band || "").trim().toLowerCase();
  if (!normalized) return "n/a";
  return normalized;
}

function parseReadinessExplainability(value: string | null) {
  const text = String(value || "").trim();
  if (!text) {
    return {
      summary: "No explainability details available.",
      factors: [],
    };
  }

  try {
    const parsed = JSON.parse(text);
    const summary = String(parsed?.summary || "").trim();
    const factors = Array.isArray(parsed?.factors)
      ? parsed.factors.map((item: unknown) => String(item || "").trim()).filter(Boolean)
      : [];

    if (summary || factors.length > 0) {
      return {
        summary: summary || "No explainability summary provided.",
        factors,
      };
    }
  } catch {
    // Backward compatibility for legacy plain-text readinessReason values.
  }

  return {
    summary: text,
    factors: [],
  };
}

export default function HrSuccessionPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingForEmployeeId, setSavingForEmployeeId] = useState<string | null>(null);

  const [tagFilter, setTagFilter] = useState<TagFilterValue>("all");
  const [data, setData] = useState<HrSuccessionDashboardData>(EMPTY_DATA);

  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [editTag, setEditTag] = useState<SuccessionTag>("watch");
  const [editReason, setEditReason] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const payload = await fetchHrSuccessionDashboard({
        successionTag: tagFilter === "all" ? undefined : tagFilter,
      });

      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load succession dashboard data.");
      setData(EMPTY_DATA);
    } finally {
      setLoading(false);
    }
  }, [tagFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const counts = useMemo(() => {
    const summary = {
      ready: 0,
      needs_development: 0,
      watch: 0,
    };

    (data.rows || []).forEach((row) => {
      const tag = String(row.successionTag || "").trim().toLowerCase();
      if (tag === "ready") summary.ready += 1;
      if (tag === "needs_development") summary.needs_development += 1;
      if (tag === "watch") summary.watch += 1;
    });

    return summary;
  }, [data.rows]);

  const beginEdit = (row: HrSuccessionDashboardRow) => {
    setEditingEmployeeId(row.employeeId);
    setEditTag((row.successionTag || "watch") as SuccessionTag);
    setEditReason("");
  };

  const cancelEdit = () => {
    setEditingEmployeeId(null);
    setEditTag("watch");
    setEditReason("");
  };

  const saveOverride = async () => {
    if (!editingEmployeeId) return;

    const reason = editReason.trim();
    if (!reason) {
      setError("Override reason is required.");
      return;
    }

    setSavingForEmployeeId(editingEmployeeId);
    setError("");

    try {
      await overrideHrSuccessionTag(editingEmployeeId, {
        successionTag: editTag,
        overrideReason: reason,
      });

      await loadData();
      cancelEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save succession override.");
    } finally {
      setSavingForEmployeeId(null);
    }
  };

  return (
    <Stack gap="4">
      <PageHeader
        title="Succession Planning"
        subtitle="HR dashboard for readiness signals, explainability, and succession overrides."
        actions={
          <Button variant="secondary" onClick={loadData} disabled={loading}>
            Refresh
          </Button>
        }
      />

      {error ? (
        <Alert
          variant="error"
          title="Unable to complete action"
          description={error}
          onDismiss={() => setError("")}
        />
      ) : null}

      <Card title="Filters" description="Use tags to focus on succession cohorts.">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="w-full md:max-w-xs">
            <Select
              label="Succession Tag"
              options={TAG_FILTER_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value as TagFilterValue)}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={loadData} disabled={loading}>
              Apply
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-4">
        <Card title="Employees">
          <p className="heading-xl">{loading ? "..." : data.total}</p>
        </Card>
        <Card title="Ready">
          <p className="heading-xl">{loading ? "..." : counts.ready}</p>
        </Card>
        <Card title="Needs Development">
          <p className="heading-xl">{loading ? "..." : counts.needs_development}</p>
        </Card>
        <Card title="Watch">
          <p className="heading-xl">{loading ? "..." : counts.watch}</p>
        </Card>
      </div>

      <Card title="Succession Table" description="Readiness data with in-row HR override actions.">
        <div className="overflow-x-auto">
          <table className="w-full text-left body-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="py-3 pr-4">Employee</th>
                <th className="py-3 pr-4">Performance</th>
                <th className="py-3 pr-4">Potential</th>
                <th className="py-3 pr-4">Readiness Score</th>
                <th className="py-3 pr-4">Succession Tag</th>
                <th className="py-3 pr-4">Trend</th>
              </tr>
            </thead>

            <tbody>
              {(data.rows || []).map((row) => {
                const isEditing = editingEmployeeId === row.employeeId;
                const isSaving = savingForEmployeeId === row.employeeId;
                const explainability = parseReadinessExplainability(row.readinessReason);

                return (
                  <Fragment key={row.employeeId}>
                    <tr className="border-b border-[var(--color-border)] align-top">
                      <td className="py-4 pr-4">
                        <div className="flex flex-col gap-1">
                          <p className="body-sm font-medium text-[var(--color-text)]">{row.name}</p>
                          <p className="caption">{row.role}</p>
                        </div>
                      </td>

                      <td className="py-4 pr-4">
                        <Badge variant={toBandBadgeVariant(row.performanceBand)}>
                          {formatBandLabel(row.performanceBand)}
                        </Badge>
                      </td>

                      <td className="py-4 pr-4">
                        <Badge variant={toBandBadgeVariant(row.potentialBand)}>
                          {formatBandLabel(row.potentialBand)}
                        </Badge>
                      </td>

                      <td className="py-4 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="body-sm font-semibold text-[var(--color-text)]">
                            {row.readinessScore ?? "n/a"}
                          </span>
                          {row.readinessReason ? (
                            <Tooltip
                              content={
                                <div className="inline-block max-w-[360px] whitespace-normal">
                                  <p className="body-sm font-medium text-[var(--color-text)]">
                                    {explainability.summary}
                                  </p>
                                  {explainability.factors.length > 0 ? (
                                    <ul className="mt-2 list-disc space-y-1 pl-4 caption text-[var(--color-text)]">
                                      {explainability.factors.map((factor) => (
                                        <li key={factor}>{factor}</li>
                                      ))}
                                    </ul>
                                  ) : null}
                                </div>
                              }
                              position="top"
                            >
                              <button
                                type="button"
                                className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]"
                                aria-label="View readiness reason"
                              >
                                i
                              </button>
                            </Tooltip>
                          ) : null}
                        </div>
                      </td>

                      <td className="py-4 pr-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={toTagBadgeVariant(row.successionTag)}>
                            {formatTagLabel(row.successionTag)}
                          </Badge>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => beginEdit(row)}
                            disabled={Boolean(savingForEmployeeId)}
                          >
                            Override
                          </Button>
                        </div>
                      </td>

                      <td className="py-4 pr-4">
                        <Badge variant={toTrendBadgeVariant(row.trendLabel)}>
                          {formatTrendLabel(row.trendLabel)}
                        </Badge>
                      </td>
                    </tr>

                    {isEditing ? (
                      <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)]">
                        <td colSpan={6} className="py-4">
                          <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                            <p className="body-sm font-medium text-[var(--color-text)] mb-3">
                              HR Override for {row.name}
                            </p>

                            <div className="grid gap-3 md:grid-cols-3">
                              <Select
                                label="Succession Tag"
                                options={TAG_OPTIONS.map((item) => ({
                                  value: item.value,
                                  label: item.label,
                                }))}
                                value={editTag}
                                onChange={(event) => setEditTag(event.target.value as SuccessionTag)}
                              />

                              <div className="md:col-span-2">
                                <Textarea
                                  label="Override Reason"
                                  value={editReason}
                                  onChange={(event) => setEditReason(event.target.value)}
                                  placeholder="Explain why HR is overriding the suggested tag..."
                                  rows={3}
                                />
                              </div>
                            </div>

                            <div className="mt-3 flex items-center gap-2">
                              <Button onClick={saveOverride} disabled={isSaving}>
                                {isSaving ? "Saving..." : "Save Override"}
                              </Button>
                              <Button variant="ghost" onClick={cancelEdit} disabled={isSaving}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}

              {!loading && data.rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-5 caption text-[var(--color-text-muted)]">
                    No succession rows available for this filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </Stack>
  );
}

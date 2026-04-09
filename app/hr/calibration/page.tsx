"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Grid, Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Card, Divider, Dropdown, Input, Textarea } from "@/src/components/ui";
import {
  CalibrationDecisionItem,
  CalibrationSessionItem,
  CalibrationTimelineItem,
  TeamMemberItem,
  createCalibrationDecision,
  createCalibrationSession,
  fetchCalibrationDecisions,
  fetchCalibrationSessions,
  fetchCalibrationTimeline,
  fetchTeamMembers,
  formatDate,
  getCycleIdFromDate,
} from "@/app/employee/_lib/pmsClient";

// ─── Rating label system ──────────────────────────────────────────────────────

const RATING_META: Record<number, { short: string; full: string; badgeClass: string }> = {
  5: { short: "DE",  full: "Distinguished",           badgeClass: "bg-[var(--color-badge-info-bg)] border-[var(--color-badge-info-border)] text-[var(--color-text)]" },
  4: { short: "EE",  full: "Exceeds Expectations",    badgeClass: "bg-[var(--color-badge-success-bg)] border-[var(--color-badge-success-border)] text-[var(--color-text)]" },
  3: { short: "ME",  full: "Meets Expectations",      badgeClass: "bg-[var(--color-surface-muted)] border-[var(--color-border)] text-[var(--color-text)]" },
  2: { short: "SME", full: "Solidly Meets",           badgeClass: "bg-[var(--color-badge-warning-bg)] border-[var(--color-badge-warning-border)] text-[var(--color-text)]" },
  1: { short: "NI",  full: "Needs Improvement",       badgeClass: "bg-[var(--color-badge-error-bg)] border-[var(--color-badge-error-border)] text-[var(--color-text)]" },
};

const RATING_ORDER: number[] = [5, 4, 3, 2, 1];

const RATING_OPTIONS = RATING_ORDER.map((n) => ({
  value: String(n),
  label: `${n} – ${RATING_META[n].short} (${RATING_META[n].full})`,
}));

function RatingBadge({ rating }: { rating: number | null | undefined }) {
  if (!rating || !RATING_META[rating]) {
    return <span className="caption text-[var(--color-text-muted)]">—</span>;
  }
  const meta = RATING_META[rating];
  return (
    <span className={`inline-flex items-center rounded-[var(--radius-sm)] border px-2 py-0.5 caption font-medium ${meta.badgeClass}`}>
      {meta.short}
    </span>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusVariant(status: string) {
  const s = String(status || "").trim().toLowerCase();
  if (s === "active") return "info" as const;
  if (s === "closed") return "success" as const;
  return "default" as const;
}

function memberName(map: Map<string, TeamMemberItem>, id: string | null | undefined) {
  if (!id) return "—";
  return map.get(id)?.name || id;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface EditForm {
  proposedRating: string;
  finalRating: string;
  rationale: string;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HrCalibrationPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [sessions, setSessions] = useState<CalibrationSessionItem[]>([]);
  const [members, setMembers] = useState<TeamMemberItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");

  const [decisions, setDecisions] = useState<CalibrationDecisionItem[]>([]);
  const [timeline, setTimeline] = useState<CalibrationTimelineItem[]>([]);

  const [creatingSession, setCreatingSession] = useState(false);
  const [creatingDecision, setCreatingDecision] = useState(false);

  // Matrix state
  const [managerFilter, setManagerFilter] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ proposedRating: "", finalRating: "", rationale: "" });
  const [saving, setSaving] = useState(false);

  const [sessionForm, setSessionForm] = useState({
    name: "",
    cycleId: getCycleIdFromDate(),
    status: "draft",
    scope: "organization",
    notes: "",
  });

  const [decisionForm, setDecisionForm] = useState({
    employeeId: "",
    managerId: "",
    previousRating: "",
    proposedRating: "3",
    finalRating: "",
    rationale: "",
  });

  // ─── Derived maps ───────────────────────────────────────────────────────────

  const memberById = useMemo(() => {
    const map = new Map<string, TeamMemberItem>();
    members.forEach((m) => map.set(m.$id, m));
    return map;
  }, [members]);

  const employees = useMemo(
    () => members.filter((m) => m.role === "employee"),
    [members]
  );

  const managers = useMemo(
    () => members.filter((m) => m.role === "manager"),
    [members]
  );

  const employeeOptions = useMemo(
    () => employees.map((m) => ({ label: `${m.name} (${m.department || "Unassigned"})`, value: m.$id })),
    [employees]
  );

  const managerOptions = useMemo(
    () => managers.map((m) => ({ label: `${m.name} (${m.department || "Manager"})`, value: m.$id })),
    [managers]
  );

  // Latest calibration decision per employee (highest version wins)
  const latestDecisionByEmployee = useMemo(() => {
    const map = new Map<string, CalibrationDecisionItem>();
    for (const d of decisions) {
      const current = map.get(d.employeeId);
      if (!current || d.version > current.version) {
        map.set(d.employeeId, d);
      }
    }
    return map;
  }, [decisions]);

  // All employee rows enriched with their latest decision
  const gridRows = useMemo(() => {
    return employees.map((emp) => {
      const decision = latestDecisionByEmployee.get(emp.$id) || null;
      const managerId = decision?.managerId || emp.managerId || null;
      return { emp, decision, managerId };
    });
  }, [employees, latestDecisionByEmployee]);

  const filteredGridRows = useMemo(() => {
    if (managerFilter === "all") return gridRows;
    return gridRows.filter((row) => row.managerId === managerFilter);
  }, [gridRows, managerFilter]);

  // ─── Rating distribution (labeled) ─────────────────────────────────────────

  const distribution = useMemo(() => {
    // Overall — count each employee once using their latest decision
    const overall: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

    // Per-manager: managerId → { total, ratingCounts }
    const byManager = new Map<string, { name: string; total: number; counts: Record<number, number> }>();

    for (const [, decision] of latestDecisionByEmployee) {
      const rating = decision.finalRating ?? decision.proposedRating;
      if (rating && overall[rating] !== undefined) {
        overall[rating] += 1;
      }

      const managerId = decision.managerId;
      if (!managerId) continue;

      if (!byManager.has(managerId)) {
        byManager.set(managerId, {
          name: memberById.get(managerId)?.name || managerId,
          total: 0,
          counts: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
        });
      }

      const bucket = byManager.get(managerId)!;
      bucket.total += 1;
      if (rating && bucket.counts[rating] !== undefined) {
        bucket.counts[rating] += 1;
      }
    }

    const overallTotal = Object.values(overall).reduce((a, b) => a + b, 0);

    const managerBiasRows = Array.from(byManager.entries())
      .map(([managerId, data]) => {
        const generousCount = (data.counts[5] || 0) + (data.counts[4] || 0);
        const harshCount = (data.counts[1] || 0) + (data.counts[2] || 0);
        const generousPct = data.total > 0 ? Math.round((generousCount / data.total) * 100) : 0;
        const harshPct = data.total > 0 ? Math.round((harshCount / data.total) * 100) : 0;

        let bias: "generous" | "strict" | "balanced" = "balanced";
        if (generousPct > 50) bias = "generous";
        else if (harshPct > 50) bias = "strict";

        return { managerId, name: data.name, total: data.total, counts: data.counts, generousPct, harshPct, bias };
      })
      .sort((a, b) => b.total - a.total);

    return { overall, overallTotal, managerBiasRows };
  }, [latestDecisionByEmployee, memberById]);

  // ─── Data loading ───────────────────────────────────────────────────────────

  const loadRoot = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [sessionsPayload, teamMembers] = await Promise.all([
        fetchCalibrationSessions({ limit: 100 }),
        fetchTeamMembers(undefined, { includeManagers: true }),
      ]);

      const nextSessions = sessionsPayload.data || [];
      setSessions(nextSessions);
      setMembers(teamMembers || []);

      setSelectedSessionId((prev) => {
        if (prev && nextSessions.some((s) => s.id === prev)) return prev;
        return nextSessions[0]?.id || "";
      });

      const firstEmployee = (teamMembers || []).find((m) => m.role === "employee");
      const firstManager = (teamMembers || []).find((m) => m.role === "manager");
      setDecisionForm((prev) => ({
        ...prev,
        employeeId: prev.employeeId || firstEmployee?.$id || "",
        managerId: prev.managerId || firstManager?.$id || "",
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load calibration workspace.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSessionDetail = useCallback(async (sessionId: string) => {
    if (!sessionId) {
      setDecisions([]);
      setTimeline([]);
      return;
    }

    try {
      const [decisionsPayload, timelinePayload] = await Promise.all([
        fetchCalibrationDecisions(sessionId),
        fetchCalibrationTimeline(sessionId),
      ]);

      setDecisions(decisionsPayload.data || []);
      setTimeline(timelinePayload.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load session details.");
    }
  }, []);

  useEffect(() => { loadRoot(); }, [loadRoot]);
  useEffect(() => { loadSessionDetail(selectedSessionId); }, [selectedSessionId, loadSessionDetail]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  function startEdit(emp: TeamMemberItem, decision: CalibrationDecisionItem | null) {
    setEditingId(emp.$id);
    setEditForm({
      proposedRating: String(decision?.proposedRating ?? ""),
      finalRating: String(decision?.finalRating ?? ""),
      rationale: "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({ proposedRating: "", finalRating: "", rationale: "" });
  }

  async function handleAdjustSave(emp: TeamMemberItem, decision: CalibrationDecisionItem | null) {
    if (!selectedSessionId) {
      setError("Select a calibration session before adjusting ratings.");
      return;
    }

    if (!editForm.proposedRating) {
      setError("Proposed rating is required.");
      return;
    }

    if (!editForm.rationale.trim()) {
      setError("Rationale is required when adjusting a rating.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const previousRating = decision?.finalRating ?? decision?.proposedRating ?? null;
      const managerId = decision?.managerId || emp.managerId || undefined;

      await createCalibrationDecision(selectedSessionId, {
        employeeId: emp.$id,
        managerId,
        previousRating,
        proposedRating: Number.parseInt(editForm.proposedRating, 10),
        finalRating: editForm.finalRating ? Number.parseInt(editForm.finalRating, 10) : null,
        rationale: editForm.rationale.trim(),
      });

      setSuccess(`Rating adjusted for ${emp.name}.`);
      cancelEdit();
      await loadSessionDetail(selectedSessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save rating adjustment.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingSession(true);
    setError("");
    setSuccess("");

    try {
      const created = await createCalibrationSession({
        name: sessionForm.name,
        cycleId: sessionForm.cycleId,
        status: sessionForm.status as "draft" | "active" | "closed",
        scope: sessionForm.scope,
        notes: sessionForm.notes,
      });

      setSuccess("Calibration session created.");
      setSessionForm((prev) => ({ ...prev, name: "", notes: "" }));
      await loadRoot();
      setSelectedSessionId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create calibration session.");
    } finally {
      setCreatingSession(false);
    }
  }

  async function handleCreateDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSessionId) {
      setError("Select a calibration session first.");
      return;
    }

    setCreatingDecision(true);
    setError("");
    setSuccess("");

    try {
      await createCalibrationDecision(selectedSessionId, {
        employeeId: decisionForm.employeeId,
        managerId: decisionForm.managerId || undefined,
        previousRating: decisionForm.previousRating ? Number.parseInt(decisionForm.previousRating, 10) : null,
        proposedRating: Number.parseInt(decisionForm.proposedRating, 10),
        finalRating: decisionForm.finalRating ? Number.parseInt(decisionForm.finalRating, 10) : null,
        rationale: decisionForm.rationale,
      });

      setSuccess("Calibration decision recorded.");
      setDecisionForm((prev) => ({ ...prev, previousRating: "", finalRating: "", rationale: "" }));
      await loadSessionDetail(selectedSessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to record decision.");
    } finally {
      setCreatingDecision(false);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  const managerFilterOptions = [
    { label: "All Managers", value: "all" },
    ...managers.map((m) => ({ label: m.name, value: m.$id })),
  ];

  const selectedSession = sessions.find((s) => s.id === selectedSessionId) || null;

  return (
    <Stack gap="4">
      <PageHeader
        title="Calibration Workbench"
        subtitle="Review employee ratings side-by-side, detect manager bias, and finalize scores before they go live."
        actions={
          <Button variant="secondary" onClick={loadRoot} disabled={loading}>
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="error" title="Unable to continue" description={error} onDismiss={() => setError("")} />}
      {success && <Alert variant="success" title="Done" description={success} onDismiss={() => setSuccess("")} />}

      {/* ── Session selector ─────────────────────────────────────────────────── */}
      <Card title="Active Session" description="Select a calibration session to populate the matrix and distribution below.">
        <div className="flex flex-wrap items-center gap-3">
          {sessions.length === 0 && !loading && (
            <p className="caption">No sessions yet — create one below.</p>
          )}
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedSessionId(s.id)}
              className={
                s.id === selectedSessionId
                  ? "rounded-[var(--radius-sm)] border border-[var(--color-primary)] bg-[var(--color-surface-muted)] px-3 py-2 body-sm font-medium text-left"
                  : "rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 body-sm text-left hover:bg-[var(--color-surface-muted)]"
              }
            >
              <span className="font-medium">{s.name}</span>
              <span className="caption ml-2 text-[var(--color-text-muted)]">{s.cycleId}</span>
              <Badge variant={statusVariant(s.status)} className="ml-2">{s.status}</Badge>
            </button>
          ))}
        </div>
      </Card>

      {/* ── Employee Ratings Matrix ──────────────────────────────────────────── */}
      <Card
        title="Employee Ratings Matrix"
        description="All employees with their calibration ratings. Filter by manager and adjust final scores inline."
      >
        <Stack gap="3">
          {/* Manager filter */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-64">
              <Dropdown
                label="Filter by Manager"
                value={managerFilter}
                options={managerFilterOptions}
                onChange={setManagerFilter}
              />
            </div>
            {!selectedSessionId && (
              <p className="caption text-[var(--color-text-muted)]">Select a session above to enable rating adjustments.</p>
            )}
          </div>

          {/* Matrix table */}
          {employees.length === 0 && !loading && (
            <p className="caption">No employees found.</p>
          )}

          {filteredGridRows.length === 0 && employees.length > 0 && (
            <p className="caption">No employees match the selected manager.</p>
          )}

          {filteredGridRows.length > 0 && (
            <div className="overflow-auto">
              <div className="min-w-[720px]">
                {/* Header */}
                <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_1fr_auto] gap-2 border-b border-[var(--color-border)] pb-2 mb-2">
                  <p className="caption font-medium text-[var(--color-text-muted)]">Employee</p>
                  <p className="caption font-medium text-[var(--color-text-muted)]">Manager</p>
                  <p className="caption font-medium text-[var(--color-text-muted)] text-center">Previous</p>
                  <p className="caption font-medium text-[var(--color-text-muted)] text-center">Proposed</p>
                  <p className="caption font-medium text-[var(--color-text-muted)] text-center">Final</p>
                  <p className="caption font-medium text-[var(--color-text-muted)] text-center">Status</p>
                  <p className="caption font-medium text-[var(--color-text-muted)]">Action</p>
                </div>

                {/* Rows */}
                <Stack gap="1">
                  {filteredGridRows.map(({ emp, decision, managerId }) => {
                    const isEditing = editingId === emp.$id;

                    return (
                      <div
                        key={emp.$id}
                        className={`rounded-[var(--radius-sm)] border px-3 py-2 ${
                          isEditing
                            ? "border-[var(--color-primary)] bg-[var(--color-surface-muted)]"
                            : "border-[var(--color-border)] bg-[var(--color-surface)]"
                        }`}
                      >
                        {/* Display row */}
                        <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_1fr_auto] gap-2 items-center">
                          <div>
                            <p className="body-sm font-medium text-[var(--color-text)]">{emp.name}</p>
                            <p className="caption text-[var(--color-text-muted)]">{emp.department || "—"}</p>
                          </div>
                          <p className="body-sm text-[var(--color-text)]">{memberName(memberById, managerId)}</p>
                          <div className="text-center"><RatingBadge rating={decision?.previousRating} /></div>
                          <div className="text-center"><RatingBadge rating={decision?.proposedRating} /></div>
                          <div className="text-center"><RatingBadge rating={decision?.finalRating} /></div>
                          <div className="text-center">
                            {decision ? (
                              <Badge variant={decision.changed ? "warning" : "default"}>
                                {decision.changed ? "Changed" : "Confirmed"}
                              </Badge>
                            ) : (
                              <Badge variant="default">No Rating</Badge>
                            )}
                          </div>
                          <div>
                            {!isEditing && (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => startEdit(emp, decision)}
                                disabled={!selectedSessionId}
                              >
                                {decision ? "Adjust" : "Add"}
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Inline edit form */}
                        {isEditing && (
                          <div className="mt-3 border-t border-[var(--color-border)] pt-3">
                            <Grid cols={1} colsMd={3} gap="2">
                              <div>
                                <label className="caption font-medium text-[var(--color-text-muted)]">Proposed Rating</label>
                                <select
                                  className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 body-sm text-[var(--color-text)]"
                                  value={editForm.proposedRating}
                                  onChange={(e) => setEditForm((prev) => ({ ...prev, proposedRating: e.target.value }))}
                                >
                                  <option value="">Select…</option>
                                  {RATING_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="caption font-medium text-[var(--color-text-muted)]">Final Rating</label>
                                <select
                                  className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 body-sm text-[var(--color-text)]"
                                  value={editForm.finalRating}
                                  onChange={(e) => setEditForm((prev) => ({ ...prev, finalRating: e.target.value }))}
                                >
                                  <option value="">Same as proposed</option>
                                  {RATING_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="caption font-medium text-[var(--color-text-muted)]">Rationale *</label>
                                <input
                                  type="text"
                                  placeholder="Reason for this adjustment…"
                                  className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 body-sm text-[var(--color-text)]"
                                  value={editForm.rationale}
                                  onChange={(e) => setEditForm((prev) => ({ ...prev, rationale: e.target.value }))}
                                />
                              </div>
                            </Grid>
                            <div className="mt-2 flex gap-2">
                              <Button
                                type="button"
                                size="sm"
                                loading={saving}
                                onClick={() => handleAdjustSave(emp, decision)}
                              >
                                Save
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={cancelEdit}
                                disabled={saving}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </Stack>
              </div>
            </div>
          )}
        </Stack>
      </Card>

      {/* ── Rating Distribution ──────────────────────────────────────────────── */}
      <Card
        title="Rating Distribution"
        description="How ratings are distributed across the organisation and per manager. Flags managers who are too generous or too strict."
      >
        <Stack gap="4">
          {/* Overall bar chart */}
          <div>
            <p className="body-sm font-medium text-[var(--color-text)] mb-2">
              Organisation-wide ({distribution.overallTotal} rated)
            </p>
            <Stack gap="2">
              {RATING_ORDER.map((n) => {
                const count = distribution.overall[n] || 0;
                const pct = distribution.overallTotal > 0
                  ? Math.round((count / distribution.overallTotal) * 100)
                  : 0;
                const meta = RATING_META[n];
                return (
                  <div key={n} className="flex items-center gap-3">
                    <span className={`inline-flex w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border px-1.5 py-0.5 caption font-medium ${meta.badgeClass}`}>
                      {meta.short}
                    </span>
                    <div className="flex-1 h-2 rounded-[var(--radius-sm)] bg-[var(--color-surface-muted)] overflow-hidden">
                      <div
                        className="h-2 rounded-[var(--radius-sm)] bg-[var(--color-primary)] transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="caption w-16 shrink-0 text-right text-[var(--color-text-muted)]">
                      {count} ({pct}%)
                    </span>
                  </div>
                );
              })}
            </Stack>
          </div>

          <Divider label="Per-Manager Breakdown" />

          {/* Per-manager distribution */}
          {distribution.managerBiasRows.length === 0 && (
            <p className="caption">No manager-attributed decisions yet.</p>
          )}

          {distribution.managerBiasRows.length > 0 && (
            <Stack gap="3">
              {distribution.managerBiasRows.map((row) => (
                <div key={row.managerId} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div>
                      <p className="body-sm font-medium text-[var(--color-text)]">{row.name}</p>
                      <p className="caption text-[var(--color-text-muted)]">{row.total} employee{row.total !== 1 ? "s" : ""} rated</p>
                    </div>
                    <div className="flex gap-2">
                      {row.bias === "generous" && (
                        <Badge variant="warning">Generous — {row.generousPct}% EE+DE</Badge>
                      )}
                      {row.bias === "strict" && (
                        <Badge variant="error">Strict — {row.harshPct}% NI+SME</Badge>
                      )}
                      {row.bias === "balanced" && (
                        <Badge variant="success">Balanced</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {RATING_ORDER.map((n) => {
                      const count = row.counts[n] || 0;
                      const pct = row.total > 0 ? Math.round((count / row.total) * 100) : 0;
                      const meta = RATING_META[n];
                      return (
                        <div
                          key={n}
                          className={`flex flex-col items-center rounded-[var(--radius-sm)] border px-3 py-1.5 min-w-[52px] ${meta.badgeClass}`}
                        >
                          <span className="caption font-medium">{meta.short}</span>
                          <span className="caption">{count}</span>
                          <span className="caption text-[var(--color-text-muted)]">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </Stack>
          )}
        </Stack>
      </Card>

      {/* ── Session management ───────────────────────────────────────────────── */}
      <Grid cols={1} colsLg={2} gap="3">
        <Card title="Create Session" description="Start a new calibration review window.">
          <form className="space-y-3" onSubmit={handleCreateSession}>
            <Input
              label="Session Name"
              value={sessionForm.name}
              onChange={(e) => setSessionForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
            <Grid cols={1} colsMd={2} gap="2">
              <Input
                label="Cycle ID"
                value={sessionForm.cycleId}
                onChange={(e) => setSessionForm((prev) => ({ ...prev, cycleId: e.target.value }))}
                required
              />
              <Dropdown
                label="Status"
                value={sessionForm.status}
                options={[
                  { label: "Draft", value: "draft" },
                  { label: "Active", value: "active" },
                  { label: "Closed", value: "closed" },
                ]}
                onChange={(value) => setSessionForm((prev) => ({ ...prev, status: value }))}
              />
            </Grid>
            <Input
              label="Scope"
              value={sessionForm.scope}
              onChange={(e) => setSessionForm((prev) => ({ ...prev, scope: e.target.value }))}
            />
            <Textarea
              label="Notes"
              value={sessionForm.notes}
              onChange={(e) => setSessionForm((prev) => ({ ...prev, notes: e.target.value }))}
            />
            <Button type="submit" loading={creatingSession}>Create Session</Button>
          </form>
        </Card>

        <Card title="Record Decision" description="Capture rationale and score adjustments per employee.">
          <form className="space-y-3" onSubmit={handleCreateDecision}>
            <Dropdown
              label="Employee"
              value={decisionForm.employeeId}
              options={employeeOptions}
              onChange={(value) => setDecisionForm((prev) => ({ ...prev, employeeId: value }))}
            />
            <Dropdown
              label="Manager"
              value={decisionForm.managerId}
              options={[{ label: "Unknown / Not supplied", value: "" }, ...managerOptions]}
              onChange={(value) => setDecisionForm((prev) => ({ ...prev, managerId: value }))}
            />
            <Grid cols={1} colsMd={3} gap="2">
              <Input
                label="Previous"
                type="number" min={1} max={5}
                value={decisionForm.previousRating}
                onChange={(e) => setDecisionForm((prev) => ({ ...prev, previousRating: e.target.value }))}
              />
              <Input
                label="Proposed"
                type="number" min={1} max={5}
                value={decisionForm.proposedRating}
                onChange={(e) => setDecisionForm((prev) => ({ ...prev, proposedRating: e.target.value }))}
                required
              />
              <Input
                label="Final"
                type="number" min={1} max={5}
                value={decisionForm.finalRating}
                onChange={(e) => setDecisionForm((prev) => ({ ...prev, finalRating: e.target.value }))}
              />
            </Grid>
            <Textarea
              label="Rationale"
              value={decisionForm.rationale}
              onChange={(e) => setDecisionForm((prev) => ({ ...prev, rationale: e.target.value }))}
              required
            />
            <Button type="submit" loading={creatingDecision} disabled={!selectedSessionId}>
              Record Decision
            </Button>
          </form>
        </Card>
      </Grid>

      {/* ── Sessions + Timeline ──────────────────────────────────────────────── */}
      <Grid cols={1} colsLg={2} gap="3">
        <Card title="Sessions" description="Recent calibration sessions and current status.">
          <Stack gap="2">
            {sessions.length === 0 && <p className="caption">No calibration sessions found.</p>}
            {sessions.map((s) => (
              <button
                type="button"
                key={s.id}
                onClick={() => setSelectedSessionId(s.id)}
                className={
                  s.id === selectedSessionId
                    ? "w-full rounded-[var(--radius-sm)] border border-[var(--color-primary)] bg-[var(--color-surface-muted)] px-3 py-3 text-left"
                    : "w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3 text-left"
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="body-sm font-medium text-[var(--color-text)]">{s.name}</p>
                  <Badge variant={statusVariant(s.status)}>{s.status}</Badge>
                </div>
                <p className="caption mt-1">cycle: {s.cycleId} • v{s.version}</p>
                <p className="caption mt-1">updated: {formatDate(s.updatedAt)}</p>
              </button>
            ))}
          </Stack>
        </Card>

        <Card title="Timeline" description="Audit trail for the selected session.">
          <Stack gap="2">
            {!selectedSessionId && <p className="caption">Select a session to view timeline.</p>}
            {selectedSessionId && timeline.length === 0 && <p className="caption">No timeline events yet.</p>}
            {timeline.map((event) => (
              <div key={event.id} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="body-sm font-medium text-[var(--color-text)]">{event.summary}</p>
                  <Badge variant={event.payload?.changed ? "warning" : "default"}>
                    {event.payload?.changed ? "Changed" : "No Change"}
                  </Badge>
                </div>
                <p className="caption mt-1">employee: {memberName(memberById, event.employeeId)}</p>
                <p className="caption mt-1">at: {formatDate(event.at)}</p>
              </div>
            ))}
          </Stack>
        </Card>
      </Grid>

      {/* ── Decision Records ─────────────────────────────────────────────────── */}
      <Card title="All Decision Records" description="Complete versioned history for the selected session.">
        <Stack gap="2">
          {!selectedSessionId && <p className="caption">Select a session to view decisions.</p>}
          {selectedSessionId && decisions.length === 0 && <p className="caption">No decisions recorded yet.</p>}
          {decisions.map((item) => (
            <div key={item.id} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="body-sm font-medium text-[var(--color-text)]">
                  {memberName(memberById, item.employeeId)}
                </p>
                <div className="flex items-center gap-2">
                  <Badge variant={item.changed ? "warning" : "default"}>
                    {item.changed ? "Changed" : "Confirmed"}
                  </Badge>
                  <span className="caption text-[var(--color-text-muted)]">v{item.version}</span>
                </div>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="caption text-[var(--color-text-muted)]">prev</span>
                <RatingBadge rating={item.previousRating} />
                <span className="caption text-[var(--color-text-muted)]">→ proposed</span>
                <RatingBadge rating={item.proposedRating} />
                <span className="caption text-[var(--color-text-muted)]">→ final</span>
                <RatingBadge rating={item.finalRating} />
              </div>
              {item.rationale && <p className="caption mt-1 text-[var(--color-text-muted)]">{item.rationale}</p>}
              <p className="caption mt-1 text-[var(--color-text-muted)]">decided: {formatDate(item.decidedAt)}</p>
            </div>
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}

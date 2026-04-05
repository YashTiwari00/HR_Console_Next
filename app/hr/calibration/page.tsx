"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Grid, Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Card, Dropdown, Input, Textarea } from "@/src/components/ui";
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

function statusVariant(status: string) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "active") return "info" as const;
  if (normalized === "closed") return "success" as const;
  return "default" as const;
}

function employeeNameById(map: Map<string, TeamMemberItem>, id: string | null | undefined) {
  if (!id) return "Unknown";
  return map.get(id)?.name || id;
}

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

  const memberById = useMemo(() => {
    const map = new Map<string, TeamMemberItem>();
    members.forEach((item) => map.set(item.$id, item));
    return map;
  }, [members]);

  const employeeOptions = useMemo(
    () =>
      members
        .filter((member) => member.role === "employee")
        .map((member) => ({
          label: `${member.name} (${member.department || "Unassigned"})`,
          value: member.$id,
        })),
    [members]
  );

  const managerOptions = useMemo(
    () =>
      members
        .filter((member) => member.role === "manager")
        .map((member) => ({
          label: `${member.name} (${member.department || "Manager"})`,
          value: member.$id,
        })),
    [members]
  );

  const distribution = useMemo(() => {
    const byRating = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
    const byManager = new Map<string, { total: number; changed: number }>();
    const byDepartment = new Map<string, { total: number; changed: number }>();

    for (const row of decisions) {
      const finalOrProposed = row.finalRating ?? row.proposedRating ?? null;
      if (finalOrProposed && byRating[String(finalOrProposed) as keyof typeof byRating] !== undefined) {
        byRating[String(finalOrProposed) as keyof typeof byRating] += 1;
      }

      const managerName = employeeNameById(memberById, row.managerId) || "Unknown";
      const managerBucket = byManager.get(managerName) || { total: 0, changed: 0 };
      managerBucket.total += 1;
      if (row.changed) managerBucket.changed += 1;
      byManager.set(managerName, managerBucket);

      const employee = memberById.get(String(row.employeeId || "").trim());
      const department = String(employee?.department || "Unassigned").trim() || "Unassigned";
      const departmentBucket = byDepartment.get(department) || { total: 0, changed: 0 };
      departmentBucket.total += 1;
      if (row.changed) departmentBucket.changed += 1;
      byDepartment.set(department, departmentBucket);
    }

    return {
      ratingRows: Object.entries(byRating).map(([rating, count]) => ({ rating, count })),
      managerRows: Array.from(byManager.entries())
        .map(([name, stats]) => ({
          name,
          total: stats.total,
          changed: stats.changed,
          driftPercent: stats.total > 0 ? Math.round((stats.changed / stats.total) * 100) : 0,
        }))
        .sort((a, b) => b.total - a.total),
      departmentRows: Array.from(byDepartment.entries())
        .map(([name, stats]) => ({
          name,
          total: stats.total,
          changed: stats.changed,
          driftPercent: stats.total > 0 ? Math.round((stats.changed / stats.total) * 100) : 0,
        }))
        .sort((a, b) => b.total - a.total),
    };
  }, [decisions, memberById]);

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
        if (prev && nextSessions.some((item) => item.id === prev)) return prev;
        return nextSessions[0]?.id || "";
      });

      setDecisionForm((prev) => ({
        ...prev,
        employeeId: prev.employeeId || teamMembers.find((item) => item.role === "employee")?.$id || "",
        managerId: prev.managerId || teamMembers.find((item) => item.role === "manager")?.$id || "",
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
      setError(err instanceof Error ? err.message : "Unable to load calibration session details.");
    }
  }, []);

  useEffect(() => {
    loadRoot();
  }, [loadRoot]);

  useEffect(() => {
    loadSessionDetail(selectedSessionId);
  }, [selectedSessionId, loadSessionDetail]);

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
      setSessionForm((prev) => ({
        ...prev,
        name: "",
        notes: "",
      }));

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
        previousRating: decisionForm.previousRating
          ? Number.parseInt(decisionForm.previousRating, 10)
          : null,
        proposedRating: Number.parseInt(decisionForm.proposedRating, 10),
        finalRating: decisionForm.finalRating
          ? Number.parseInt(decisionForm.finalRating, 10)
          : null,
        rationale: decisionForm.rationale,
      });

      setSuccess("Calibration decision recorded.");
      setDecisionForm((prev) => ({
        ...prev,
        previousRating: "",
        finalRating: "",
        rationale: "",
      }));

      await loadSessionDetail(selectedSessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to record decision.");
    } finally {
      setCreatingDecision(false);
    }
  }

  return (
    <Stack gap="4">
      <PageHeader
        title="Calibration Workbench"
        subtitle="Create calibration sessions, record rating decisions, and review session timeline."
        actions={
          <Button variant="secondary" onClick={loadRoot} disabled={loading}>
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="error" title="Unable to continue" description={error} onDismiss={() => setError("")} />}
      {success && <Alert variant="success" title="Done" description={success} onDismiss={() => setSuccess("")} />}

      <Grid cols={1} colsLg={2} gap="3">
        <Card title="Create Session" description="Start a new calibration review window.">
          <form className="space-y-3" onSubmit={handleCreateSession}>
            <Input
              label="Session Name"
              value={sessionForm.name}
              onChange={(event) => setSessionForm((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
            <Grid cols={1} colsMd={2} gap="2">
              <Input
                label="Cycle ID"
                value={sessionForm.cycleId}
                onChange={(event) => setSessionForm((prev) => ({ ...prev, cycleId: event.target.value }))}
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
              onChange={(event) => setSessionForm((prev) => ({ ...prev, scope: event.target.value }))}
            />
            <Textarea
              label="Notes"
              value={sessionForm.notes}
              onChange={(event) => setSessionForm((prev) => ({ ...prev, notes: event.target.value }))}
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
                type="number"
                min={1}
                max={5}
                value={decisionForm.previousRating}
                onChange={(event) => setDecisionForm((prev) => ({ ...prev, previousRating: event.target.value }))}
              />
              <Input
                label="Proposed"
                type="number"
                min={1}
                max={5}
                value={decisionForm.proposedRating}
                onChange={(event) => setDecisionForm((prev) => ({ ...prev, proposedRating: event.target.value }))}
                required
              />
              <Input
                label="Final"
                type="number"
                min={1}
                max={5}
                value={decisionForm.finalRating}
                onChange={(event) => setDecisionForm((prev) => ({ ...prev, finalRating: event.target.value }))}
              />
            </Grid>
            <Textarea
              label="Rationale"
              value={decisionForm.rationale}
              onChange={(event) => setDecisionForm((prev) => ({ ...prev, rationale: event.target.value }))}
              required
            />
            <Button type="submit" loading={creatingDecision} disabled={!selectedSessionId}>
              Record Decision
            </Button>
          </form>
        </Card>
      </Grid>

      <Grid cols={1} colsLg={2} gap="3">
        <Card title="Sessions" description="Recent calibration sessions and current status.">
          <Stack gap="2">
            {sessions.length === 0 && <p className="caption">No calibration sessions found.</p>}
            {sessions.map((session) => (
              <button
                type="button"
                key={session.id}
                onClick={() => setSelectedSessionId(session.id)}
                className={
                  session.id === selectedSessionId
                    ? "w-full rounded-[var(--radius-sm)] border border-[var(--color-primary)] bg-[var(--color-surface-muted)] px-3 py-3 text-left"
                    : "w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3 text-left"
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="body-sm font-medium text-[var(--color-text)]">{session.name}</p>
                  <Badge variant={statusVariant(session.status)}>{session.status}</Badge>
                </div>
                <p className="caption mt-1">cycle: {session.cycleId} • v{session.version}</p>
                <p className="caption mt-1">updated: {formatDate(session.updatedAt)}</p>
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
                <p className="caption mt-1">employee: {employeeNameById(memberById, event.employeeId)}</p>
                <p className="caption mt-1">at: {formatDate(event.at)}</p>
              </div>
            ))}
          </Stack>
        </Card>
      </Grid>

      <Card title="Decisions" description="Recorded decisions for the selected session.">
        <Stack gap="3">
          <div>
            <p className="body-sm font-medium text-[var(--color-text)]">Rating Distribution</p>
            <div className="mt-2 space-y-2">
              {distribution.ratingRows.map((row) => {
                const max = Math.max(1, ...distribution.ratingRows.map((item) => item.count));
                const width = Math.round((row.count / max) * 100);
                return (
                  <div key={row.rating} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="caption">Rating {row.rating}</span>
                      <span className="caption">{row.count}</span>
                    </div>
                    <div className="h-2 rounded-[var(--radius-sm)] bg-[var(--color-surface-muted)]">
                      <div
                        className="h-2 rounded-[var(--radius-sm)] bg-[var(--color-primary)]"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <Grid cols={1} colsLg={2} gap="3">
            <Card title="Manager Drift" description="Percent of changed decisions by manager.">
              <Stack gap="2">
                {distribution.managerRows.length === 0 && <p className="caption">No manager distribution yet.</p>}
                {distribution.managerRows.map((row) => (
                  <div key={row.name} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="caption">{row.name}</p>
                      <Badge variant={row.driftPercent >= 50 ? "warning" : "default"}>{row.driftPercent}% drift</Badge>
                    </div>
                    <p className="caption mt-1">{row.changed} changed out of {row.total}</p>
                  </div>
                ))}
              </Stack>
            </Card>

            <Card title="Department Drift" description="Decision change ratio by department.">
              <Stack gap="2">
                {distribution.departmentRows.length === 0 && <p className="caption">No department distribution yet.</p>}
                {distribution.departmentRows.map((row) => (
                  <div key={row.name} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="caption">{row.name}</p>
                      <Badge variant={row.driftPercent >= 50 ? "warning" : "default"}>{row.driftPercent}% drift</Badge>
                    </div>
                    <p className="caption mt-1">{row.changed} changed out of {row.total}</p>
                  </div>
                ))}
              </Stack>
            </Card>
          </Grid>
        </Stack>

      </Card>

      <Card title="Decision Timeline Records" description="Recorded decisions for the selected session.">
        <Stack gap="2">
          {!selectedSessionId && <p className="caption">Select a session to view decisions.</p>}
          {selectedSessionId && decisions.length === 0 && <p className="caption">No decisions recorded yet.</p>}
          {decisions.map((item) => (
            <div key={item.id} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="body-sm font-medium text-[var(--color-text)]">
                  {employeeNameById(memberById, item.employeeId)}
                </p>
                <Badge variant={item.changed ? "warning" : "default"}>v{item.version}</Badge>
              </div>
              <p className="caption mt-1">
                prev {item.previousRating ?? "-"} • proposed {item.proposedRating ?? "-"} • final {item.finalRating ?? "-"}
              </p>
              <p className="caption mt-1">{item.rationale}</p>
              <p className="caption mt-1">decided: {formatDate(item.decidedAt)}</p>
            </div>
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}

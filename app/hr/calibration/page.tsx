"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Container, Grid, Stack } from "@/src/components/layout";
import { DataTable, PageHeader } from "@/src/components/patterns";
import type { DataTableColumn } from "@/src/components/patterns";
import { Alert, Badge, Button, Card, Dropdown, Textarea } from "@/src/components/ui";
import {
  CalibrationBulkDecisionItem,
  CalibrationSessionItem,
  bulkUpdateCalibrationDecisions,
  fetchCalibrationBulkDecisions,
  fetchCalibrationDistribution,
  fetchCalibrationSessions,
  formatDate,
} from "@/app/employee/_lib/pmsClient";

type DraftDecision = {
  finalRating: string;
  rationale: string;
};

type TableRow = CalibrationBulkDecisionItem & Record<string, unknown>;

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function statusVariant(status: string) {
  const normalized = normalizeText(status).toLowerCase();
  if (normalized === "active") return "info" as const;
  if (normalized === "locked") return "warning" as const;
  if (normalized === "closed") return "success" as const;
  return "default" as const;
}

function driftVariant(drift: number) {
  if (drift > 0) return "info" as const;
  if (drift < 0) return "danger" as const;
  return "default" as const;
}

function defaultFinalRating(row: CalibrationBulkDecisionItem) {
  if (Number.isInteger(row.finalRating)) return String(row.finalRating);
  if (Number.isInteger(row.proposedRating)) return String(row.proposedRating);
  if (Number.isInteger(row.previousRating)) return String(row.previousRating);
  return "3";
}

const ratingOptions = [
  { label: "1", value: "1" },
  { label: "2", value: "2" },
  { label: "3", value: "3" },
  { label: "4", value: "4" },
  { label: "5", value: "5" },
];

export default function HrCalibrationPage() {
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [sessions, setSessions] = useState<CalibrationSessionItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");

  const [rows, setRows] = useState<CalibrationBulkDecisionItem[]>([]);
  const [draftById, setDraftById] = useState<Record<string, DraftDecision>>({});

  const [distribution, setDistribution] = useState({
    1: { count: 0, percent: 0 },
    2: { count: 0, percent: 0 },
    3: { count: 0, percent: 0 },
    4: { count: 0, percent: 0 },
    5: { count: 0, percent: 0 },
  });

  const [summary, setSummary] = useState({
    total: 0,
    avgDrift: 0,
    positiveDriftCount: 0,
    negativeDriftCount: 0,
  });

  const selectedSession = useMemo(
    () => sessions.find((item) => item.id === selectedSessionId) || null,
    [sessions, selectedSessionId]
  );

  const sessionOptions = useMemo(
    () =>
      sessions.map((session) => ({
        value: session.id,
        label: `${session.name} (${session.cycleId})`,
        description: session.status,
      })),
    [sessions]
  );

  const isLocked = useMemo(() => {
    const status = normalizeText(selectedSession?.status).toLowerCase();
    return status === "locked" || status === "closed";
  }, [selectedSession]);

  const tableRows = useMemo<TableRow[]>(() => {
    return rows.map((row) => {
      const draft = draftById[row.decisionId];
      return {
        ...row,
        finalRating: Number.parseInt(draft?.finalRating || defaultFinalRating(row), 10) || null,
        rationale: draft?.rationale ?? row.rationale,
      } as TableRow;
    });
  }, [draftById, rows]);

  const changedPayload = useMemo(() => {
    return rows
      .map((row) => {
        const draft = draftById[row.decisionId];
        if (!draft) return null;

        const nextFinal = Number.parseInt(draft.finalRating, 10);
        if (!Number.isInteger(nextFinal) || nextFinal < 1 || nextFinal > 5) {
          return null;
        }

        const nextRationale = normalizeText(draft.rationale);
        const sourceFinal = Number.isInteger(row.finalRating)
          ? Number(row.finalRating)
          : Number.parseInt(defaultFinalRating(row), 10);
        const sourceRationale = normalizeText(row.rationale);

        const hasChange = sourceFinal !== nextFinal || sourceRationale !== nextRationale;
        if (!hasChange) return null;

        return {
          decisionId: row.decisionId,
          finalRating: nextFinal,
          rationale: nextRationale,
        };
      })
      .filter((item): item is { decisionId: string; finalRating: number; rationale: string } => Boolean(item));
  }, [draftById, rows]);

  const loadRoot = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const sessionsPayload = await fetchCalibrationSessions({ limit: 100 });
      const nextSessions = sessionsPayload.data || [];
      setSessions(nextSessions);

      setSelectedSessionId((prev) => {
        if (prev && nextSessions.some((item) => item.id === prev)) return prev;
        return nextSessions[0]?.id || "";
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load calibration sessions.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSessionData = useCallback(async (sessionId: string) => {
    if (!sessionId) {
      setRows([]);
      setDraftById({});
      setSummary({ total: 0, avgDrift: 0, positiveDriftCount: 0, negativeDriftCount: 0 });
      setDistribution({
        1: { count: 0, percent: 0 },
        2: { count: 0, percent: 0 },
        3: { count: 0, percent: 0 },
        4: { count: 0, percent: 0 },
        5: { count: 0, percent: 0 },
      });
      return;
    }

    setTableLoading(true);
    setError("");

    try {
      const [bulkPayload, distributionPayload] = await Promise.all([
        fetchCalibrationBulkDecisions(sessionId),
        fetchCalibrationDistribution(sessionId),
      ]);

      const nextRows = bulkPayload.data || [];
      setRows(nextRows);
      setSummary({
        total: Number(bulkPayload.meta?.total || nextRows.length || 0),
        avgDrift: Number(bulkPayload.meta?.avgDrift || 0),
        positiveDriftCount: Number(bulkPayload.meta?.positiveDriftCount || 0),
        negativeDriftCount: Number(bulkPayload.meta?.negativeDriftCount || 0),
      });
      setDistribution(distributionPayload.distribution || {
        1: { count: 0, percent: 0 },
        2: { count: 0, percent: 0 },
        3: { count: 0, percent: 0 },
        4: { count: 0, percent: 0 },
        5: { count: 0, percent: 0 },
      });

      const nextDrafts: Record<string, DraftDecision> = {};
      for (const row of nextRows) {
        nextDrafts[row.decisionId] = {
          finalRating: defaultFinalRating(row),
          rationale: normalizeText(row.rationale),
        };
      }
      setDraftById(nextDrafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load calibration table data.");
    } finally {
      setTableLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRoot();
  }, [loadRoot]);

  useEffect(() => {
    loadSessionData(selectedSessionId);
  }, [loadSessionData, selectedSessionId]);

  async function handleSaveAll() {
    if (!selectedSessionId || isLocked) return;
    if (changedPayload.length === 0) {
      setSuccess("No changes to save.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const result = await bulkUpdateCalibrationDecisions(selectedSessionId, changedPayload);
      setSuccess(`Saved ${result.updated} decision(s), skipped ${result.skipped}.`);
      await loadSessionData(selectedSessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save calibration updates.");
    } finally {
      setSaving(false);
    }
  }

  function updateDraft(decisionId: string, patch: Partial<DraftDecision>) {
    setDraftById((prev) => ({
      ...prev,
      [decisionId]: {
        finalRating: prev[decisionId]?.finalRating || "3",
        rationale: prev[decisionId]?.rationale || "",
        ...patch,
      },
    }));
  }

  const columns = useMemo<DataTableColumn<TableRow>[]>(
    () => [
      {
        key: "employeeName",
        header: "Employee",
        render: (_value: unknown, row: TableRow) => (
          <div>
            <p className="body-sm font-medium text-[var(--color-text)]">{row.employeeName}</p>
            <p className="caption">{row.employeeId}</p>
          </div>
        ),
      },
      {
        key: "managerName",
        header: "Manager",
        render: (_value: unknown, row: TableRow) => (
          <div>
            <p className="body-sm text-[var(--color-text)]">{row.managerName || "-"}</p>
            <p className="caption">{row.managerId || "-"}</p>
          </div>
        ),
      },
      {
        key: "previousRating",
        header: "Previous",
        align: "center",
      },
      {
        key: "proposedRating",
        header: "Proposed",
        align: "center",
      },
      {
        key: "finalRating",
        header: "Final",
        render: (_value: unknown, row: TableRow) => (
          <Dropdown
            options={ratingOptions}
            value={draftById[row.decisionId]?.finalRating || defaultFinalRating(row)}
            onChange={(value) => updateDraft(row.decisionId, { finalRating: value })}
            disabled={isLocked || saving}
            placeholder="Final"
          />
        ),
      },
      {
        key: "drift",
        header: "Drift",
        align: "center",
        render: (_value: unknown, row: TableRow) => {
          const finalRating = Number.parseInt(
            draftById[row.decisionId]?.finalRating || defaultFinalRating(row),
            10
          );
          const proposed = Number(row.proposedRating || 0);
          const drift = Number.isInteger(finalRating) ? finalRating - proposed : 0;
          const label = drift > 0 ? `+${drift}` : String(drift);
          return <Badge variant={driftVariant(drift)}>{label}</Badge>;
        },
      },
      {
        key: "rationale",
        header: "Rationale",
        width: "320px",
        render: (_value: unknown, row: TableRow) => (
          <Textarea
            rows={2}
            value={draftById[row.decisionId]?.rationale || ""}
            onChange={(event) => updateDraft(row.decisionId, { rationale: event.target.value })}
            disabled={isLocked || saving}
          />
        ),
      },
    ],
    [draftById, isLocked, saving]
  );

  return (
    <Container maxWidth="xl">
      <Stack gap="4">
        <PageHeader
          title="Calibration Workbench"
          subtitle="Table-based calibration edits with bulk save for HR governance."
          actions={
            <div className="flex items-center gap-2">
              <Dropdown
                options={sessionOptions}
                value={selectedSessionId}
                onChange={setSelectedSessionId}
                placeholder="Select session"
                disabled={loading || sessionOptions.length === 0}
              />
              <Button variant="secondary" onClick={loadRoot} disabled={loading || saving}>
                Refresh
              </Button>
            </div>
          }
        />

        {error && <Alert variant="error" title="Unable to continue" description={error} onDismiss={() => setError("")} />}
        {success && <Alert variant="success" title="Done" description={success} onDismiss={() => setSuccess("")} />}

        {selectedSession && (
          <Card title="Session Status" description="Current lifecycle state controls edit access.">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="body-sm font-medium text-[var(--color-text)]">{selectedSession.name}</p>
                <p className="caption mt-1">Cycle: {selectedSession.cycleId} • Updated: {formatDate(selectedSession.updatedAt)}</p>
              </div>
              <Badge variant={statusVariant(selectedSession.status)}>{selectedSession.status}</Badge>
            </div>
          </Card>
        )}

        <Grid cols={1} colsMd={2} colsLg={4} gap="3">
          <Card title="Total Decisions">
            <p className="heading-xl">{tableLoading ? "..." : summary.total}</p>
          </Card>
          <Card title="Average Drift">
            <p className="heading-xl">{tableLoading ? "..." : summary.avgDrift}</p>
          </Card>
          <Card title="Positive Drift">
            <p className="heading-xl">{tableLoading ? "..." : summary.positiveDriftCount}</p>
          </Card>
          <Card title="Negative Drift">
            <p className="heading-xl">{tableLoading ? "..." : summary.negativeDriftCount}</p>
          </Card>
        </Grid>

        <Card title="Rating Distribution" description="Histogram-ready distribution summary.">
          <Grid cols={1} colsMd={5} gap="2">
            {[1, 2, 3, 4, 5].map((bucket) => {
              const row = distribution[bucket as 1 | 2 | 3 | 4 | 5];
              return (
                <Card key={bucket}>
                  <Stack gap="1" align="start">
                    <p className="caption">Rating {bucket}</p>
                    <p className="heading-lg">{tableLoading ? "..." : row.count}</p>
                    <p className="caption">{tableLoading ? "..." : `${row.percent}%`}</p>
                  </Stack>
                </Card>
              );
            })}
          </Grid>
        </Card>

        <Card
          title="Calibration Decisions"
          description="Review and update final ratings and rationale, then save in bulk."
        >
          <Stack gap="3">
            <div className="flex items-center justify-between gap-2">
              <p className="caption">
                {isLocked
                  ? "Session is locked or closed. Editing is disabled."
                  : `${changedPayload.length} pending change(s).`}
              </p>
              <Button
                onClick={handleSaveAll}
                loading={saving}
                disabled={isLocked || saving || changedPayload.length === 0 || !selectedSessionId}
              >
                Save All
              </Button>
            </div>

            <DataTable
              columns={columns}
              rows={tableRows}
              loading={tableLoading}
              rowKey={(row) => row.decisionId}
              emptyMessage="No calibration decisions available for this session."
              maxHeight={560}
            />
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
}

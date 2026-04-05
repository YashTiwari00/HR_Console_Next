"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import Link from "next/link";
import { Grid, Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Card } from "@/src/components/ui";
import {
  BulkCheckInPreviewRow,
  CheckInItem,
  checkInStatusVariant,
  commitBulkCheckIns,
  fetchCheckIns,
  fetchGoals,
  fetchMeetRequests,
  formatDate,
  getAttachmentDownloadPath,
  GoalItem,
  MeetRequestItem,
  previewBulkCheckIns,
  uploadAttachments,
} from "@/app/employee/_lib/pmsClient";

type ParsedBulkRow = {
  rowNumber: number;
  goalId: string;
  scheduledAt: string;
  employeeNotes: string;
  isFinalCheckIn: boolean;
  managerRating: number | null;
  attachmentFileIds: string[];
  attachmentFileNames: string[];
};

export default function EmployeeCheckInsPage() {
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [checkIns, setCheckIns] = useState<CheckInItem[]>([]);
  const [meetingsByGoal, setMeetingsByGoal] = useState<Record<string, MeetRequestItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkRows, setBulkRows] = useState<ParsedBulkRow[]>([]);
  const [bulkFileName, setBulkFileName] = useState("");
  const [previewRows, setPreviewRows] = useState<BulkCheckInPreviewRow[]>([]);
  const [previewCounts, setPreviewCounts] = useState({ total: 0, valid: 0, invalid: 0 });
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);

  const approvedGoals = useMemo(
    () => new Set(goals.filter((goal) => goal.status === "approved").map((goal) => goal.$id)),
    [goals]
  );

  function readCell(row: Record<string, unknown>, keys: string[]) {
    const entries = Object.entries(row);
    for (const key of keys) {
      const found = entries.find(([rowKey]) => rowKey.trim().toLowerCase() === key.trim().toLowerCase());
      if (found && String(found[1] ?? "").trim()) {
        return String(found[1]).trim();
      }
    }
    return "";
  }

  function splitCsv(value: string) {
    return String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function parseWorkbookRows(rows: Record<string, unknown>[]) {
    return rows
      .map((row, index) => {
        const goalId = readCell(row, ["goalId", "goal id"]);
        const scheduledAt = readCell(row, ["scheduledAt", "scheduled at", "date", "when"]);
        const employeeNotes = readCell(row, ["employeeNotes", "employee notes", "notes"]);
        const isFinalRaw = readCell(row, ["isFinalCheckIn", "is final check in", "is final"]);
        const managerRatingRaw = readCell(row, ["managerRating", "manager rating", "rating"]);
        const attachmentFileIds = splitCsv(
          readCell(row, ["attachmentFileIds", "attachmentIds", "attachment file ids"])
        );
        const attachmentFileNames = splitCsv(
          readCell(row, ["attachmentFileNames", "attachment files", "attachment names"])
        );

        const managerRating = Number.parseInt(managerRatingRaw || "", 10);

        return {
          rowNumber: index + 1,
          goalId,
          scheduledAt,
          employeeNotes,
          isFinalCheckIn: ["true", "1", "yes"].includes(isFinalRaw.trim().toLowerCase()),
          managerRating: Number.isInteger(managerRating) ? managerRating : null,
          attachmentFileIds,
          attachmentFileNames,
        } as ParsedBulkRow;
      })
      .filter((item) => item.goalId || item.scheduledAt || item.employeeNotes);
  }

  async function readBulkWorkbook(file: File) {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: "array" });
    const firstSheet = workbook.SheetNames?.[0];
    if (!firstSheet) {
      throw new Error("Workbook has no sheets.");
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet], {
      defval: "",
    });

    return parseWorkbookRows(rows);
  }

  async function handleBulkFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    if (!file) return;

    setBulkLoading(true);
    setError("");
    setSuccess("");

    try {
      const parsed = await readBulkWorkbook(file);
      if (parsed.length === 0) {
        throw new Error("No usable rows found. Use the check-in import template and try again.");
      }

      setBulkRows(parsed);
      setBulkFileName(file.name);
      setPreviewRows([]);
      setPreviewCounts({ total: 0, valid: 0, invalid: 0 });
      setSuccess(`Parsed ${parsed.length} rows from ${file.name}. Run preview before commit.`);
    } catch (err) {
      setBulkRows([]);
      setBulkFileName("");
      setError(err instanceof Error ? err.message : "Failed to parse workbook.");
    } finally {
      setBulkLoading(false);
      event.target.value = "";
    }
  }

  function validateAttachmentReferences(rows: ParsedBulkRow[]) {
    const available = new Set(attachmentFiles.map((file) => file.name.trim().toLowerCase()));

    for (const row of rows) {
      for (const name of row.attachmentFileNames) {
        if (!available.has(name.trim().toLowerCase())) {
          return `Attachment file '${name}' (row ${row.rowNumber}) is not selected. Upload that file or remove it from sheet.`;
        }
      }
    }

    return "";
  }

  async function uploadAttachmentNameMap() {
    if (attachmentFiles.length === 0) {
      return new Map<string, string>();
    }

    const uploaded = await uploadAttachments(attachmentFiles);
    const map = new Map<string, string>();

    for (let index = 0; index < uploaded.length; index += 1) {
      const source = attachmentFiles[index];
      const target = uploaded[index];
      if (source?.name && target?.fileId) {
        map.set(source.name.trim().toLowerCase(), target.fileId);
      }
    }

    return map;
  }

  function toApiRows(rows: ParsedBulkRow[], attachmentMap?: Map<string, string>) {
    return rows.map((row) => {
      const mappedIds = row.attachmentFileNames
        .map((name) => attachmentMap?.get(name.trim().toLowerCase()) || "")
        .filter(Boolean);

      return {
        goalId: row.goalId,
        scheduledAt: row.scheduledAt,
        employeeNotes: row.employeeNotes,
        isFinalCheckIn: row.isFinalCheckIn,
        managerRating: row.managerRating,
        attachmentFileIds: Array.from(new Set([...row.attachmentFileIds, ...mappedIds])),
      };
    });
  }

  async function handlePreview() {
    if (bulkRows.length === 0) return;

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const attachmentValidationError = validateAttachmentReferences(bulkRows);
      if (attachmentValidationError) {
        throw new Error(attachmentValidationError);
      }

      const payload = await previewBulkCheckIns({ rows: toApiRows(bulkRows) });
      setPreviewRows(payload.rows || []);
      setPreviewCounts({
        total: Number(payload.totalRows || 0),
        valid: Number(payload.validRows || 0),
        invalid: Number(payload.invalidRows || 0),
      });
      setSuccess(`Preview complete: ${payload.validRows} valid, ${payload.invalidRows} invalid.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCommit() {
    if (bulkRows.length === 0) return;

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const attachmentValidationError = validateAttachmentReferences(bulkRows);
      if (attachmentValidationError) {
        throw new Error(attachmentValidationError);
      }

      const attachmentMap = await uploadAttachmentNameMap();
      const commitPayload = await commitBulkCheckIns({
        rows: toApiRows(bulkRows, attachmentMap),
        idempotencyKey:
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        templateVersion: "checkin-v1",
      });

      const summary = commitPayload.summary;
      setSuccess(`Imported ${summary.successRows} check-ins. Failed rows: ${summary.failedRows}.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Commit failed.");
    } finally {
      setSubmitting(false);
    }
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [nextGoals, nextCheckIns, nextMeetRequests] = await Promise.all([
        fetchGoals(),
        fetchCheckIns(),
        fetchMeetRequests().catch(() => []),
      ]);
      setGoals(nextGoals);
      setCheckIns(nextCheckIns);

      const groupedMeetings = nextMeetRequests.reduce<Record<string, MeetRequestItem[]>>((acc, meeting) => {
        const linkedGoalIds = meeting.linkedGoalIds || [];
        if (linkedGoalIds.length === 0) return acc;

        const hasContext = Boolean(
          (meeting.intelligenceSummary && meeting.intelligenceSummary.trim()) ||
            (meeting.transcriptText && meeting.transcriptText.trim())
        );
        if (!hasContext) return acc;

        linkedGoalIds.forEach((goalId) => {
          if (!acc[goalId]) {
            acc[goalId] = [];
          }
          acc[goalId].push(meeting);
        });

        return acc;
      }, {});

      Object.values(groupedMeetings).forEach((meetings) => {
        meetings.sort((a, b) => {
          const aTime = new Date(a.scheduledStartTime || a.proposedStartTime || a.requestedAt || 0).getTime();
          const bTime = new Date(b.scheduledStartTime || b.proposedStartTime || b.requestedAt || 0).getTime();
          return bTime - aTime;
        });
      });

      setMeetingsByGoal(groupedMeetings);

    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load check-ins.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <Stack gap="4">
      <PageHeader
        title="Check-ins"
        subtitle="Schedule and track coaching conversations."
        actions={
          <Button variant="secondary" onClick={loadData} disabled={loading || submitting}>
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="error" title="Action failed" description={error} onDismiss={() => setError("")} />}
      {success && <Alert variant="success" title="Done" description={success} onDismiss={() => setSuccess("")} />}

      <Grid cols={1} colsLg={2} gap="3">
        <Card title="Bulk Check-in Upload" description="Upload one Excel sheet to create check-ins for multiple goals.">
          <Stack gap="3">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/api/check-ins/import/template"
                className="caption text-[var(--color-primary)] hover:underline"
              >
                Download template
              </Link>
              <span className="caption">Only approved goals are accepted.</span>
            </div>

            <div className="space-y-2">
              <label className="body-sm font-medium text-[var(--color-text)]" htmlFor="bulk-checkin-sheet">
                Upload check-in sheet (.xlsx/.csv)
              </label>
              <input
                id="bulk-checkin-sheet"
                type="file"
                accept=".xlsx,.xls,.csv"
                className="body-sm"
                onChange={handleBulkFileUpload}
              />
              {bulkFileName && <p className="caption">Loaded file: {bulkFileName}</p>}
            </div>

            <div className="space-y-2">
              <label className="body-sm font-medium text-[var(--color-text)]" htmlFor="bulk-checkin-attachments">
                Attachment files for attachmentFileNames column (optional)
              </label>
              <input
                id="bulk-checkin-attachments"
                type="file"
                multiple
                accept=".png,.jpg,.jpeg,.pdf,.eml"
                className="body-sm"
                onChange={(event) => {
                  const files = event.target.files ? Array.from(event.target.files) : [];
                  setAttachmentFiles(files);
                }}
              />
              {attachmentFiles.length > 0 && (
                <p className="caption">Selected attachments: {attachmentFiles.map((file) => file.name).join(", ")}</p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={handlePreview} loading={submitting || bulkLoading} disabled={bulkRows.length === 0}>
                Preview Upload
              </Button>
              <Button onClick={handleCommit} loading={submitting} disabled={bulkRows.length === 0 || bulkLoading}>
                Commit Upload
              </Button>
            </div>

            {bulkRows.length > 0 && (
              <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2">
                <p className="caption">Rows parsed: {bulkRows.length}</p>
                <p className="caption">Approved-goal rows in sheet: {bulkRows.filter((row) => approvedGoals.has(row.goalId)).length}</p>
                <p className="caption">Preview valid rows: {previewCounts.valid} / {previewCounts.total}</p>
              </div>
            )}

            {previewRows.length > 0 && (
              <div className="space-y-2">
                <p className="caption font-medium">Preview details</p>
                {previewRows.slice(0, 12).map((row) => (
                  <div key={`preview-${row.rowNumber}`} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="caption">Row {row.rowNumber}</p>
                      <Badge variant={row.valid ? "success" : "danger"}>{row.valid ? "valid" : "invalid"}</Badge>
                    </div>
                    {!row.valid && <p className="caption mt-1">{row.errors.join("; ")}</p>}
                  </div>
                ))}
                {previewRows.length > 12 && <p className="caption">Showing first 12 rows only.</p>}
              </div>
            )}
          </Stack>
        </Card>

        <Card title="Check-in Activity" description="Planned and completed sessions.">
          <Stack gap="2">
            {loading && <p className="caption">Loading check-ins...</p>}
            {!loading && checkIns.length === 0 && <p className="caption">No check-ins yet.</p>}
            {checkIns.map((checkIn) => (
              <div key={checkIn.$id} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-3">
                {(() => {
                  const linkedMeetings = meetingsByGoal[checkIn.goalId] || [];
                  return linkedMeetings.length > 0 ? (
                    <div className="mb-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
                      <p className="caption font-medium">Meeting intelligence context</p>
                      {linkedMeetings.slice(0, 2).map((meeting) => (
                        <div key={meeting.$id} className="mt-1">
                          <p className="caption">
                            {meeting.title || "Goal-linked meeting"}
                            {meeting.scheduledStartTime ? ` (${formatDate(meeting.scheduledStartTime)})` : ""}
                          </p>
                          <p className="caption text-[var(--color-text-muted)]">
                            {meeting.intelligenceSummary || meeting.transcriptText || "Meeting notes available."}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null;
                })()}

                <div className="flex items-center justify-between gap-2">
                  <p className="body-sm text-[var(--color-text)]">{formatDate(checkIn.scheduledAt)}</p>
                  <Badge variant={checkInStatusVariant(checkIn.status)}>{checkIn.status}</Badge>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge
                    variant={checkIn.managerReviewStatus === "reviewed" ? "success" : "info"}
                  >
                    Manager review: {checkIn.managerReviewStatus || (checkIn.status === "completed" ? "reviewed" : "pending")}
                  </Badge>
                  {checkIn.managerReviewedAt && (
                    <span className="caption">Reviewed: {formatDate(checkIn.managerReviewedAt)}</span>
                  )}
                </div>

                <p className="caption mt-2">Goal: {checkIn.goalId}</p>
                {checkIn.employeeNotes && <p className="caption mt-2">{checkIn.employeeNotes}</p>}
                {checkIn.attachmentIds && checkIn.attachmentIds.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1">
                    <p className="caption">Attachments: {checkIn.attachmentIds.length}</p>
                    {checkIn.attachmentIds.map((fileId) => (
                      <a
                        key={fileId}
                        href={getAttachmentDownloadPath(fileId)}
                        target="_blank"
                        rel="noreferrer"
                        className="caption text-[var(--color-primary)] hover:underline"
                      >
                        Open attachment {fileId.slice(0, 8)}
                      </a>
                    ))}
                  </div>
                )}

                {checkIn.status === "completed" && (
                  <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
                    {checkIn.managerNotes ? (
                      <p className="caption">Manager notes: {checkIn.managerNotes}</p>
                    ) : (
                      <p className="caption">Manager notes: Not provided.</p>
                    )}

                    {checkIn.managerReviewComments && !checkIn.managerNotes && (
                      <p className="caption mt-1">Manager review: {checkIn.managerReviewComments}</p>
                    )}

                    {checkIn.transcriptText && (
                      <p className="caption mt-1">Transcript summary: {checkIn.transcriptText}</p>
                    )}

                    {checkIn.isFinalCheckIn && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge variant="success">Final check-in</Badge>
                        {typeof checkIn.managerRating === "number" && (
                          <span className="caption">Manager rating: {checkIn.managerRating}/5</span>
                        )}
                        {typeof checkIn.managerRating !== "number" && (
                          <span className="caption">Final rating unlocks after HR closes the cycle.</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </Stack>
        </Card>
      </Grid>
    </Stack>
  );
}

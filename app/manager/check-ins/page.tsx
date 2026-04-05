"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Grid, Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Card, Checkbox, Dropdown, Input, Textarea } from "@/src/components/ui";
import {
  CheckInItem,
  checkInStatusVariant,
  createCheckIn,
  fetchCheckIns,
  fetchGoals,
  fetchMeetRequests,
  formatDate,
  getAttachmentDownloadPath,
  GoalItem,
  MeetRequestItem,
  uploadAttachments,
} from "@/app/employee/_lib/pmsClient";

export default function ManagerCheckInsPage() {
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [checkIns, setCheckIns] = useState<CheckInItem[]>([]);
  const [meetingsByGoal, setMeetingsByGoal] = useState<Record<string, MeetRequestItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0);

  const [form, setForm] = useState({
    goalId: "",
    scheduledAt: "",
    employeeNotes: "",
    isFinalCheckIn: false,
  });

  const approvedGoals = goals.filter((goal) => goal.status === "approved");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [nextGoals, nextCheckIns, nextMeetRequests] = await Promise.all([
        fetchGoals("self"),
        fetchCheckIns("self"),
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

      if (nextGoals.length > 0) {
        const eligible = nextGoals.filter((goal) => goal.status === "approved");
        if (eligible.length > 0) {
          setForm((prev) => ({ ...prev, goalId: prev.goalId || eligible[0].$id }));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load check-ins.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const uploaded = selectedFiles.length > 0 ? await uploadAttachments(selectedFiles) : [];

      await createCheckIn({
        goalId: form.goalId,
        scheduledAt: form.scheduledAt,
        employeeNotes: form.employeeNotes,
        // Manager self check-ins go straight to HR review queue.
        status: "completed",
        isFinalCheckIn: form.isFinalCheckIn,
        attachmentIds: uploaded.map((item) => item.fileId),
      });

      setForm((prev) => ({ ...prev, employeeNotes: "", isFinalCheckIn: false }));
      setSelectedFiles([]);
      setFileInputKey((prev) => prev + 1);
      setSuccess("Check-in submitted to HR review.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create check-in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Stack gap="4">
      <PageHeader
        title="My Check-ins"
        subtitle="Schedule and track your own coaching conversations."
        actions={
          <Button variant="secondary" onClick={loadData} disabled={loading || submitting}>
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="error" title="Action failed" description={error} onDismiss={() => setError("")} />}
      {success && <Alert variant="success" title="Done" description={success} onDismiss={() => setSuccess("")} />}

      <Grid cols={1} colsLg={2} gap="3">
        <Card title="Plan Check-in" description="Book the next touchpoint on one of your goals.">
          <form className="space-y-3" onSubmit={handleSubmit}>
            <Dropdown
              label="Goal"
              value={form.goalId}
              onChange={(goalId) => setForm((prev) => ({ ...prev, goalId }))}
              options={approvedGoals.map((goal) => ({ value: goal.$id, label: goal.title }))}
              placeholder={approvedGoals.length ? undefined : "No approved goals available"}
              disabled={approvedGoals.length === 0}
            />
            {approvedGoals.length === 0 && (
              <p className="caption">
                Check-ins open only after manager approves at least one goal.
              </p>
            )}
            {approvedGoals.length === 0 && (
              <p className="caption">
                For manager-owned goals, approval is completed by HR.
              </p>
            )}
            <Input
              label="When"
              type="datetime-local"
              value={form.scheduledAt}
              onChange={(event) => setForm((prev) => ({ ...prev, scheduledAt: event.target.value }))}
              required
            />
            <Textarea
              label="Notes"
              value={form.employeeNotes}
              onChange={(event) => setForm((prev) => ({ ...prev, employeeNotes: event.target.value }))}
            />

            <Checkbox
              label="Mark this as my final check-in for this goal"
              description="HR will grade this final check-in in the approval queue."
              checked={form.isFinalCheckIn}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, isFinalCheckIn: event.target.checked }))
              }
            />

            <div className="flex flex-col gap-2">
              <label className="body-sm font-medium text-[var(--color-text)]" htmlFor="checkin-files">
                Proof Attachments (optional)
              </label>
              <input
                key={fileInputKey}
                id="checkin-files"
                type="file"
                multiple
                accept=".png,.jpg,.jpeg,.pdf,.eml"
                className="body-sm"
                onChange={(event) => {
                  const files = event.target.files ? Array.from(event.target.files) : [];
                  setSelectedFiles(files);
                }}
              />
              {selectedFiles.length > 0 && (
                <p className="caption">Selected files: {selectedFiles.map((file) => file.name).join(", ")}</p>
              )}
            </div>

            <Button type="submit" loading={submitting} disabled={!form.goalId || approvedGoals.length === 0}>
              Create And Send To HR
            </Button>
          </form>
        </Card>

        <Card title="Check-in Activity" description="Planned and completed sessions.">
          <Stack gap="2">
            {loading && <p className="caption">Loading check-ins...</p>}
            {!loading && checkIns.length === 0 && <p className="caption">No check-ins yet.</p>}
            {checkIns.map((checkIn) => (
              <div
                key={checkIn.$id}
                className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-3"
              >
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
                      <p className="caption">Reviewer notes: {checkIn.managerNotes}</p>
                    ) : (
                      <p className="caption">Reviewer notes: Not provided.</p>
                    )}

                    {checkIn.transcriptText && (
                      <p className="caption mt-1">Transcript summary: {checkIn.transcriptText}</p>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          checkIn.hrReviewStatus === "approved"
                            ? "success"
                            : checkIn.hrReviewStatus === "rejected"
                              ? "danger"
                              : checkIn.hrReviewStatus === "needs_changes"
                                ? "warning"
                                : "info"
                        }
                      >
                        HR review: {checkIn.hrReviewStatus || "pending"}
                      </Badge>
                      {checkIn.hrReviewedAt && (
                        <span className="caption">Reviewed: {formatDate(checkIn.hrReviewedAt)}</span>
                      )}
                    </div>

                    {checkIn.hrReviewComments && (
                      <p className="caption mt-1">HR comments: {checkIn.hrReviewComments}</p>
                    )}

                    {checkIn.isFinalCheckIn && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge variant="success">Final check-in</Badge>
                        {checkIn.hrManagerRatingLabel ? (
                          <span className="caption">
                            HR grade: {checkIn.hrManagerRatingLabel}
                            {typeof checkIn.hrManagerRating === "number"
                              ? ` (${checkIn.hrManagerRating}/5)`
                              : ""}
                          </span>
                        ) : (
                          <span className="caption">Awaiting HR grading.</span>
                        )}
                      </div>
                    )}

                    {checkIn.isFinalCheckIn && checkIn.hrManagerRatingComments && (
                      <p className="caption mt-1">HR grade comments: {checkIn.hrManagerRatingComments}</p>
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

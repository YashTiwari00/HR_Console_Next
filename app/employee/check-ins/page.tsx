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
  formatDate,
  getAttachmentDownloadPath,
  GoalItem,
  uploadAttachments,
} from "@/app/employee/_lib/pmsClient";

export default function EmployeeCheckInsPage() {
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [checkIns, setCheckIns] = useState<CheckInItem[]>([]);
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
      const [nextGoals, nextCheckIns] = await Promise.all([fetchGoals(), fetchCheckIns()]);
      setGoals(nextGoals);
      setCheckIns(nextCheckIns);

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
        status: "planned",
        isFinalCheckIn: form.isFinalCheckIn,
        attachmentIds: uploaded.map((item) => item.fileId),
      });

      setForm((prev) => ({ ...prev, employeeNotes: "", isFinalCheckIn: false }));
      setSelectedFiles([]);
      setFileInputKey((prev) => prev + 1);
      setSuccess("Check-in created.");
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
              description="Manager will be asked to provide a final rating when completing this check-in."
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
              Create Check-in
            </Button>
          </form>
        </Card>

        <Card title="Check-in Activity" description="Planned and completed sessions.">
          <Stack gap="2">
            {loading && <p className="caption">Loading check-ins...</p>}
            {!loading && checkIns.length === 0 && <p className="caption">No check-ins yet.</p>}
            {checkIns.map((checkIn) => (
              <div key={checkIn.$id} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-3">
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
                      <p className="caption">Manager notes: {checkIn.managerNotes}</p>
                    ) : (
                      <p className="caption">Manager notes: Not provided.</p>
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

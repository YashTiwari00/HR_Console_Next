"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Grid, Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Card, Dropdown, Input, Textarea } from "@/src/components/ui";
import {
  createProgressUpdate,
  fetchGoals,
  fetchProgressUpdates,
  getAttachmentDownloadPath,
  GoalItem,
  ProgressUpdateItem,
  RagStatus,
  uploadAttachments,
} from "@/app/employee/_lib/pmsClient";

const ragOptions = [
  { value: "on_track", label: "On Track" },
  { value: "behind", label: "Behind" },
  { value: "completed", label: "Completed" },
];

function ragVariant(status: RagStatus) {
  if (status === "completed") return "success" as const;
  if (status === "behind") return "warning" as const;
  return "info" as const;
}

export default function EmployeeProgressPage() {
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [updates, setUpdates] = useState<ProgressUpdateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0);

  const [form, setForm] = useState({
    goalId: "",
    percentComplete: "0",
    ragStatus: "on_track",
    updateText: "",
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [nextGoals, nextUpdates] = await Promise.all([
        fetchGoals(),
        fetchProgressUpdates(),
      ]);

      setGoals(nextGoals);
      setUpdates(nextUpdates);
      if (nextGoals.length > 0) {
        setForm((prev) => ({ ...prev, goalId: prev.goalId || nextGoals[0].$id }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load progress data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const average = useMemo(() => {
    if (goals.length === 0) return 0;
    const total = goals.reduce((sum, item) => sum + (item.progressPercent || 0), 0);
    return Math.round(total / goals.length);
  }, [goals]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const uploaded = selectedFiles.length > 0 ? await uploadAttachments(selectedFiles) : [];

      await createProgressUpdate({
        goalId: form.goalId,
        percentComplete: Number.parseInt(form.percentComplete, 10),
        ragStatus: form.ragStatus as RagStatus,
        updateText: form.updateText,
        attachmentIds: uploaded.map((item) => item.fileId),
      });

      setForm((prev) => ({ ...prev, updateText: "" }));
      setSelectedFiles([]);
      setFileInputKey((prev) => prev + 1);
      setSuccess("Progress update saved.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save update.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Stack gap="4">
      <PageHeader
        title="Progress Updates"
        subtitle="Log progress continuously and keep goals on track."
        actions={
          <Button variant="secondary" onClick={loadData} disabled={loading || submitting}>
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="error" title="Action failed" description={error} onDismiss={() => setError("")} />}
      {success && <Alert variant="success" title="Done" description={success} onDismiss={() => setSuccess("")} />}

      <Grid cols={1} colsMd={3} gap="3">
        <Card title="Goals Tracked">
          <p className="heading-xl">{loading ? "..." : goals.length}</p>
        </Card>
        <Card title="Average Progress">
          <p className="heading-xl">{loading ? "..." : `${average}%`}</p>
        </Card>
        <Card title="Updates Logged">
          <p className="heading-xl">{loading ? "..." : updates.length}</p>
        </Card>
      </Grid>

      <Card title="Create Progress Update" description="Capture blockers, wins, and current status.">
        <form className="space-y-3" onSubmit={handleSubmit}>
          <Dropdown
            label="Goal"
            value={form.goalId}
            onChange={(goalId) => setForm((prev) => ({ ...prev, goalId }))}
            options={goals.map((goal) => ({ value: goal.$id, label: goal.title }))}
            placeholder={goals.length ? undefined : "Create a goal first"}
            disabled={goals.length === 0}
          />

          <Grid cols={1} colsMd={2} gap="2">
            <Input
              label="Percent Complete"
              type="number"
              min={0}
              max={100}
              value={form.percentComplete}
              onChange={(event) => setForm((prev) => ({ ...prev, percentComplete: event.target.value }))}
              required
            />
            <Dropdown
              label="RAG Status"
              value={form.ragStatus}
              onChange={(ragStatus) => setForm((prev) => ({ ...prev, ragStatus }))}
              options={ragOptions}
            />
          </Grid>

          <Textarea
            label="Update"
            value={form.updateText}
            onChange={(event) => setForm((prev) => ({ ...prev, updateText: event.target.value }))}
            required
          />

          <div className="flex flex-col gap-2">
            <label className="body-sm font-medium text-[var(--color-text)]" htmlFor="proof-files">
              Proof Attachments (optional)
            </label>
            <input
              key={fileInputKey}
              id="proof-files"
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

          <Button type="submit" loading={submitting} disabled={!form.goalId}>
            Save Progress Update
          </Button>
        </form>
      </Card>

      <Card title="Recent Updates" description="Your latest updates across all goals.">
        <Stack gap="2">
          {!loading && updates.length === 0 && <p className="caption">No progress updates yet.</p>}
          {updates.map((item) => (
            <div key={item.$id} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="body-sm text-[var(--color-text)]">Goal: {item.goalId}</p>
                <Badge variant={ragVariant(item.ragStatus)}>{item.ragStatus}</Badge>
              </div>
              <p className="caption mt-2">{item.updateText}</p>
              <p className="caption mt-2">Progress: {item.percentComplete}%</p>
              {item.attachmentIds && item.attachmentIds.length > 0 && (
                <div className="mt-2 flex flex-col gap-1">
                  <p className="caption">Attachments: {item.attachmentIds.length}</p>
                  {item.attachmentIds.map((fileId) => (
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
            </div>
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}

"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Container, Grid, Stack } from "@/src/components/layout";
import { FormSection, PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Card, Divider, Dropdown, Input, Skeleton, Textarea } from "@/src/components/ui";
import { MILESTONE_MESSAGES } from "@/lib/milestones";
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

const THRESHOLDS = [25, 50, 75, 100] as const;

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
  const [previousPct, setPreviousPct] = useState(0);
  const [justCrossedMilestone, setJustCrossedMilestone] = useState<
    { threshold: 25 | 50 | 75 | 100; goalTitle: string } | null
  >(null);

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

  useEffect(() => {
    const activeGoal = goals.find((goal) => goal.$id === form.goalId) || null;
    setPreviousPct(Number(activeGoal?.progressPercent || 0));
  }, [goals, form.goalId]);

  useEffect(() => {
    if (!justCrossedMilestone) return;
    const timer = setTimeout(() => setJustCrossedMilestone(null), 8000);
    return () => clearTimeout(timer);
  }, [justCrossedMilestone]);

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
      const targetGoal = goals.find((goal) => goal.$id === form.goalId) || null;
      const goalTitle = String(targetGoal?.title || "your goal");
      const newPct = Number.parseInt(form.percentComplete, 10);
      const crossed = THRESHOLDS.find((threshold) => previousPct < threshold && newPct >= threshold);

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
      setPreviousPct(newPct);
      if (crossed) {
        setJustCrossedMilestone({ threshold: crossed, goalTitle });
      }
      setSuccess("Progress update saved.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save update.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Container maxWidth="xl">
      <Stack gap="6">
        <PageHeader
          title="Progress Updates"
          subtitle="Log progress continuously and keep goals on track"
          actions={
            <Button variant="secondary" onClick={loadData} disabled={loading || submitting}>
              Refresh
            </Button>
          }
        />

        {error && <Alert variant="error" title="Action failed" description={error} onDismiss={() => setError("")} />}
        {success && <Alert variant="success" title="Done" description={success} onDismiss={() => setSuccess("")} />}

        <Stack gap="4">
          <Grid cols={1} colsMd={3} gap="3">
            <Card className="hover:shadow-[var(--shadow-md)]">
              <Stack gap="2">
                <div className="flex items-start justify-between gap-[var(--space-2)]">
                  <p className="caption">Goals Tracked</p>
                  <span
                    aria-hidden="true"
                    className="h-[var(--space-4)] w-[var(--space-4)] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)]"
                  />
                </div>
                {loading ? (
                  <Skeleton variant="rect" className="h-[var(--space-5)] w-[72px]" />
                ) : (
                  <p className="heading-xl font-bold text-[var(--color-text)]">{goals.length}</p>
                )}
              </Stack>
            </Card>
            <Card className="hover:shadow-[var(--shadow-md)]">
              <Stack gap="2">
                <div className="flex items-start justify-between gap-[var(--space-2)]">
                  <p className="caption">Average Progress</p>
                  <span
                    aria-hidden="true"
                    className="h-[var(--space-4)] w-[var(--space-4)] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)]"
                  />
                </div>
                {loading ? (
                  <Skeleton variant="rect" className="h-[var(--space-5)] w-[88px]" />
                ) : (
                  <p className="heading-xl font-bold text-[var(--color-text)]">{`${average}%`}</p>
                )}
              </Stack>
            </Card>
            <Card className="hover:shadow-[var(--shadow-md)]">
              <Stack gap="2">
                <div className="flex items-start justify-between gap-[var(--space-2)]">
                  <p className="caption">Updates Logged</p>
                  <span
                    aria-hidden="true"
                    className="h-[var(--space-4)] w-[var(--space-4)] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)]"
                  />
                </div>
                {loading ? (
                  <Skeleton variant="rect" className="h-[var(--space-5)] w-[72px]" />
                ) : (
                  <p className="heading-xl font-bold text-[var(--color-text)]">{updates.length}</p>
                )}
              </Stack>
            </Card>
          </Grid>

          <Divider label="Workspace" />

          <Grid cols={1} colsLg={12} gap="4">
            <div className="lg:col-span-7">
              <Stack gap="3">
                <Card>
                  <Stack gap="3">
                    <Stack gap="1">
                      <h3 className="heading-lg text-[var(--color-text)]">Create Progress Update</h3>
                      <p className="body-sm text-[var(--color-text-muted)]">Capture blockers, wins, and current status.</p>
                    </Stack>

                    <form onSubmit={handleSubmit}>
                      <Stack gap="3">
                        <FormSection title="Goal Selection" description="Choose the goal this update belongs to.">
                          <Dropdown
                            label="Goal"
                            value={form.goalId}
                            onChange={(goalId) => setForm((prev) => ({ ...prev, goalId }))}
                            options={goals.map((goal) => ({ value: goal.$id, label: goal.title }))}
                            placeholder={goals.length ? undefined : "Create a goal first"}
                            disabled={goals.length === 0}
                          />
                        </FormSection>

                        <FormSection title="Progress Details" description="Update completion, status, and supporting notes." divider>
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

                          <Stack gap="2">
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
                          </Stack>
                        </FormSection>

                        <div className="flex justify-end">
                          <Button type="submit" size="lg" loading={submitting} disabled={!form.goalId}>
                            Save Progress Update
                          </Button>
                        </div>
                      </Stack>
                    </form>
                  </Stack>
                </Card>
              </Stack>
            </div>

            <div className="lg:col-span-5">
              <Stack gap="3">
                <Card title="Insights" description="Placeholder panel for quick progress guidance.">
                  <Stack gap="3">
                    <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-[var(--space-3)] py-[var(--space-3)]">
                      <Stack gap="1">
                        <div className="flex items-center justify-between gap-[var(--space-2)]">
                          <p className="caption">Your Status</p>
                          <Badge variant="info">Preview</Badge>
                        </div>
                        <p className="body-sm text-[var(--color-text)]">Average progress: {loading ? "..." : `${average}%`}</p>
                        <p className="caption text-[var(--color-text-muted)]">Trend: --</p>
                      </Stack>
                    </div>

                    <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-[var(--space-3)] py-[var(--space-3)]">
                      <Stack gap="1">
                        <div className="flex items-center justify-between gap-[var(--space-2)]">
                          <p className="caption">At Risk Goals</p>
                          <Badge variant="warning">Placeholder</Badge>
                        </div>
                        <p className="body-sm text-[var(--color-text)]">Count: --</p>
                      </Stack>
                    </div>

                    <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-[var(--space-3)] py-[var(--space-3)]">
                      <Stack gap="1">
                        <div className="flex items-center justify-between gap-[var(--space-2)]">
                          <p className="caption">Tips</p>
                          <Badge variant="success">Action</Badge>
                        </div>
                        <p className="body-sm text-[var(--color-text-muted)]">Update regularly to stay on track.</p>
                      </Stack>
                    </div>
                  </Stack>
                </Card>
              </Stack>
            </div>
          </Grid>

          {justCrossedMilestone && (
            <div className="rounded-[var(--radius-md)] border border-[var(--color-success)] bg-[var(--color-success-subtle)] px-[var(--space-3)] py-[var(--space-3)]">
              <div className="flex items-start justify-between gap-[var(--space-3)]">
                <div className="flex items-start gap-[var(--space-3)]">
                  <span className="text-2xl leading-none" aria-hidden="true">
                    {MILESTONE_MESSAGES[`progress_${justCrossedMilestone.threshold}` as keyof typeof MILESTONE_MESSAGES]?.emoji || "🎉"}
                  </span>
                  <Stack gap="1">
                    <p className="body font-semibold text-[var(--color-text)]">
                      {MILESTONE_MESSAGES[`progress_${justCrossedMilestone.threshold}` as keyof typeof MILESTONE_MESSAGES]?.title || "Milestone reached!"}
                    </p>
                    <p className="caption text-[var(--color-text)]">
                      {String(
                        MILESTONE_MESSAGES[`progress_${justCrossedMilestone.threshold}` as keyof typeof MILESTONE_MESSAGES]?.body ||
                          "You crossed a milestone on '{goalTitle}'."
                      ).replace("{goalTitle}", justCrossedMilestone.goalTitle)}
                    </p>
                  </Stack>
                </div>
                <button
                  type="button"
                  onClick={() => setJustCrossedMilestone(null)}
                  className="caption text-[var(--color-text)] underline underline-offset-2 hover:no-underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          <Divider label="Timeline" />

          <Card title="Recent Updates" description="Timeline of your latest updates across all goals.">
            <Stack gap="3">
              {loading &&
                Array.from({ length: 3 }).map((_, index) => (
                  <div key={`update-skeleton-${index}`} className="flex gap-[var(--space-3)]">
                    <div className="flex w-[var(--space-3)] flex-col items-center">
                      <Skeleton variant="circle" className="mt-[var(--space-1)] h-[var(--space-2)] w-[var(--space-2)]" />
                      {index < 2 && <Skeleton variant="rect" className="mt-[var(--space-1)] h-full w-px" />}
                    </div>

                    <div className="flex-1">
                      <Card className="shadow-none">
                        <Stack gap="2">
                          <div className="flex items-start justify-between gap-[var(--space-2)]">
                            <Skeleton variant="rect" className="h-[var(--space-3)] w-[40%]" />
                            <Skeleton variant="rect" className="h-[var(--space-3)] w-[64px] rounded-[999px]" />
                          </div>
                          <Skeleton variant="rect" className="h-[var(--space-3)] w-[92%]" />
                          <Skeleton variant="rect" className="h-[var(--space-3)] w-[30%]" />
                        </Stack>
                      </Card>
                    </div>
                  </div>
                ))}

              {!loading && updates.length === 0 && (
                <Card className="shadow-none">
                  <p className="body-sm text-[var(--color-text-muted)]">
                    No updates yet. Start by logging your first progress update.
                  </p>
                </Card>
              )}

              {!loading &&
                updates.map((item, index) => (
                  <div key={item.$id} className="flex gap-[var(--space-3)]">
                    <div className="flex w-[var(--space-3)] flex-col items-center">
                      <span className="mt-[var(--space-1)] h-[var(--space-2)] w-[var(--space-2)] rounded-full border border-[var(--color-primary)] bg-[var(--color-primary)]" />
                      {index < updates.length - 1 && (
                        <span className="mt-[var(--space-1)] h-full w-px bg-[var(--color-border)]" />
                      )}
                    </div>

                    <div className="flex-1">
                      <Card className="shadow-none">
                        <Stack gap="2">
                          <div className="flex items-start justify-between gap-[var(--space-2)]">
                            <p className="body-sm font-semibold text-[var(--color-text)]">Goal title: {item.goalId}</p>
                            <Badge variant={ragVariant(item.ragStatus)}>{item.ragStatus}</Badge>
                          </div>
                          <p className="body-sm text-[var(--color-text)]">{item.updateText}</p>
                          <p className="caption">Progress: {item.percentComplete}%</p>
                          {item.attachmentIds && item.attachmentIds.length > 0 && (
                            <Stack gap="1">
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
                            </Stack>
                          )}
                        </Stack>
                      </Card>
                    </div>
                  </div>
                ))}
            </Stack>
          </Card>
        </Stack>
      </Stack>
    </Container>
  );
}

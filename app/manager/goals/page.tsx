"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Grid, Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Card, Dropdown, Input, Textarea } from "@/src/components/ui";
import {
  createGoal,
  fetchGoalFeedback,
  fetchGoals,
  fetchMe,
  getCycleIdFromDate,
  getGoalSuggestions,
  GoalItem,
  GoalSuggestion,
  goalStatusVariant,
  submitGoal,
  updateGoal,
} from "@/app/employee/_lib/pmsClient";

const frameworkOptions = [
  { value: "OKR", label: "OKR" },
  { value: "MBO", label: "MBO" },
  { value: "HYBRID", label: "HYBRID" },
];

export default function ManagerGoalsPage() {
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiSuggestion, setAiSuggestion] = useState<GoalSuggestion | null>(null);

  const [goalForm, setGoalForm] = useState({
    title: "",
    description: "",
    cycleId: getCycleIdFromDate(),
    frameworkType: "OKR",
    managerId: "",
    weightage: "20",
    dueDate: "",
  });

  const [managerResolved, setManagerResolved] = useState(false);
  const [feedbackByGoal, setFeedbackByGoal] = useState<Record<string, string>>({});
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    cycleId: "",
    frameworkType: "OKR",
    managerId: "",
    weightage: "20",
    dueDate: "",
  });

  const loadGoals = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [goalData, feedbackData] = await Promise.all([
        fetchGoals("self"),
        fetchGoalFeedback(undefined, "self"),
      ]);

      setGoals(goalData);

      const nextFeedback = feedbackData.reduce<Record<string, string>>((acc, item) => {
        acc[item.goalId] = item.comments || "No manager comment provided.";
        return acc;
      }, {});

      setFeedbackByGoal(nextFeedback);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load goals.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGoals();
  }, [loadGoals]);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        const data = await fetchMe();

        const managerId = data?.profile?.managerId;
        if (active && managerId) {
          setGoalForm((prev) => ({ ...prev, managerId }));
          setManagerResolved(true);
        }
      } catch {
        // Keep manual manager input fallback if profile lookup fails.
      }
    }

    loadProfile();

    return () => {
      active = false;
    };
  }, []);

  const submittedCount = useMemo(
    () => goals.filter((goal) => goal.status === "submitted").length,
    [goals]
  );

  const cycleWeightage = useMemo(
    () =>
      goals
        .filter((goal) => goal.cycleId === goalForm.cycleId)
        .reduce((sum, goal) => sum + (Number(goal.weightage) || 0), 0),
    [goals, goalForm.cycleId]
  );

  const remainingWeightage = Math.max(0, 100 - cycleWeightage);

  async function handleCreateGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      await createGoal({
        title: goalForm.title,
        description: goalForm.description,
        cycleId: goalForm.cycleId,
        frameworkType: goalForm.frameworkType,
        managerId: goalForm.managerId,
        weightage: Number.parseInt(goalForm.weightage, 10),
        dueDate: goalForm.dueDate || null,
        aiSuggested: Boolean(aiSuggestion),
      });

      setGoalForm((prev) => ({ ...prev, title: "", description: "" }));
      setAiSuggestion(null);
      setSuccess("Goal created as draft.");
      await loadGoals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create goal.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitGoal(goalId: string) {
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      await submitGoal(goalId);
      setSuccess("Goal submitted for HR approval.");
      await loadGoals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit goal.");
    } finally {
      setSubmitting(false);
    }
  }

  function startEditGoal(goal: GoalItem) {
    setEditingGoalId(goal.$id);
    setEditForm({
      title: goal.title,
      description: goal.description,
      cycleId: goal.cycleId,
      frameworkType: goal.frameworkType,
      managerId: goal.managerId,
      weightage: String(goal.weightage),
      dueDate: "",
    });
  }

  async function handleSaveGoalEdit(goalId: string) {
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      await updateGoal(goalId, {
        title: editForm.title,
        description: editForm.description,
        cycleId: editForm.cycleId,
        frameworkType: editForm.frameworkType,
        managerId: editForm.managerId,
        weightage: Number.parseInt(editForm.weightage, 10),
        dueDate: editForm.dueDate || null,
      });

      setSuccess("Goal updated.");
      setEditingGoalId(null);
      await loadGoals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update goal.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAiSuggest() {
    setAiLoading(true);
    setAiError("");

    try {
      const suggestions = await getGoalSuggestions({
        cycleId: goalForm.cycleId,
        frameworkType: goalForm.frameworkType,
        prompt: `${goalForm.title} ${goalForm.description}`.trim(),
      });

      setAiSuggestion(suggestions[0] || null);
      if (!suggestions[0]) {
        setAiError("No suggestion returned. Try refining your prompt.");
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Failed to generate suggestion.");
    } finally {
      setAiLoading(false);
    }
  }

  function handleAcceptAiSuggestion() {
    if (!aiSuggestion) return;

    setGoalForm((prev) => ({
      ...prev,
      title: aiSuggestion.title,
      description: aiSuggestion.description,
      weightage: String(aiSuggestion.weightage),
    }));
  }

  return (
    <Stack gap="4">
      <PageHeader
        title="My Goals Workspace"
        subtitle="Draft, refine, and submit your own goals for HR approval."
        actions={
          <Button variant="secondary" onClick={loadGoals} disabled={loading || submitting}>
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="error" title="Action failed" description={error} onDismiss={() => setError("")} />}
      {success && <Alert variant="success" title="Done" description={success} onDismiss={() => setSuccess("")} />}
      {aiError && <Alert variant="warning" title="AI suggestion issue" description={aiError} onDismiss={() => setAiError("")} />}

      <Grid cols={1} colsLg={2} gap="3">
        <Card title="Create Goal" description="Start with a clear, measurable outcome.">
          <form className="space-y-3" onSubmit={handleCreateGoal}>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" onClick={handleAiSuggest} loading={aiLoading}>
                {aiSuggestion ? "Regenerate AI Suggestion" : "Suggest with AI"}
              </Button>
              {aiSuggestion && (
                <Button type="button" onClick={handleAcceptAiSuggestion}>
                  Accept Suggestion
                </Button>
              )}
            </div>

            {aiSuggestion && (
              <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3">
                <p className="body-sm font-medium text-[var(--color-text)]">AI Draft</p>
                <p className="caption mt-1">{aiSuggestion.title}</p>
                <p className="caption mt-1">{aiSuggestion.description}</p>
                {aiSuggestion.rationale && <p className="caption mt-2">Why: {aiSuggestion.rationale}</p>}
              </div>
            )}

            <Input
              label="Goal Title"
              value={goalForm.title}
              onChange={(event) => setGoalForm((prev) => ({ ...prev, title: event.target.value }))}
              required
            />
            <Textarea
              label="Description"
              value={goalForm.description}
              onChange={(event) => setGoalForm((prev) => ({ ...prev, description: event.target.value }))}
              required
            />
            <Grid cols={1} colsMd={2} gap="2">
              <Input
                label="Cycle ID"
                value={goalForm.cycleId}
                onChange={(event) => setGoalForm((prev) => ({ ...prev, cycleId: event.target.value }))}
                required
              />
              <Input
                label="HR Approver ID"
                value={goalForm.managerId}
                onChange={(event) => setGoalForm((prev) => ({ ...prev, managerId: event.target.value }))}
                helperText={
                  managerResolved
                    ? "Auto-filled from your profile approver mapping."
                    : "Optional: leave blank to auto-resolve first HR profile, or enter HR approver ID."
                }
              />
            </Grid>
            <Grid cols={1} colsMd={3} gap="2">
              <Dropdown
                label="Framework"
                value={goalForm.frameworkType}
                onChange={(frameworkType) =>
                  setGoalForm((prev) => ({ ...prev, frameworkType }))
                }
                options={frameworkOptions}
              />
              <Input
                label="Weightage"
                type="number"
                min={1}
                max={100}
                value={goalForm.weightage}
                onChange={(event) => setGoalForm((prev) => ({ ...prev, weightage: event.target.value }))}
                required
              />
              <Input
                label="Due Date"
                type="date"
                value={goalForm.dueDate}
                onChange={(event) => setGoalForm((prev) => ({ ...prev, dueDate: event.target.value }))}
              />
            </Grid>
            <Button type="submit" loading={submitting}>Create Draft Goal</Button>
          </form>
        </Card>

        <Card title="Queue Snapshot" description="Keep the review cycle moving.">
          <Stack gap="2">
            <p className="body-sm text-[var(--color-text)]">Total goals: {loading ? "..." : goals.length}</p>
            <p className="body-sm text-[var(--color-text)]">Waiting for HR: {loading ? "..." : submittedCount}</p>
            <p className="body-sm text-[var(--color-text)]">
              Cycle weightage ({goalForm.cycleId}): {loading ? "..." : `${cycleWeightage}%`}
            </p>
            <p className="caption">Remaining weightage available: {loading ? "..." : `${remainingWeightage}%`}</p>
            <p className="caption">Tip: Keep each goal specific and measurable before submitting.</p>
          </Stack>
        </Card>
      </Grid>

      <Card title="My Goals" description="Submit drafts and track approvals.">
        <Stack gap="2">
          {loading && <p className="caption">Loading goals...</p>}
          {!loading && goals.length === 0 && <p className="caption">No goals yet. Create your first goal.</p>}
          {goals.map((goal) => (
            <div key={goal.$id} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="body font-medium text-[var(--color-text)]">{goal.title}</p>
                  <p className="caption mt-1">{goal.description}</p>
                </div>
                <Badge variant={goalStatusVariant(goal.status)}>{goal.status}</Badge>
              </div>

              {editingGoalId === goal.$id ? (
                <div className="mt-3 space-y-2">
                  <Input
                    label="Title"
                    value={editForm.title}
                    onChange={(event) =>
                      setEditForm((prev) => ({ ...prev, title: event.target.value }))
                    }
                  />
                  <Textarea
                    label="Description"
                    value={editForm.description}
                    onChange={(event) =>
                      setEditForm((prev) => ({ ...prev, description: event.target.value }))
                    }
                  />
                  <Grid cols={1} colsMd={3} gap="2">
                    <Input
                      label="Cycle ID"
                      value={editForm.cycleId}
                      onChange={(event) =>
                        setEditForm((prev) => ({ ...prev, cycleId: event.target.value }))
                      }
                    />
                    <Dropdown
                      label="Framework"
                      value={editForm.frameworkType}
                      onChange={(frameworkType) =>
                        setEditForm((prev) => ({ ...prev, frameworkType }))
                      }
                      options={frameworkOptions}
                    />
                    <Input
                      label="Weightage"
                      type="number"
                      min={1}
                      max={100}
                      value={editForm.weightage}
                      onChange={(event) =>
                        setEditForm((prev) => ({ ...prev, weightage: event.target.value }))
                      }
                    />
                  </Grid>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleSaveGoalEdit(goal.$id)}
                      loading={submitting}
                    >
                      Save Changes
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingGoalId(null)}
                      disabled={submitting}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span className="caption">Framework: {goal.frameworkType}</span>
                    <span className="caption">Weightage: {goal.weightage}%</span>
                    <span className="caption">Progress: {goal.progressPercent}%</span>
                    {(goal.status === "draft" || goal.status === "needs_changes") && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startEditGoal(goal)}
                          disabled={submitting}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleSubmitGoal(goal.$id)}
                          disabled={submitting}
                        >
                          Submit for Approval
                        </Button>
                      </>
                    )}
                  </div>

                  {feedbackByGoal[goal.$id] && (
                    <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
                      <p className="caption font-medium">Latest approver feedback</p>
                      <p className="caption mt-1">{feedbackByGoal[goal.$id]}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}

"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Card, Input, Select, Textarea } from "@/src/components/ui";
import {
  fetchCurrentUserContext,
  fetchMatrixAssignments,
  fetchMatrixFeedback,
  formatDate,
  MatrixAssignmentItem,
  MatrixFeedbackItem,
  submitMatrixFeedback,
} from "@/app/employee/_lib/pmsClient";

type FeedbackFormState = {
  feedbackText: string;
  suggestedRating: string;
  confidence: "low" | "medium" | "high";
};

function confidenceVariant(level: string) {
  if (level === "high") return "success" as const;
  if (level === "low") return "warning" as const;
  return "info" as const;
}

export default function EmployeeMatrixFeedbackPage() {
  const [reviewerId, setReviewerId] = useState("");
  const [cycleFilter, setCycleFilter] = useState("");
  const [assignments, setAssignments] = useState<MatrixAssignmentItem[]>([]);
  const [feedbackRows, setFeedbackRows] = useState<MatrixFeedbackItem[]>([]);
  const [formByAssignment, setFormByAssignment] = useState<Record<string, FeedbackFormState>>({});
  const [submittingByAssignment, setSubmittingByAssignment] = useState<Record<string, boolean>>({});

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const feedbackByAssignment = useMemo(
    () =>
      new Map(
        feedbackRows.map((row) => [String(row.assignmentId || "").trim(), row] as const)
      ),
    [feedbackRows]
  );

  const pendingAssignments = useMemo(() => {
    const responded = new Set(feedbackRows.map((row) => String(row.assignmentId || "").trim()));
    return assignments.filter((row) => !responded.has(String(row.id || "").trim()));
  }, [assignments, feedbackRows]);

  const loadData = useCallback(async () => {
    if (!reviewerId) {
      setAssignments([]);
      setFeedbackRows([]);
      return;
    }

    const [assignmentData, feedbackData] = await Promise.all([
      fetchMatrixAssignments({
        reviewerId,
        cycleId: cycleFilter.trim() || undefined,
      }),
      fetchMatrixFeedback({
        reviewerId,
        cycleId: cycleFilter.trim() || undefined,
      }),
    ]);

    setAssignments(assignmentData);
    setFeedbackRows(feedbackData);

    setFormByAssignment((prev) => {
      const next = { ...prev };
      for (const row of assignmentData) {
        if (!next[row.id]) {
          next[row.id] = {
            feedbackText: "",
            suggestedRating: "",
            confidence: "medium",
          };
        }
      }
      return next;
    });
  }, [reviewerId, cycleFilter]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError("");

    try {
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load matrix reviewer tasks.");
    } finally {
      setRefreshing(false);
    }
  }, [loadData]);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      setLoading(true);
      setError("");

      try {
        const context = await fetchCurrentUserContext();
        const id = String(context?.user?.$id || context?.profile?.$id || "").trim();
        if (!mounted) return;

        setReviewerId(id);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Unable to initialize matrix feedback page.");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    bootstrap();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!reviewerId) return;
    refresh();
  }, [reviewerId, cycleFilter, refresh]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>, assignment: MatrixAssignmentItem) {
    event.preventDefault();
    const form = formByAssignment[assignment.id] || {
      feedbackText: "",
      suggestedRating: "",
      confidence: "medium",
    };

    const feedbackText = String(form.feedbackText || "").trim();
    if (!feedbackText) {
      setError("Feedback text is required before submitting.");
      return;
    }

    const suggestedRating = form.suggestedRating
      ? Number.parseInt(form.suggestedRating, 10)
      : undefined;

    setSubmittingByAssignment((prev) => ({ ...prev, [assignment.id]: true }));
    setError("");
    setSuccess("");

    try {
      await submitMatrixFeedback({
        assignmentId: assignment.id,
        employeeId: assignment.employeeId,
        cycleId: assignment.cycleId,
        goalId: assignment.goalId || undefined,
        feedbackText,
        suggestedRating,
        confidence: form.confidence,
      });

      setSuccess("Matrix feedback submitted successfully.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit matrix feedback.");
    } finally {
      setSubmittingByAssignment((prev) => ({ ...prev, [assignment.id]: false }));
    }
  }

  return (
    <Stack gap="5">
      <PageHeader
        title="Matrix Feedback"
        subtitle="Submit peer or cross-functional review input for matrix assignments."
        actions={
          <Button type="button" variant="secondary" onClick={refresh} disabled={loading || refreshing}>
            {refreshing ? "Refreshing..." : "Refresh"}
          </Button>
        }
      />

      {error && <Alert variant="error" title="Action required" description={error} onDismiss={() => setError("")} />}
      {success && <Alert variant="success" title="Saved" description={success} onDismiss={() => setSuccess("")} />}

      <Card>
        <div className="grid gap-3 md:grid-cols-3">
          <Input
            label="Cycle Filter"
            value={cycleFilter}
            onChange={(event) => setCycleFilter(event.target.value)}
            placeholder="All cycles"
            disabled={loading || refreshing}
          />
          <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-3">
            <p className="caption">Assignments</p>
            <p className="title-sm mt-1">{assignments.length}</p>
          </div>
          <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-3">
            <p className="caption">Pending</p>
            <p className="title-sm mt-1">{pendingAssignments.length}</p>
          </div>
        </div>
      </Card>

      <Card>
        <Stack gap="3">
          {assignments.length === 0 ? (
            <p className="caption">No matrix assignments found for your reviewer profile.</p>
          ) : (
            assignments.map((assignment) => {
              const existing = feedbackByAssignment.get(String(assignment.id || "").trim());
              const form = formByAssignment[assignment.id] || {
                feedbackText: "",
                suggestedRating: "",
                confidence: "medium" as const,
              };

              return (
                <div key={assignment.id} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="body-sm font-medium text-[var(--color-text)]">
                      Employee: {assignment.employeeId}
                    </p>
                    <div className="flex gap-2">
                      <Badge variant={assignment.status === "active" ? "success" : "warning"}>
                        {assignment.status}
                      </Badge>
                      <Badge variant="info">Weight {assignment.influenceWeight}%</Badge>
                    </div>
                  </div>

                  <p className="caption mt-1">Cycle: {assignment.cycleId}</p>
                  {assignment.goalId && <p className="caption">Goal: {assignment.goalId}</p>}
                  <p className="caption">Assigned: {formatDate(assignment.assignedAt)}</p>

                  {existing ? (
                    <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="body-sm font-medium text-[var(--color-text)]">Feedback submitted</p>
                        <div className="flex gap-2">
                          {typeof existing.suggestedRating === "number" && (
                            <Badge variant="info">Rating {existing.suggestedRating}/5</Badge>
                          )}
                          <Badge variant={confidenceVariant(String(existing.confidence || "medium"))}>
                            Confidence {String(existing.confidence || "medium")}
                          </Badge>
                        </div>
                      </div>
                      <p className="body-sm mt-2 whitespace-pre-wrap text-[var(--color-text)]">{existing.feedbackText}</p>
                      <p className="caption mt-2">Submitted: {formatDate(existing.createdAt)}</p>
                    </div>
                  ) : (
                    <form className="mt-3 space-y-3" onSubmit={(event) => handleSubmit(event, assignment)}>
                      <Textarea
                        label="Reviewer feedback"
                        value={form.feedbackText}
                        onChange={(event) =>
                          setFormByAssignment((prev) => ({
                            ...prev,
                            [assignment.id]: {
                              ...form,
                              feedbackText: event.target.value,
                            },
                          }))
                        }
                        placeholder="Share specific strengths, risks, and behavior-based examples"
                        rows={4}
                        required
                      />

                      <div className="grid gap-3 md:grid-cols-2">
                        <Select
                          label="Suggested rating (optional)"
                          value={form.suggestedRating}
                          onChange={(event) =>
                            setFormByAssignment((prev) => ({
                              ...prev,
                              [assignment.id]: {
                                ...form,
                                suggestedRating: event.target.value,
                              },
                            }))
                          }
                          options={[
                            { value: "", label: "No rating suggestion" },
                            { value: "1", label: "1 - Needs Improvement" },
                            { value: "2", label: "2 - Partially Meets" },
                            { value: "3", label: "3 - Meets" },
                            { value: "4", label: "4 - Exceeds" },
                            { value: "5", label: "5 - Exceptional" },
                          ]}
                        />

                        <Select
                          label="Confidence"
                          value={form.confidence}
                          onChange={(event) =>
                            setFormByAssignment((prev) => ({
                              ...prev,
                              [assignment.id]: {
                                ...form,
                                confidence: event.target.value as "low" | "medium" | "high",
                              },
                            }))
                          }
                          options={[
                            { value: "low", label: "Low" },
                            { value: "medium", label: "Medium" },
                            { value: "high", label: "High" },
                          ]}
                        />
                      </div>

                      <Button type="submit" disabled={Boolean(submittingByAssignment[assignment.id])}>
                        {submittingByAssignment[assignment.id] ? "Submitting..." : "Submit feedback"}
                      </Button>
                    </form>
                  )}
                </div>
              );
            })
          )}
        </Stack>
      </Card>
    </Stack>
  );
}

"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Card, Input, Select, Textarea } from "@/src/components/ui";
import {
  createMatrixAssignment,
  fetchCurrentUserContext,
  fetchMatrixAssignments,
  fetchMatrixFeedback,
  fetchMatrixSummary,
  fetchTeamMembers,
  formatDate,
  MatrixAssignmentItem,
  MatrixFeedbackItem,
  MatrixSummaryItem,
  TeamMemberItem,
} from "@/app/employee/_lib/pmsClient";

type ReviewerOption = {
  id: string;
  label: string;
  role: string;
};

function confidenceVariant(level: string) {
  if (level === "high") return "success" as const;
  if (level === "low") return "warning" as const;
  return "info" as const;
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function buildDisplayName(user: { name?: string; email?: string; role?: string }) {
  const name = String(user.name || "").trim();
  const email = String(user.email || "").trim();
  const role = String(user.role || "").trim();

  if (name && email) return `${name} (${email})${role ? ` - ${role}` : ""}`;
  if (name) return `${name}${role ? ` - ${role}` : ""}`;
  if (email) return `${email}${role ? ` - ${role}` : ""}`;
  return "Unknown user";
}

export default function ManagerMatrixReviewsPage() {
  const [teamMembers, setTeamMembers] = useState<TeamMemberItem[]>([]);
  const [currentManager, setCurrentManager] = useState<ReviewerOption | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [cycleFilter, setCycleFilter] = useState("");

  const [assignments, setAssignments] = useState<MatrixAssignmentItem[]>([]);
  const [feedbackRows, setFeedbackRows] = useState<MatrixFeedbackItem[]>([]);
  const [summary, setSummary] = useState<MatrixSummaryItem | null>(null);

  const [employeeId, setEmployeeId] = useState("");
  const [reviewerId, setReviewerId] = useState("");
  const [cycleId, setCycleId] = useState("");
  const [influenceWeight, setInfluenceWeight] = useState("20");
  const [goalId, setGoalId] = useState("");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedEmployee = useMemo(
    () => teamMembers.find((member) => member.$id === selectedEmployeeId) || null,
    [teamMembers, selectedEmployeeId]
  );

  const reviewerOptions = useMemo(() => {
    const options: ReviewerOption[] = teamMembers.map((member) => ({
      id: member.$id,
      label: buildDisplayName({
        name: member.name,
        email: member.email,
        role: member.role,
      }),
      role: String(member.role || "employee"),
    }));

    if (currentManager?.id && !options.some((item) => item.id === currentManager.id)) {
      options.unshift(currentManager);
    }

    return options;
  }, [teamMembers, currentManager]);

  const memberNameById = useMemo(() => {
    const pairs = teamMembers.map(
      (member): [string, string] => [member.$id, member.name || member.email || member.$id]
    );
    const map = new Map<string, string>(pairs);
    if (currentManager?.id) {
      map.set(currentManager.id, currentManager.label);
    }
    return map;
  }, [teamMembers, currentManager]);

  const loadReferences = useCallback(async () => {
    const [members, userContext] = await Promise.all([
      fetchTeamMembers(),
      fetchCurrentUserContext(),
    ]);

    setTeamMembers(members);

    const managerId = String(userContext?.user?.$id || userContext?.profile?.$id || "").trim();
    if (managerId) {
      setCurrentManager({
        id: managerId,
        label: buildDisplayName({
          name: userContext?.profile?.name || userContext?.user?.name,
          email: userContext?.profile?.email || userContext?.user?.email,
          role: userContext?.profile?.role || "manager",
        }),
        role: String(userContext?.profile?.role || "manager"),
      });
    }

    if (members.length > 0) {
      setSelectedEmployeeId((prev) => (prev && members.some((item) => item.$id === prev) ? prev : members[0].$id));
      setEmployeeId((prev) => (prev && members.some((item) => item.$id === prev) ? prev : members[0].$id));
    } else {
      setSelectedEmployeeId("");
      setEmployeeId("");
    }
  }, []);

  const loadMatrixData = useCallback(async () => {
    if (!selectedEmployeeId) {
      setAssignments([]);
      setFeedbackRows([]);
      setSummary(null);
      return;
    }

    const [assignmentData, feedbackData, summaryData] = await Promise.all([
      fetchMatrixAssignments({
        employeeId: selectedEmployeeId,
        cycleId: cycleFilter.trim() || undefined,
      }),
      fetchMatrixFeedback({
        employeeId: selectedEmployeeId,
        cycleId: cycleFilter.trim() || undefined,
      }),
      fetchMatrixSummary({
        employeeId: selectedEmployeeId,
        cycleId: cycleFilter.trim() || undefined,
      }),
    ]);

    setAssignments(assignmentData);
    setFeedbackRows(feedbackData);
    setSummary(summaryData);
  }, [selectedEmployeeId, cycleFilter]);

  const refreshData = useCallback(async () => {
    setRefreshing(true);
    setError("");

    try {
      await loadMatrixData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load matrix review data.");
    } finally {
      setRefreshing(false);
    }
  }, [loadMatrixData]);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      setLoading(true);
      setError("");

      try {
        await loadReferences();
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Unable to load manager matrix review workspace.");
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
  }, [loadReferences]);

  useEffect(() => {
    if (!selectedEmployeeId) return;
    refreshData();
  }, [selectedEmployeeId, cycleFilter, refreshData]);

  async function handleCreateAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    const normalizedEmployeeId = employeeId.trim();
    const normalizedReviewerId = reviewerId.trim();
    const normalizedCycleId = cycleId.trim();
    const normalizedGoalId = goalId.trim();
    const normalizedNotes = notes.trim();
    const numericWeight = Number.parseInt(String(influenceWeight).trim(), 10);

    if (!normalizedEmployeeId || !normalizedReviewerId || !normalizedCycleId) {
      setError("Employee, reviewer, and cycle are required.");
      setSaving(false);
      return;
    }

    if (Number.isNaN(numericWeight) || numericWeight < 1 || numericWeight > 100) {
      setError("Influence weight must be between 1 and 100.");
      setSaving(false);
      return;
    }

    try {
      await createMatrixAssignment({
        employeeId: normalizedEmployeeId,
        reviewerId: normalizedReviewerId,
        cycleId: normalizedCycleId,
        influenceWeight: numericWeight,
        goalId: normalizedGoalId || undefined,
        notes: normalizedNotes || undefined,
      });

      setSuccess("Matrix reviewer assignment created.");

      setSelectedEmployeeId(normalizedEmployeeId);
      setCycleFilter(normalizedCycleId);
      setReviewerId("");
      setGoalId("");
      setNotes("");
      setInfluenceWeight("20");

      await refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create matrix assignment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack gap="6">
      <PageHeader
        title="Matrix Assignments"
        subtitle="Assign matrix reviewers for team members and track in-app reviewer feedback for calibration."
        actions={
          <Button type="button" variant="secondary" onClick={refreshData} disabled={loading || refreshing}>
            {refreshing ? "Refreshing..." : "Refresh"}
          </Button>
        }
      />

      {error && <Alert variant="error" title="Action required" description={error} />}
      {success && <Alert variant="success" title="Saved" description={success} />}

      <Card>
        <form className="space-y-4" onSubmit={handleCreateAssignment}>
          <div>
            <h2 className="title-sm">Create Matrix Assignment</h2>
            <p className="caption mt-1">Reviewer can be a team member or you as the manager.</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <Select
              label="Employee"
              value={employeeId}
              onChange={(event) => {
                setEmployeeId(event.target.value);
                setSelectedEmployeeId(event.target.value);
              }}
              disabled={loading || saving}
              options={teamMembers.map((member) => ({
                value: member.$id,
                label: `${member.name || member.email || member.$id} (${member.email || "no email"})`,
              }))}
              placeholder="Select employee"
              required
            />

            <Select
              label="Reviewer"
              value={reviewerId}
              onChange={(event) => setReviewerId(event.target.value)}
              disabled={loading || saving || reviewerOptions.length === 0}
              options={reviewerOptions
                .filter((option) => option.id !== employeeId)
                .map((option) => ({ value: option.id, label: option.label }))}
              placeholder="Select reviewer"
              helperText="Reviewer cannot be the same as employee."
              required
            />

            <Input
              label="Cycle ID"
              value={cycleId}
              onChange={(event) => setCycleId(event.target.value)}
              placeholder="e.g. 2026-Q2"
              disabled={loading || saving}
              required
            />

            <Input
              label="Influence Weight (%)"
              value={influenceWeight}
              onChange={(event) => setInfluenceWeight(event.target.value)}
              inputMode="numeric"
              placeholder="1-100"
              disabled={loading || saving}
              required
            />

            <Input
              label="Goal ID (optional)"
              value={goalId}
              onChange={(event) => setGoalId(event.target.value)}
              placeholder="Goal reference"
              disabled={loading || saving}
            />
          </div>

          <Textarea
            label="Assignment Notes (optional)"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Context to help reviewer focus on the right signals"
            rows={3}
            disabled={loading || saving}
          />

          <Button type="submit" disabled={loading || saving || teamMembers.length === 0}>
            {saving ? "Saving..." : "Create Assignment"}
          </Button>
        </form>
      </Card>

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="title-sm">Feedback Coverage</h2>
            <p className="caption mt-1">
              {selectedEmployee
                ? `Showing assignments and feedback for ${selectedEmployee.name || selectedEmployee.email || selectedEmployee.$id}.`
                : "Select an employee to review matrix coverage."}
            </p>
          </div>

          <div className="w-full md:max-w-xs">
            <Input
              label="Filter by cycle"
              value={cycleFilter}
              onChange={(event) => setCycleFilter(event.target.value)}
              placeholder="All cycles"
              disabled={loading || refreshing}
            />
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-3">
            <p className="caption">Assignments</p>
            <p className="title-sm mt-1">{assignments.length}</p>
          </div>
          <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-3">
            <p className="caption">Responses</p>
            <p className="title-sm mt-1">{summary?.responseCount || 0}</p>
          </div>
          <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-3">
            <p className="caption">Pending Reviewers</p>
            <p className="title-sm mt-1">{summary?.pendingCount || 0}</p>
          </div>
          <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-3">
            <p className="caption">Weighted Rating</p>
            <p className="title-sm mt-1">
              {summary?.weightedRating === null || summary?.weightedRating === undefined
                ? "n/a"
                : `${summary.weightedRating} / 5`}
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <h3 className="body-sm font-semibold text-[var(--color-text)]">Assignments</h3>
          {assignments.length === 0 ? (
            <p className="caption">No assignments found for selected filters.</p>
          ) : (
            assignments.map((row) => (
              <div key={row.id} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="body-sm font-medium text-[var(--color-text)]">
                    Reviewer: {memberNameById.get(row.reviewerId) || row.reviewerId}
                  </p>
                  <div className="flex items-center gap-2">
                    <Badge variant={row.status === "active" ? "success" : "warning"}>{row.status}</Badge>
                    <Badge variant="info">Weight {formatPercent(row.influenceWeight)}</Badge>
                  </div>
                </div>
                <p className="caption mt-1">Cycle: {row.cycleId}</p>
                {row.goalId && <p className="caption">Goal: {row.goalId}</p>}
                {row.notes && <p className="caption mt-2">Notes: {row.notes}</p>}
                <p className="caption mt-2">Assigned: {formatDate(row.assignedAt)}</p>
              </div>
            ))
          )}
        </div>

        <div className="mt-5 space-y-3">
          <h3 className="body-sm font-semibold text-[var(--color-text)]">Collected Reviewer Feedback</h3>
          {feedbackRows.length === 0 ? (
            <p className="caption">No reviewer feedback submitted yet for selected filters.</p>
          ) : (
            feedbackRows.map((row) => (
              <div
                key={row.id}
                className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="body-sm font-medium text-[var(--color-text)]">
                    {memberNameById.get(row.reviewerId) || row.reviewerId}
                  </p>
                  <div className="flex items-center gap-2">
                    {typeof row.suggestedRating === "number" && (
                      <Badge variant="info">Rating {row.suggestedRating}/5</Badge>
                    )}
                    <Badge variant={confidenceVariant(String(row.confidence || "medium"))}>
                      Confidence {String(row.confidence || "medium")}
                    </Badge>
                  </div>
                </div>
                <p className="caption mt-1">Cycle: {row.cycleId}</p>
                {row.goalId && <p className="caption">Goal: {row.goalId}</p>}
                <p className="body-sm mt-2 whitespace-pre-wrap text-[var(--color-text)]">{row.feedbackText}</p>
                <p className="caption mt-2">Submitted: {formatDate(row.createdAt)}</p>
              </div>
            ))
          )}
        </div>
      </Card>
    </Stack>
  );
}

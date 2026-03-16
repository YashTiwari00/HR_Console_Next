"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Card, Input, Textarea } from "@/src/components/ui";
import {
  CheckInApprovalDecision,
  fetchHrCheckInApprovals,
  formatDate,
  HrCheckInApprovalItem,
  requestJson,
  submitHrCheckInApproval,
} from "@/app/employee/_lib/pmsClient";

type ApprovalDecision = "approved" | "rejected" | "needs_changes";

interface GoalForApproval {
  $id: string;
  title: string;
  description: string;
  employeeId: string;
  managerId: string;
  cycleId: string;
  status: string;
  weightage: number;
  progressPercent: number;
  processPercent?: number;
}

function decisionBadge(decision: ApprovalDecision | CheckInApprovalDecision) {
  if (decision === "approved") return "success" as const;
  if (decision === "needs_changes") return "warning" as const;
  return "danger" as const;
}

export default function HrApprovalsPage() {
  const [goalRows, setGoalRows] = useState<GoalForApproval[]>([]);
  const [checkInRows, setCheckInRows] = useState<HrCheckInApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [goalDecision, setGoalDecision] = useState<Record<string, ApprovalDecision>>({});
  const [goalComments, setGoalComments] = useState<Record<string, string>>({});
  const [managerApprovalQuery, setManagerApprovalQuery] = useState("");

  const [checkInDecision, setCheckInDecision] = useState<Record<string, CheckInApprovalDecision>>({});
  const [checkInComments, setCheckInComments] = useState<Record<string, string>>({});
  const [employeeApprovalQuery, setEmployeeApprovalQuery] = useState("");

  const normalizedManagerApprovalQuery = managerApprovalQuery.trim().toLowerCase();
  const normalizedEmployeeApprovalQuery = employeeApprovalQuery.trim().toLowerCase();

  const filteredGoalRows = useMemo(() => {
    if (!normalizedManagerApprovalQuery) return goalRows;

    return goalRows.filter((goal) => {
      const searchableText = [
        goal.title,
        goal.description,
        goal.employeeId,
        goal.managerId,
        goal.cycleId,
        goal.status,
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedManagerApprovalQuery);
    });
  }, [goalRows, normalizedManagerApprovalQuery]);

  const filteredCheckInRows = useMemo(() => {
    if (!normalizedEmployeeApprovalQuery) return checkInRows;

    return checkInRows.filter((row) => {
      const searchableText = [
        row.goalTitle,
        row.managerName,
        row.employeeName,
        row.managerNotes,
        row.transcriptText,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedEmployeeApprovalQuery);
    });
  }, [checkInRows, normalizedEmployeeApprovalQuery]);

  const queueCounts = useMemo(
    () => ({
      goal: goalRows.length,
      checkIn: checkInRows.length,
    }),
    [goalRows.length, checkInRows.length]
  );

  const loadQueues = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [goalPayload, nextCheckIns] = await Promise.all([
        requestJson("/api/approvals?origin=manager"),
        fetchHrCheckInApprovals("pending"),
      ]);

      const goals = (goalPayload.data || []) as GoalForApproval[];
      setGoalRows(goals);
      setCheckInRows(nextCheckIns);

      const nextGoalDecision: Record<string, ApprovalDecision> = {};
      goals.forEach((goal) => {
        nextGoalDecision[goal.$id] = "approved";
      });
      setGoalDecision(nextGoalDecision);

      const nextCheckInDecision: Record<string, CheckInApprovalDecision> = {};
      nextCheckIns.forEach((checkIn) => {
        nextCheckInDecision[checkIn.checkInId] = "approved";
      });
      setCheckInDecision(nextCheckInDecision);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load approval queues.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQueues();
  }, [loadQueues]);

  async function handleGoalDecision(event: FormEvent, goalId: string) {
    event.preventDefault();
    setWorking(true);
    setError("");
    setSuccess("");

    try {
      const selected = goalDecision[goalId] || "approved";
      const note = goalComments[goalId] || "";

      await requestJson("/api/approvals", {
        method: "POST",
        body: JSON.stringify({
          goalId,
          decision: selected,
          comments: note,
        }),
      });

      setSuccess(`Goal decision saved: ${selected}.`);
      await loadQueues();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save goal decision.");
    } finally {
      setWorking(false);
    }
  }

  async function handleCheckInDecision(event: FormEvent, checkInId: string) {
    event.preventDefault();
    setWorking(true);
    setError("");
    setSuccess("");

    try {
      const selected = checkInDecision[checkInId] || "approved";
      const note = checkInComments[checkInId] || "";

      await submitHrCheckInApproval({
        checkInId,
        decision: selected,
        comments: note,
      });

      setSuccess(`Check-in decision saved: ${selected}.`);
      await loadQueues();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save check-in decision.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <Stack gap="4">
      <PageHeader
        title="HR Approval Queue"
        subtitle="Review manager goal submissions and manager-completed check-ins."
        actions={
          <Button variant="secondary" onClick={loadQueues} disabled={loading || working}>
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="error" title="Action failed" description={error} onDismiss={() => setError("")} />}
      {success && (
        <Alert variant="success" title="Saved" description={success} onDismiss={() => setSuccess("")} />
      )}

      <Card title="Queue Snapshot" description="Pending items that require HR action.">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="info">Manager Goals: {loading ? "..." : queueCounts.goal}</Badge>
          <Badge variant="warning">Manager Check-ins: {loading ? "..." : queueCounts.checkIn}</Badge>
        </div>
      </Card>

      <Card title="Manager Goal Approvals" description="Only manager-submitted goals are shown here.">
        <Stack gap="3">
          <Input
            label="Search manager approvals"
            value={managerApprovalQuery}
            onChange={(event) => setManagerApprovalQuery(event.target.value)}
            placeholder="Search by goal, manager, cycle, or status"
          />

          {loading && <p className="caption">Loading manager goals...</p>}

          {!loading && filteredGoalRows.length === 0 && (
            <p className="caption">
              {normalizedManagerApprovalQuery
                ? "No manager approvals match your search."
                : "No manager-submitted goals waiting for approval."}
            </p>
          )}

          <div className="max-h-[420px] overflow-y-auto pr-1">
            <Stack gap="3">
              {filteredGoalRows.map((goal) => {
                const selected = goalDecision[goal.$id] || "approved";

                return (
                  <form
                    key={goal.$id}
                    onSubmit={(event) => handleGoalDecision(event, goal.$id)}
                    className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-3 shadow-[var(--shadow-sm)]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="body font-medium text-[var(--color-text)]">{goal.title}</p>
                        <p className="caption mt-1">{goal.description}</p>
                      </div>
                      <Badge variant="info">{goal.status}</Badge>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-2">
                      <span className="caption">Manager: {goal.employeeId}</span>
                      <span className="caption">Cycle: {goal.cycleId}</span>
                      <span className="caption">Weightage: {goal.weightage}%</span>
                      <span className="caption">
                        Progress: {goal.progressPercent ?? goal.processPercent ?? 0}%
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant={selected === "approved" ? "primary" : "secondary"}
                        size="sm"
                        onClick={() =>
                          setGoalDecision((prev) => ({
                            ...prev,
                            [goal.$id]: "approved",
                          }))
                        }
                      >
                        Approve
                      </Button>
                      <Button
                        type="button"
                        variant={selected === "needs_changes" ? "primary" : "secondary"}
                        size="sm"
                        onClick={() =>
                          setGoalDecision((prev) => ({
                            ...prev,
                            [goal.$id]: "needs_changes",
                          }))
                        }
                      >
                        Needs Changes
                      </Button>
                      <Button
                        type="button"
                        variant={selected === "rejected" ? "danger" : "secondary"}
                        size="sm"
                        onClick={() =>
                          setGoalDecision((prev) => ({
                            ...prev,
                            [goal.$id]: "rejected",
                          }))
                        }
                      >
                        Reject
                      </Button>
                      <Badge variant={decisionBadge(selected)}>{selected}</Badge>
                    </div>

                    <div className="mt-3">
                      <Textarea
                        label="HR Comments"
                        value={goalComments[goal.$id] || ""}
                        onChange={(event) =>
                          setGoalComments((prev) => ({
                            ...prev,
                            [goal.$id]: event.target.value,
                          }))
                        }
                        placeholder="Add guidance for the manager"
                      />
                    </div>

                    <div className="mt-3">
                      <Button type="submit" loading={working}>
                        Save Decision
                      </Button>
                    </div>
                  </form>
                );
              })}
            </Stack>
          </div>
        </Stack>
      </Card>

      <Card
        title="Manager Check-in Closure Approvals"
        description="Review completed check-ins submitted by managers before final governance sign-off."
      >
        <Stack gap="3">
          <Input
            label="Search employee approvals"
            value={employeeApprovalQuery}
            onChange={(event) => setEmployeeApprovalQuery(event.target.value)}
            placeholder="Search by employee, manager, goal, or notes"
          />

          {loading && <p className="caption">Loading manager check-ins...</p>}

          {!loading && filteredCheckInRows.length === 0 && (
            <p className="caption">
              {normalizedEmployeeApprovalQuery
                ? "No employee approvals match your search."
                : "No manager-completed check-ins waiting for approval."}
            </p>
          )}

          <div className="max-h-[420px] overflow-y-auto pr-1">
            <Stack gap="3">
              {filteredCheckInRows.map((row) => {
                const selected = checkInDecision[row.checkInId] || "approved";

                return (
                  <form
                    key={row.checkInId}
                    onSubmit={(event) => handleCheckInDecision(event, row.checkInId)}
                    className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-3 shadow-[var(--shadow-sm)]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="body-sm text-[var(--color-text)]">{row.goalTitle}</p>
                      <Badge variant="warning">pending</Badge>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-2">
                      <span className="caption">Manager: {row.managerName}</span>
                      <span className="caption">Employee: {row.employeeName}</span>
                      <span className="caption">Scheduled: {formatDate(row.scheduledAt)}</span>
                      {row.completedAt && <span className="caption">Completed: {formatDate(row.completedAt)}</span>}
                    </div>

                    {row.managerNotes && <p className="caption mt-2">Manager notes: {row.managerNotes}</p>}
                    {row.transcriptText && <p className="caption mt-1">Summary: {row.transcriptText}</p>}

                    {row.isFinalCheckIn && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge variant="info">Final check-in</Badge>
                        {typeof row.managerRating === "number" && (
                          <span className="caption">Manager rating: {row.managerRating}/5</span>
                        )}
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant={selected === "approved" ? "primary" : "secondary"}
                        size="sm"
                        onClick={() =>
                          setCheckInDecision((prev) => ({
                            ...prev,
                            [row.checkInId]: "approved",
                          }))
                        }
                      >
                        Approve
                      </Button>
                      <Button
                        type="button"
                        variant={selected === "needs_changes" ? "primary" : "secondary"}
                        size="sm"
                        onClick={() =>
                          setCheckInDecision((prev) => ({
                            ...prev,
                            [row.checkInId]: "needs_changes",
                          }))
                        }
                      >
                        Needs Changes
                      </Button>
                      <Button
                        type="button"
                        variant={selected === "rejected" ? "danger" : "secondary"}
                        size="sm"
                        onClick={() =>
                          setCheckInDecision((prev) => ({
                            ...prev,
                            [row.checkInId]: "rejected",
                          }))
                        }
                      >
                        Reject
                      </Button>
                      <Badge variant={decisionBadge(selected)}>{selected}</Badge>
                    </div>

                    <div className="mt-3">
                      <Textarea
                        label="HR Comments"
                        value={checkInComments[row.checkInId] || ""}
                        onChange={(event) =>
                          setCheckInComments((prev) => ({
                            ...prev,
                            [row.checkInId]: event.target.value,
                          }))
                        }
                        placeholder="Add governance notes for this check-in closure"
                      />
                    </div>

                    <div className="mt-3">
                      <Button type="submit" loading={working}>
                        Save Decision
                      </Button>
                    </div>
                  </form>
                );
              })}
            </Stack>
          </div>
        </Stack>
      </Card>
    </Stack>
  );
}

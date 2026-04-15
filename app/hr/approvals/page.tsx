"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Card, Input } from "@/src/components/ui";
import { buildCsv, dateStamp, downloadCsvFile } from "@/src/lib/csvExport";
import {
  fetchHrCheckInApprovals,
  formatDate,
  HrCheckInApprovalItem,
  requestJson,
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

function decisionBadge(decision: ApprovalDecision) {
  if (decision === "approved") return "success" as const;
  if (decision === "needs_changes") return "warning" as const;
  return "danger" as const;
}

export default function HrApprovalsPage() {
  const [goalRows, setGoalRows] = useState<GoalForApproval[]>([]);
  const [checkInRows, setCheckInRows] = useState<HrCheckInApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [managerApprovalQuery, setManagerApprovalQuery] = useState("");
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
        fetchHrCheckInApprovals("all"),
      ]);

      setGoalRows((goalPayload.data || []) as GoalForApproval[]);
      setCheckInRows(nextCheckIns);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load supervision queues.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQueues();
  }, [loadQueues]);

  function handleExportGoalQueueCsv() {
    const csv = buildCsv(goalRows, [
      { key: "id", header: "Goal ID", value: (row) => row.$id },
      { key: "title", header: "Title", value: (row) => row.title },
      { key: "description", header: "Description", value: (row) => row.description },
      { key: "employeeId", header: "Employee ID", value: (row) => row.employeeId },
      { key: "managerId", header: "Manager ID", value: (row) => row.managerId },
      { key: "cycleId", header: "Cycle", value: (row) => row.cycleId },
      { key: "status", header: "Status", value: (row) => row.status },
      { key: "weightage", header: "Weightage", value: (row) => row.weightage },
      {
        key: "progress",
        header: "Progress Percent",
        value: (row) => row.progressPercent ?? row.processPercent ?? 0,
      },
    ]);
    downloadCsvFile(csv, `hr-manager-goal-queue-${dateStamp()}.csv`);
  }

  function handleExportCheckInQueueCsv() {
    const csv = buildCsv(checkInRows, [
      { key: "checkInId", header: "Check-in ID", value: (row) => row.checkInId },
      { key: "goalId", header: "Goal ID", value: (row) => row.goalId },
      { key: "goalTitle", header: "Goal Title", value: (row) => row.goalTitle },
      { key: "managerId", header: "Manager ID", value: (row) => row.managerId },
      { key: "managerName", header: "Manager Name", value: (row) => row.managerName },
      { key: "employeeId", header: "Employee ID", value: (row) => row.employeeId },
      { key: "employeeName", header: "Employee Name", value: (row) => row.employeeName },
      { key: "scheduledAt", header: "Scheduled At", value: (row) => row.scheduledAt },
      { key: "completedAt", header: "Completed At", value: (row) => row.completedAt || "" },
      { key: "reviewStatus", header: "Review Status", value: (row) => row.reviewStatus },
      { key: "managerRating", header: "Manager Rating", value: (row) => row.managerRating ?? "" },
      { key: "isFinalCheckIn", header: "Is Final Check-in", value: (row) => row.isFinalCheckIn ? "yes" : "no" },
      { key: "managerCycleId", header: "Manager Cycle", value: (row) => row.managerCycleId || "" },
      { key: "managerNotes", header: "Manager Notes", value: (row) => row.managerNotes || "" },
      { key: "transcriptText", header: "Transcript Summary", value: (row) => row.transcriptText || "" },
      {
        key: "latestReviewDecision",
        header: "Latest HR Decision",
        value: (row) => row.latestReview?.decision || "",
      },
      {
        key: "latestReviewAt",
        header: "Latest HR Decision At",
        value: (row) => row.latestReview?.decidedAt || "",
      },
    ]);
    downloadCsvFile(csv, `hr-manager-checkin-queue-${dateStamp()}.csv`);
  }

  return (
    <Stack gap="4">
      <PageHeader
        title="HR Supervision Queue"
        subtitle="Read-only visibility into manager goals and check-ins for supervision."
        actions={
          <Button variant="secondary" onClick={loadQueues} disabled={loading}>
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="error" title="Unable to load" description={error} onDismiss={() => setError("")} />}

      <Card title="Queue Snapshot" description="Pending and reviewed items visible for HR monitoring.">
        <Stack gap="3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="info">Manager Goals: {loading ? "..." : queueCounts.goal}</Badge>
            <Badge variant="warning">Manager Check-ins: {loading ? "..." : queueCounts.checkIn}</Badge>
          </div>
          <Alert
            variant="info"
            title="Supervision only"
            description="HR can review queue data and progress context but cannot approve or reject items."
          />
        </Stack>
      </Card>

      <Card title="Manager Goal Queue" description="Manager-submitted goals shown for monitoring.">
        <Stack gap="3">
          <div className="flex justify-end">
            <Button variant="secondary" size="sm" onClick={handleExportGoalQueueCsv} disabled={loading || goalRows.length === 0}>
              Download CSV: Goal Queue
            </Button>
          </div>
          <Input
            label="Search manager goals"
            value={managerApprovalQuery}
            onChange={(event) => setManagerApprovalQuery(event.target.value)}
            placeholder="Search by goal, manager, cycle, or status"
          />

          {loading && <p className="caption">Loading manager goals...</p>}

          {!loading && filteredGoalRows.length === 0 && (
            <p className="caption">
              {normalizedManagerApprovalQuery
                ? "No manager goals match your search."
                : "No manager-submitted goals found."}
            </p>
          )}

          <div className="max-h-[420px] overflow-y-auto pr-1">
            <Stack gap="3">
              {filteredGoalRows.map((goal) => (
                <div
                  key={goal.$id}
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
                </div>
              ))}
            </Stack>
          </div>
        </Stack>
      </Card>

      <Card
        title="Manager Check-in Queue"
        description="Completed check-ins and prior reviews visible for HR supervision."
      >
        <Stack gap="3">
          <div className="flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportCheckInQueueCsv}
              disabled={loading || checkInRows.length === 0}
            >
              Download CSV: Check-in Queue
            </Button>
          </div>
          <Input
            label="Search manager check-ins"
            value={employeeApprovalQuery}
            onChange={(event) => setEmployeeApprovalQuery(event.target.value)}
            placeholder="Search by employee, manager, goal, or notes"
          />

          {loading && <p className="caption">Loading manager check-ins...</p>}

          {!loading && filteredCheckInRows.length === 0 && (
            <p className="caption">
              {normalizedEmployeeApprovalQuery
                ? "No manager check-ins match your search."
                : "No manager-completed check-ins found."}
            </p>
          )}

          <div className="max-h-[420px] overflow-y-auto pr-1">
            <Stack gap="3">
              {filteredCheckInRows.map((row) => {
                const reviewDecision = row.latestReview?.decision as ApprovalDecision | undefined;

                return (
                  <div
                    key={row.checkInId}
                    className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-3 shadow-[var(--shadow-sm)]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="body-sm text-[var(--color-text)]">{row.goalTitle}</p>
                      <Badge variant={row.reviewStatus === "pending" ? "warning" : "success"}>{row.reviewStatus}</Badge>
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
                        {row.managerCycleId && <span className="caption">Cycle: {row.managerCycleId}</span>}
                      </div>
                    )}

                    {row.hrManagerRating && (
                      <p className="caption mt-2">
                        Prior HR manager grade: {row.hrManagerRating.ratingLabel} ({row.hrManagerRating.rating}/5)
                      </p>
                    )}

                    {reviewDecision && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="caption">Latest review:</span>
                        <Badge variant={decisionBadge(reviewDecision)}>{reviewDecision}</Badge>
                        {row.latestReview?.decidedAt && (
                          <span className="caption">on {formatDate(row.latestReview.decidedAt)}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </Stack>
          </div>
        </Stack>
      </Card>
    </Stack>
  );
}

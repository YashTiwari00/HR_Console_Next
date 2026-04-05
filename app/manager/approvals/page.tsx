"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Card, Checkbox, Input, Textarea } from "@/src/components/ui";
import { account } from "@/lib/appwrite";

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

export default function ManagerPage() {
  const [rows, setRows] = useState<GoalForApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [decision, setDecision] = useState<Record<string, ApprovalDecision>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [employeeApprovalQuery, setEmployeeApprovalQuery] = useState("");
  const [selectedGoalIds, setSelectedGoalIds] = useState<Set<string>>(new Set());
  const [lastFailedGoalIds, setLastFailedGoalIds] = useState<string[]>([]);

  const normalizedEmployeeApprovalQuery = employeeApprovalQuery.trim().toLowerCase();

  const filteredRows = useMemo(() => {
    if (!normalizedEmployeeApprovalQuery) return rows;

    return rows.filter((goal) => {
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

      return searchableText.includes(normalizedEmployeeApprovalQuery);
    });
  }, [rows, normalizedEmployeeApprovalQuery]);

  async function requestJson(url: string, init?: RequestInit) {
    let jwtHeader: Record<string, string> = {};

    try {
      const jwt = await account.createJWT();
      if (jwt?.jwt) {
        jwtHeader = { "x-appwrite-jwt": jwt.jwt };
      }
    } catch {
      // API will return unauthorized if no session/JWT.
    }

    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...jwtHeader,
        ...(init?.headers || {}),
      },
    });

    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(payload?.error || "Request failed.");
    }

    return payload;
  }

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const payload = await requestJson("/api/approvals");
      const goals = (payload.data || []) as GoalForApproval[];
      setRows(goals);

      const nextDecision: Record<string, ApprovalDecision> = {};
      goals.forEach((goal) => {
        nextDecision[goal.$id] = "approved";
      });
      setDecision(nextDecision);
      setSelectedGoalIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load approvals.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  async function handleDecision(event: FormEvent, goalId: string) {
    event.preventDefault();
    setWorking(true);
    setError("");
    setSuccess("");

    try {
      const selected = decision[goalId] || "approved";
      const note = comments[goalId] || "";

      await requestJson("/api/approvals", {
        method: "POST",
        body: JSON.stringify({
          goalId,
          decision: selected,
          comments: note,
        }),
      });

      setSuccess(`Decision saved: ${selected}.`);
      await loadQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save decision.");
    } finally {
      setWorking(false);
    }
  }

  function toggleSelected(goalId: string, checked: boolean) {
    setSelectedGoalIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(goalId);
      } else {
        next.delete(goalId);
      }
      return next;
    });
  }

  function selectAllFiltered() {
    setSelectedGoalIds((prev) => {
      const next = new Set(prev);
      filteredRows.forEach((goal) => next.add(goal.$id));
      return next;
    });
  }

  function clearAllFiltered() {
    setSelectedGoalIds((prev) => {
      const next = new Set(prev);
      filteredRows.forEach((goal) => next.delete(goal.$id));
      return next;
    });
  }

  async function handleBulkDecision(goalIds: string[]) {
    if (goalIds.length === 0) {
      return;
    }

    setWorking(true);
    setError("");
    setSuccess("");

    try {
      const items = goalIds.map((goalId) => ({
        goalId,
        decision: decision[goalId] || "approved",
        comments: comments[goalId] || "",
      }));

      const payload = await requestJson("/api/approvals", {
        method: "POST",
        body: JSON.stringify({ items }),
      });

      const approved = Number(payload?.summary?.approved || 0);
      const failed = Number(payload?.summary?.failed || 0);
      const failedGoalIds = Array.isArray(payload?.summary?.failures)
        ? payload.summary.failures
            .map((item: { goalId?: string }) => String(item?.goalId || "").trim())
            .filter(Boolean)
        : [];

      setLastFailedGoalIds(failedGoalIds);
      setSuccess(`Saved ${approved} decisions. Failed: ${failed}.`);
      await loadQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save bulk decisions.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <Stack gap="4">
      <PageHeader
        title="Approval Queue"
        subtitle="Review submitted goals and provide clear decisions."
        actions={
          <Button variant="secondary" onClick={loadQueue} disabled={loading || working}>
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="error" title="Action failed" description={error} onDismiss={() => setError("")} />}
      {success && (
        <Alert variant="success" title="Saved" description={success} onDismiss={() => setSuccess("")} />
      )}

      <Card title="Pending Submitted Goals" description="Only submitted goals are shown here.">
        <Stack gap="3">
          <Input
            label="Search employee approvals"
            value={employeeApprovalQuery}
            onChange={(event) => setEmployeeApprovalQuery(event.target.value)}
            placeholder="Search by goal, employee, cycle, or status"
          />

          {loading && <p className="caption">Loading approval queue...</p>}

          {!loading && filteredRows.length === 0 && (
            <p className="caption">
              {normalizedEmployeeApprovalQuery
                ? "No employee approvals match your search."
                : "No submitted goals waiting for approval."}
            </p>
          )}

          {filteredRows.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
              <span className="caption">Filtered goals: {filteredRows.length}</span>
              <span className="caption">Selected: {selectedGoalIds.size}</span>
              <Button size="sm" variant="secondary" onClick={selectAllFiltered} disabled={working}>
                Select All Filtered
              </Button>
              <Button size="sm" variant="secondary" onClick={clearAllFiltered} disabled={working}>
                Clear Filtered
              </Button>
              <Button
                size="sm"
                onClick={() => handleBulkDecision(Array.from(selectedGoalIds.values()))}
                loading={working}
                disabled={selectedGoalIds.size === 0}
              >
                Save Selected Decisions
              </Button>
            </div>
          )}

          {lastFailedGoalIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-warning)] bg-[var(--color-surface)] px-3 py-2">
              <span className="caption">Last bulk action failed for {lastFailedGoalIds.length} goals.</span>
              <Button size="sm" variant="secondary" onClick={() => handleBulkDecision(lastFailedGoalIds)} loading={working}>
                Retry Failed
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setLastFailedGoalIds([])} disabled={working}>
                Dismiss
              </Button>
            </div>
          )}

          <div className="max-h-[420px] overflow-y-auto pr-1">
            <Stack gap="3">
              {filteredRows.map((goal) => {
                const selected = decision[goal.$id] || "approved";

                return (
                  <form
                    key={goal.$id}
                    onSubmit={(event) => handleDecision(event, goal.$id)}
                    className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-3 shadow-[var(--shadow-sm)]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <Checkbox
                          label=""
                          checked={selectedGoalIds.has(goal.$id)}
                          onChange={(event) => toggleSelected(goal.$id, event.target.checked)}
                        />
                        <div>
                          <p className="body font-medium text-[var(--color-text)]">{goal.title}</p>
                          <p className="caption mt-1">{goal.description}</p>
                        </div>
                      </div>
                      <div>
                        <Badge variant="info">{goal.status}</Badge>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-2">
                      <span className="caption">Employee: {goal.employeeId}</span>
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
                          setDecision((prev) => ({
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
                          setDecision((prev) => ({
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
                          setDecision((prev) => ({
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
                        label="Manager Comments"
                        value={comments[goal.$id] || ""}
                        onChange={(event) =>
                          setComments((prev) => ({
                            ...prev,
                            [goal.$id]: event.target.value,
                          }))
                        }
                        placeholder="Add guidance for the employee"
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

"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Card, Textarea } from "@/src/components/ui";
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

  return (
    <Stack gap="4">
      <PageHeader
        title="Manager Approval Queue"
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
          {loading && <p className="caption">Loading approval queue...</p>}

          {!loading && rows.length === 0 && (
            <p className="caption">No submitted goals waiting for approval.</p>
          )}

          {rows.map((goal) => {
            const selected = decision[goal.$id] || "approved";

            return (
              <form
                key={goal.$id}
                onSubmit={(event) => handleDecision(event, goal.$id)}
                className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="body font-medium text-[var(--color-text)]">{goal.title}</p>
                    <p className="caption mt-1">{goal.description}</p>
                  </div>
                  <Badge variant="info">{goal.status}</Badge>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-3">
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
      </Card>
    </Stack>
  );
}

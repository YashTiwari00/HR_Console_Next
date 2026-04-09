"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Card, Input, Textarea, VoiceTextarea } from "@/src/components/ui";
import { account } from "@/lib/appwrite";
import { formatDate } from "@/app/employee/_lib/pmsClient";

type ApprovalDecision = "approved" | "rejected" | "needs_changes";
type CheckInStatus = "planned" | "completed";

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

interface ManagerCheckIn {
  $id: string;
  goalId: string;
  employeeId: string;
  managerId: string;
  scheduledAt: string;
  status: CheckInStatus;
  employeeNotes?: string;
  managerNotes?: string;
  transcriptText?: string;
  isFinalCheckIn?: boolean;
  managerRating?: number;
  ratedAt?: string;
}

function decisionBadge(decision: ApprovalDecision) {
  if (decision === "approved") return "success" as const;
  if (decision === "needs_changes") return "warning" as const;
  return "danger" as const;
}

export default function TeamApprovalsPage() {
  const [approvalRows, setApprovalRows] = useState<GoalForApproval[]>([]);
  const [checkInRows, setCheckInRows] = useState<ManagerCheckIn[]>([]);
  const [loadingApprovals, setLoadingApprovals] = useState(true);
  const [loadingCheckIns, setLoadingCheckIns] = useState(true);
  const [workingApprovals, setWorkingApprovals] = useState(false);
  const [workingCheckIns, setWorkingCheckIns] = useState(false);
  const [aiWorking, setAiWorking] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [decision, setDecision] = useState<Record<string, ApprovalDecision>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [employeeApprovalQuery, setEmployeeApprovalQuery] = useState("");

  const [managerNotes, setManagerNotes] = useState<Record<string, string>>({});
  const [transcriptText, setTranscriptText] = useState<Record<string, string>>({});
  const [managerRatings, setManagerRatings] = useState<Record<string, string>>({});
  const [managerRatingLabels, setManagerRatingLabels] = useState<
    Record<string, "EE" | "DE" | "ME" | "SME" | "NI">
  >({});
  const [aiMeta, setAiMeta] = useState<
    Record<string, { source: string; confidence: string; remaining?: number }>
  >({});
  const [goalCycleById, setGoalCycleById] = useState<Record<string, string>>({});
  const [goalTitleById, setGoalTitleById] = useState<Record<string, string>>({});

  const normalizedEmployeeApprovalQuery = employeeApprovalQuery.trim().toLowerCase();

  const filteredApprovalRows = useMemo(() => {
    if (!normalizedEmployeeApprovalQuery) return approvalRows;

    return approvalRows.filter((goal) => {
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
  }, [approvalRows, normalizedEmployeeApprovalQuery]);

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

  const loadApprovals = useCallback(async () => {
    setLoadingApprovals(true);

    try {
      const payload = await requestJson("/api/approvals");
      const goals = (payload.data || []) as GoalForApproval[];
      setApprovalRows(goals);

      setDecision((prev) => {
        const nextDecision: Record<string, ApprovalDecision> = {};
        goals.forEach((goal) => {
          nextDecision[goal.$id] = prev[goal.$id] || "approved";
        });
        return nextDecision;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load approvals.");
    } finally {
      setLoadingApprovals(false);
    }
  }, []);

  const loadCheckIns = useCallback(async () => {
    setLoadingCheckIns(true);

    try {
      const [checkInsPayload, goalsPayload, teamMembersPayload] = await Promise.all([
        requestJson("/api/check-ins?scope=team"),
        requestJson("/api/goals"),
        requestJson("/api/team-members"),
      ]);

      const data = (checkInsPayload.data || []) as ManagerCheckIn[];
      const goals = (goalsPayload.data || []) as Array<{
        $id: string;
        cycleId?: string;
        title?: string;
      }>;
      const teamMembers = (teamMembersPayload.data || []) as Array<{ $id: string }>;
      const teamMemberIds = new Set(teamMembers.map((item) => String(item.$id || "").trim()).filter(Boolean));
      const filteredData = data.filter((item) => teamMemberIds.has(String(item.employeeId || "").trim()));

      const cycleMap = goals.reduce<Record<string, string>>((acc, goal) => {
        if (goal.cycleId) {
          acc[goal.$id] = goal.cycleId;
        }
        return acc;
      }, {});

      const titleMap = goals.reduce<Record<string, string>>((acc, goal) => {
        if (goal.title) {
          acc[goal.$id] = goal.title;
        }
        return acc;
      }, {});

      setCheckInRows(filteredData);
      setGoalCycleById(cycleMap);
      setGoalTitleById(titleMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load check-ins.");
    } finally {
      setLoadingCheckIns(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setError("");
    setSuccess("");
    await Promise.all([loadApprovals(), loadCheckIns()]);
  }, [loadApprovals, loadCheckIns]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  async function handleDecision(event: FormEvent, goalId: string) {
    event.preventDefault();
    setWorkingApprovals(true);
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
      await loadApprovals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save decision.");
    } finally {
      setWorkingApprovals(false);
    }
  }

  async function handleComplete(event: FormEvent, row: ManagerCheckIn) {
    event.preventDefault();
    setWorkingCheckIns(true);
    setError("");
    setSuccess("");

    const rawRating = (managerRatings[row.$id] || "").trim();
    const parsedRating = rawRating === "" ? NaN : Number(rawRating);
    const ratingLabel = managerRatingLabels[row.$id] || "ME";

    if (row.isFinalCheckIn) {
      if (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
        setError("Final check-in requires a manager rating from 1 to 5.");
        setWorkingCheckIns(false);
        return;
      }
    }

    try {
      await requestJson(`/api/check-ins/${row.$id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "completed",
          managerNotes: managerNotes[row.$id] || "",
          transcriptText: transcriptText[row.$id] || "",
          isFinalCheckIn: Boolean(row.isFinalCheckIn),
          managerRating: row.isFinalCheckIn ? parsedRating : null,
          managerGoalRatingLabel: row.isFinalCheckIn ? ratingLabel : null,
        }),
      });

      setSuccess("Check-in marked as completed.");
      await loadCheckIns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update check-in.");
    } finally {
      setWorkingCheckIns(false);
    }
  }

  async function handleGenerateSummary(row: ManagerCheckIn) {
    const cycleId = goalCycleById[row.goalId];
    const notesSource = (managerNotes[row.$id] || row.employeeNotes || "").trim();

    if (!cycleId) {
      setError("Cycle context not found for this goal. Refresh and try again.");
      return;
    }

    if (!notesSource) {
      setError("Add manager notes or ensure employee notes exist before generating summary.");
      return;
    }

    setError("");
    setAiWorking((prev) => ({ ...prev, [row.$id]: true }));

    try {
      const payload = await requestJson("/api/ai/checkin-summary", {
        method: "POST",
        body: JSON.stringify({
          cycleId,
          notes: notesSource,
          goalTitle: goalTitleById[row.goalId] || row.goalId,
        }),
      });

      const summary = payload?.data?.summary || "";
      const highlights = Array.isArray(payload?.data?.highlights) ? payload.data.highlights : [];
      const blockers = Array.isArray(payload?.data?.blockers) ? payload.data.blockers : [];
      const nextActions = Array.isArray(payload?.data?.nextActions) ? payload.data.nextActions : [];

      const composed = [
        summary,
        highlights.length ? `Highlights: ${highlights.join("; ")}` : "",
        blockers.length ? `Blockers: ${blockers.join("; ")}` : "",
        nextActions.length ? `Next actions: ${nextActions.join("; ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      setTranscriptText((prev) => ({
        ...prev,
        [row.$id]: composed,
      }));

      const usage = payload?.data?.usage;
      const explainability = payload?.data?.explainability;

      setAiMeta((prev) => ({
        ...prev,
        [row.$id]: {
          source: explainability?.source || "extractive_summary",
          confidence: explainability?.confidence || "medium",
          remaining: typeof usage?.remaining === "number" ? usage.remaining : undefined,
        },
      }));

      setSuccess("AI check-in summary generated. Review before marking completed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate AI summary.");
    } finally {
      setAiWorking((prev) => ({ ...prev, [row.$id]: false }));
    }
  }

  return (
    <Stack gap="4">
      <PageHeader
        title="Team Approvals"
        subtitle="Review submitted goals and close team check-ins from one queue."
        actions={
          <Button
            variant="secondary"
            onClick={refreshAll}
            disabled={loadingApprovals || loadingCheckIns || workingApprovals || workingCheckIns}
          >
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="error" title="Action failed" description={error} onDismiss={() => setError("")} />}
      {success && <Alert variant="success" title="Saved" description={success} onDismiss={() => setSuccess("")} />}

      <Card title="Pending Submitted Goals" description="Only submitted goals are shown here.">
        <Stack gap="3">
          <Input
            label="Search employee approvals"
            value={employeeApprovalQuery}
            onChange={(event) => setEmployeeApprovalQuery(event.target.value)}
            placeholder="Search by goal, employee, cycle, or status"
          />

          {loadingApprovals && <p className="caption">Loading approval queue...</p>}

          {!loadingApprovals && filteredApprovalRows.length === 0 && (
            <p className="caption">
              {normalizedEmployeeApprovalQuery
                ? "No employee approvals match your search."
                : "No submitted goals waiting for approval."}
            </p>
          )}

          <div className="max-h-[420px] overflow-y-auto pr-1">
            <Stack gap="3">
              {filteredApprovalRows.map((goal) => {
                const selected = decision[goal.$id] || "approved";

                return (
                  <form
                    key={goal.$id}
                    onSubmit={(event) => handleDecision(event, goal.$id)}
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
                      <span className="caption">Employee: {goal.employeeId}</span>
                      <span className="caption">Cycle: {goal.cycleId}</span>
                      <span className="caption">Weightage: {goal.weightage}%</span>
                      <span className="caption">Progress: {goal.progressPercent ?? goal.processPercent ?? 0}%</span>
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
                      <VoiceTextarea
                        label="Manager Comments"
                        value={comments[goal.$id] || ""}
                        onChange={(event) =>
                          setComments((prev) => ({
                            ...prev,
                            [goal.$id]: event.target.value,
                          }))
                        }
                        onTranscript={(text) =>
                          setComments((prev) => ({
                            ...prev,
                            [goal.$id]: [prev[goal.$id] || "", text].filter(Boolean).join(" "),
                          }))
                        }
                        placeholder="Add guidance for the employee"
                      />
                    </div>

                    <div className="mt-3">
                      <Button type="submit" loading={workingApprovals}>
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

      <Card title="Team Check-ins" description="Mark planned check-ins as completed with manager notes.">
        <Stack gap="3">
          {loadingCheckIns && <p className="caption">Loading check-ins...</p>}
          {!loadingCheckIns && checkInRows.length === 0 && <p className="caption">No check-ins available.</p>}

          {checkInRows.map((row) => (
            <form
              key={row.$id}
              onSubmit={(event) => handleComplete(event, row)}
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="body-sm text-[var(--color-text)]">{formatDate(row.scheduledAt)}</p>
                <Badge variant={row.status === "completed" ? "success" : "info"}>{row.status}</Badge>
              </div>

              <div className="mt-2 flex flex-wrap gap-3">
                <span className="caption">Goal: {row.goalId}</span>
                <span className="caption">Employee: {row.employeeId}</span>
              </div>

              {row.employeeNotes && <p className="caption mt-2">Employee notes: {row.employeeNotes}</p>}

              {row.status === "planned" ? (
                <div className="mt-3 space-y-2">
                  {row.isFinalCheckIn && (
                    <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
                      <Badge variant="warning">Final check-in flagged by employee</Badge>
                      <div className="mt-2">
                        <Input
                          label="Final Rating (1 to 5)"
                          type="number"
                          min={1}
                          max={5}
                          step={1}
                          required
                          value={managerRatings[row.$id] || ""}
                          onChange={(event) =>
                            setManagerRatings((prev) => ({ ...prev, [row.$id]: event.target.value }))
                          }
                          helperText="Required when this is a final check-in."
                        />

                        <div className="mt-2">
                          <p className="caption mb-1">Goal rating label</p>
                          <div className="flex flex-wrap gap-2">
                            {(["EE", "DE", "ME", "SME", "NI"] as const).map((label) => (
                              <Button
                                key={label}
                                type="button"
                                size="sm"
                                variant={managerRatingLabels[row.$id] === label ? "primary" : "secondary"}
                                onClick={() =>
                                  setManagerRatingLabels((prev) => ({
                                    ...prev,
                                    [row.$id]: label,
                                  }))
                                }
                              >
                                {label}
                              </Button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <VoiceTextarea
                    label="Manager Notes"
                    value={managerNotes[row.$id] || ""}
                    onChange={(event) =>
                      setManagerNotes((prev) => ({ ...prev, [row.$id]: event.target.value }))
                    }
                    onTranscript={(text) =>
                      setManagerNotes((prev) => ({
                        ...prev,
                        [row.$id]: [prev[row.$id] || "", text].filter(Boolean).join(" "),
                      }))
                    }
                    placeholder="Summary and coaching notes"
                  />

                  <VoiceTextarea
                    label="Transcript / Summary"
                    value={transcriptText[row.$id] || ""}
                    onChange={(event) =>
                      setTranscriptText((prev) => ({ ...prev, [row.$id]: event.target.value }))
                    }
                    onTranscript={(text) =>
                      setTranscriptText((prev) => ({
                        ...prev,
                        [row.$id]: [prev[row.$id] || "", text].filter(Boolean).join(" "),
                      }))
                    }
                    placeholder="Optional meeting transcript summary"
                  />

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => handleGenerateSummary(row)}
                      loading={Boolean(aiWorking[row.$id])}
                    >
                      Generate AI Summary
                    </Button>

                    {aiMeta[row.$id] && (
                      <span className="caption">
                        Source: {aiMeta[row.$id].source}, confidence: {aiMeta[row.$id].confidence}
                        {typeof aiMeta[row.$id].remaining === "number"
                          ? `, remaining this cycle: ${aiMeta[row.$id].remaining}`
                          : ""}
                      </span>
                    )}
                  </div>

                  <Button type="submit" loading={workingCheckIns}>Mark Completed</Button>
                </div>
              ) : (
                <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
                  {row.managerNotes && <p className="caption">Manager notes: {row.managerNotes}</p>}
                  {row.transcriptText && <p className="caption mt-1">Transcript: {row.transcriptText}</p>}
                  {row.isFinalCheckIn && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge variant="success">Final check-in</Badge>
                      {typeof row.managerRating === "number" && (
                        <span className="caption">Rating: {row.managerRating}/5</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </form>
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}

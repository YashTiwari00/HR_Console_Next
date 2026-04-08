"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Card, Checkbox, Input, SpeechToTextButton, Textarea } from "@/src/components/ui";
import { account } from "@/lib/appwrite";
import { isManagerRoleValue } from "@/src/lib/auth/useManagerRole";
import { fetchCurrentUserContext, formatDate } from "@/app/employee/_lib/pmsClient";

type CheckInStatus = "planned" | "completed";

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
  canManagerSubmitRating?: boolean;
  selfReviewDeadlinePassed?: boolean;
  managerRatingBlockMessage?: string;
  employeeSelfReview?: {
    reviewId?: string;
    status?: "draft" | "submitted" | string;
    submittedAt?: string | null;
    achievements?: string;
    challenges?: string;
    selfRatingValue?: number | null;
    selfRatingLabel?: "EE" | "DE" | "ME" | "SME" | "NI" | null;
    comments?: string;
  } | null;
}

function getManagerRatingBlockMessage(row: ManagerCheckIn) {
  if (!row.isFinalCheckIn) return "";

  const canSubmit =
    typeof row.canManagerSubmitRating === "boolean"
      ? row.canManagerSubmitRating
      : String(row.employeeSelfReview?.status || "").trim() === "submitted";

  if (canSubmit) return "";

  return String(row.managerRatingBlockMessage || "").trim() || "Waiting for employee self-review";
}

export default function ManagerCheckInsPage() {
  const MIN_AI_FEEDBACK_LENGTH = 12;
  const [rows, setRows] = useState<ManagerCheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [aiWorking, setAiWorking] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [managerNotes, setManagerNotes] = useState<Record<string, string>>({});
  const [transcriptText, setTranscriptText] = useState<Record<string, string>>({});
  const [managerRatings, setManagerRatings] = useState<Record<string, string>>({});
  const [managerRatingLabels, setManagerRatingLabels] = useState<
    Record<string, "EE" | "DE" | "ME" | "SME" | "NI">
  >({});
  const [aiMeta, setAiMeta] = useState<
    Record<
      string,
      {
        source: string;
        confidence: string;
        remaining?: number;
        coachingScore?: number;
        toneTips?: string[];
        matrixWeightedRating?: number;
        matrixResponses?: number;
      }
    >
  >({});
  const [goalCycleById, setGoalCycleById] = useState<Record<string, string>>({});
  const [goalTitleById, setGoalTitleById] = useState<Record<string, string>>({});
  const [aiBudgetWarning, setAiBudgetWarning] = useState("");
  const [aiFeedbackAnalysis, setAiFeedbackAnalysis] = useState<{
    score: number;
    reason: string;
    tone: string;
    suggestion: string;
    loading: boolean;
    error: string | null;
  }>({
    score: 0,
    reason: "",
    tone: "",
    suggestion: "",
    loading: false,
    error: null,
  });
  const [aiFeedbackTargetId, setAiFeedbackTargetId] = useState<string | null>(null);
  const [aiFeedbackDismissed, setAiFeedbackDismissed] = useState(false);
  const [isManagerRole, setIsManagerRole] = useState(true);
  const [roleResolved, setRoleResolved] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"pending" | "all">("pending");
  const [lastFailedIds, setLastFailedIds] = useState<string[]>([]);

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

  const loadCheckIns = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const userContext = await fetchCurrentUserContext();
      const currentRole = userContext?.profile?.role;

      if (!isManagerRoleValue(currentRole)) {
        setIsManagerRole(false);
        setRows([]);
        setError("Only manager role can add or edit manager feedback in team check-ins.");
        return;
      }

      setIsManagerRole(true);

      const [checkInsPayload, goalsPayload, teamMembersPayload, usagePayload] = await Promise.all([
        requestJson("/api/check-ins?scope=team"),
        requestJson("/api/goals"),
        requestJson("/api/team-members"),
        requestJson("/api/ai/usage"),
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

      setRows(filteredData);
      setGoalCycleById(cycleMap);
      setGoalTitleById(titleMap);

      const features = Array.isArray(usagePayload?.data?.features)
        ? usagePayload.data.features
        : [];
      const checkInFeature = features.find((item: { featureType?: string }) => item?.featureType === "checkin_summary");

      if (checkInFeature && Number(checkInFeature.remaining || 0) <= 1) {
        setAiBudgetWarning(
          `AI check-in budget is low (${checkInFeature.remaining} remaining this cycle). Use AI only for high-impact reviews.`
        );
      } else {
        setAiBudgetWarning("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load check-ins.");
    } finally {
      setRoleResolved(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCheckIns();
  }, [loadCheckIns]);

  async function handleComplete(event: FormEvent, row: ManagerCheckIn) {
    event.preventDefault();
    await approveRows([row.$id]);
  }

  async function approveRows(checkInIds: string[]) {
    if (checkInIds.length === 0) return;

    setWorking(true);
    setError("");
    setSuccess("");

    try {
      const items = checkInIds.map((checkInId) => {
        const row = rows.find((candidate) => candidate.$id === checkInId);
        const rawRating = (managerRatings[checkInId] || "").trim();
        const parsedRating = rawRating === "" ? null : Number(rawRating);
        const ratingLabel = managerRatingLabels[checkInId] || "ME";
        const blockedReason = row ? getManagerRatingBlockMessage(row) : "";

        if (row?.isFinalCheckIn && blockedReason) {
          throw new Error(`${blockedReason} (check-in ${checkInId}).`);
        }

        if (row?.isFinalCheckIn) {
          if (!Number.isInteger(parsedRating) || (parsedRating || 0) < 1 || (parsedRating || 0) > 5) {
            throw new Error(`Final check-in requires a manager rating from 1 to 5 (check-in ${checkInId}).`);
          }
        }

        return {
          checkInId,
          managerNotes: managerNotes[checkInId] || "",
          transcriptText: transcriptText[checkInId] || "",
          isFinalCheckIn: Boolean(row?.isFinalCheckIn),
          managerRating: row?.isFinalCheckIn ? parsedRating : null,
          managerGoalRatingLabel: row?.isFinalCheckIn ? ratingLabel : null,
        };
      });

      const payload = await requestJson("/api/check-ins/manager-approvals", {
        method: "POST",
        body: JSON.stringify({ items }),
      });

      const summary = payload?.summary;
      const approved = Number(summary?.approved || 0);
      const failed = Number(summary?.failed || 0);
      const failedIds = Array.isArray(summary?.failures)
        ? summary.failures.map((item: { checkInId?: string }) => String(item?.checkInId || "").trim()).filter(Boolean)
        : [];
      setSuccess(`Approved ${approved} check-ins. Failed: ${failed}.`);
      setLastFailedIds(failedIds);
      setSelectedIds(new Set());
      await loadCheckIns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update check-ins.");
    } finally {
      setWorking(false);
    }
  }

  function toggleSelected(checkInId: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(checkInId);
      } else {
        next.delete(checkInId);
      }
      return next;
    });
  }

  const visibleRows = viewMode === "pending" ? rows.filter((row) => row.status === "planned") : rows;
  const visiblePlannedIds = visibleRows
    .filter((row) => row.status === "planned")
    .map((row) => row.$id);
  const selectedVisibleCount = visiblePlannedIds.filter((id) => selectedIds.has(id)).length;

  function selectAllVisiblePlanned() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      visiblePlannedIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function clearVisibleSelection() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      visiblePlannedIds.forEach((id) => next.delete(id));
      return next;
    });
  }

  async function handleGenerateAgenda(row: ManagerCheckIn) {
    const cycleId = goalCycleById[row.goalId];

    if (!cycleId) {
      setError("Cycle context not found for this goal. Refresh and try again.");
      return;
    }

    setError("");
    setAiWorking((prev) => ({ ...prev, [row.$id]: true }));

    try {
      const payload = await requestJson("/api/ai/checkin-agenda", {
        method: "POST",
        body: JSON.stringify({
          cycleId,
          goalTitle: goalTitleById[row.goalId] || row.goalId,
          employeeNotes: row.employeeNotes || "",
          scheduledAt: row.scheduledAt,
        }),
      });

      const agenda = Array.isArray(payload?.data?.agenda) ? payload.data.agenda : [];
      const focusQuestions = Array.isArray(payload?.data?.focusQuestions) ? payload.data.focusQuestions : [];
      const riskSignals = Array.isArray(payload?.data?.riskSignals) ? payload.data.riskSignals : [];

      const composed = [
        "Pre-check-in agenda:",
        ...agenda.map((item: string, index: number) => `${index + 1}. ${item}`),
        focusQuestions.length ? `Focus questions: ${focusQuestions.join("; ")}` : "",
        riskSignals.length ? `Risk signals: ${riskSignals.join("; ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      setManagerNotes((prev) => ({
        ...prev,
        [row.$id]: prev[row.$id] ? `${prev[row.$id]}\n\n${composed}` : composed,
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

      setSuccess("AI agenda generated. Review and edit before completing check-in.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate AI agenda.");
    } finally {
      setAiWorking((prev) => ({ ...prev, [row.$id]: false }));
    }
  }

  async function handleAnalyzeIntelligence(row: ManagerCheckIn) {
    const cycleId = goalCycleById[row.goalId];
    const notesSource = (managerNotes[row.$id] || row.employeeNotes || "").trim();

    if (!cycleId) {
      setError("Cycle context not found for this goal. Refresh and try again.");
      return;
    }

    if (!notesSource) {
      setError("Add notes before running check-in intelligence.");
      return;
    }

    setError("");
    setAiWorking((prev) => ({ ...prev, [row.$id]: true }));

    try {
      const payload = await requestJson("/api/ai/checkin-intelligence", {
        method: "POST",
        body: JSON.stringify({
          cycleId,
          notes: notesSource,
          goalTitle: goalTitleById[row.goalId] || row.goalId,
          goalId: row.goalId,
          employeeId: row.employeeId,
        }),
      });

      const summary = String(payload?.data?.summary || "").trim();
      const commitments = Array.isArray(payload?.data?.commitments) ? payload.data.commitments : [];
      const coachingScore = Number(payload?.data?.coachingScore?.score || 0);
      const toneGuidance = Array.isArray(payload?.data?.toneGuidance) ? payload.data.toneGuidance : [];
      const revisedManagerFeedback = String(payload?.data?.revisedManagerFeedback || "").trim();
      const matrixBlend = payload?.data?.matrixBlend || null;

      const commitmentLines = commitments
        .map((item: { owner?: string; action?: string; dueDate?: string }) => {
          const owner = String(item?.owner || "manager").trim();
          const action = String(item?.action || "").trim();
          const dueDate = String(item?.dueDate || "").trim();
          if (!action) return "";
          return dueDate ? `${owner}: ${action} (due ${dueDate})` : `${owner}: ${action}`;
        })
        .filter(Boolean);

      const intelligenceText = [
        summary,
        commitmentLines.length ? `Commitments: ${commitmentLines.join("; ")}` : "",
        matrixBlend && Number.isFinite(Number(matrixBlend.weightedRating))
          ? `Matrix signal rating: ${Number(matrixBlend.weightedRating).toFixed(2)} / 5 from ${Number(matrixBlend.responseCount || 0)} reviewer responses.`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      setTranscriptText((prev) => ({
        ...prev,
        [row.$id]: intelligenceText || prev[row.$id] || "",
      }));

      if (revisedManagerFeedback) {
        setManagerNotes((prev) => ({
          ...prev,
          [row.$id]: revisedManagerFeedback,
        }));
      }

      const usage = payload?.data?.usage;
      const explainability = payload?.data?.explainability;

      setAiMeta((prev) => ({
        ...prev,
        [row.$id]: {
          source: explainability?.source || "openrouter_llm",
          confidence: explainability?.confidence || "medium",
          remaining: typeof usage?.remaining === "number" ? usage.remaining : undefined,
          coachingScore: Number.isFinite(coachingScore) ? coachingScore : undefined,
          toneTips: toneGuidance.map((item: unknown) => String(item || "").trim()).filter(Boolean),
          matrixWeightedRating: Number.isFinite(Number(matrixBlend?.weightedRating))
            ? Number(matrixBlend.weightedRating)
            : undefined,
          matrixResponses: Number.isFinite(Number(matrixBlend?.responseCount))
            ? Number(matrixBlend.responseCount)
            : undefined,
        },
      }));

      setSuccess("AI check-in intelligence generated with commitments and coaching guidance.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run check-in intelligence.");
    } finally {
      setAiWorking((prev) => ({ ...prev, [row.$id]: false }));
    }
  }

  async function handleImproveWithAi(row: ManagerCheckIn) {
    if (!roleResolved || !isManagerRole) {
      setError("Only manager role can use Improve with AI.");
      return;
    }

    if (aiFeedbackAnalysis.loading && aiFeedbackTargetId === row.$id) {
      return;
    }

    const feedback = String(managerNotes[row.$id] || "").trim();
    const cycleId = String(goalCycleById[row.goalId] || "").trim();

    if (!cycleId) {
      const message = "Cycle context missing for this goal. Refresh and try again.";
      setError(message);
      setAiFeedbackTargetId(row.$id);
      setAiFeedbackDismissed(false);
      setAiFeedbackAnalysis((prev) => ({
        ...prev,
        loading: false,
        error: message,
      }));
      return;
    }

    if (!feedback) {
      const message = "Add manager notes before using Improve with AI.";
      setError(message);
      setAiFeedbackTargetId(row.$id);
      setAiFeedbackAnalysis((prev) => ({
        ...prev,
        loading: false,
        error: message,
      }));
      return;
    }

    if (feedback.length < MIN_AI_FEEDBACK_LENGTH) {
      const message = `Please add a bit more detail (at least ${MIN_AI_FEEDBACK_LENGTH} characters) for useful AI feedback.`;
      setError(message);
      setAiFeedbackTargetId(row.$id);
      setAiFeedbackDismissed(false);
      setAiFeedbackAnalysis((prev) => ({
        ...prev,
        loading: false,
        error: message,
      }));
      return;
    }

    setError("");
    setAiFeedbackTargetId(row.$id);
    setAiFeedbackDismissed(false);
    setAiFeedbackAnalysis((prev) => ({
      ...prev,
      loading: true,
      error: null,
    }));

    try {
      const payload = await requestJson("/api/ai/manager-feedback-analysis", {
        method: "POST",
        body: JSON.stringify({ feedback, cycleId }),
      });

      setAiFeedbackAnalysis({
        score: Number(payload?.data?.score || 0),
        reason: String(payload?.data?.reason || "").trim(),
        tone: String(payload?.data?.tone || "neutral").trim(),
        suggestion: String(payload?.data?.suggestion || "").trim(),
        loading: false,
        error: null,
      });
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Unable to analyze feedback right now. Please try again.";
      setAiFeedbackAnalysis((prev) => ({
        ...prev,
        loading: false,
        error: message,
      }));
      setError(message);
    }
  }

  function toneVariant(tone: string) {
    const normalized = String(tone || "").trim().toLowerCase();
    if (normalized === "harsh") return "warning" as const;
    if (normalized === "constructive") return "success" as const;
    return "info" as const;
  }

  function renderSelfRating(row: ManagerCheckIn) {
    const numeric = typeof row.employeeSelfReview?.selfRatingValue === "number"
      ? `${row.employeeSelfReview?.selfRatingValue}/5`
      : "";
    const label = String(row.employeeSelfReview?.selfRatingLabel || "").trim();

    if (numeric && label) return `${numeric} (${label})`;
    if (numeric) return numeric;
    if (label) return label;
    return "Not provided";
  }

  function handleUseAiSuggestion(row: ManagerCheckIn) {
    const suggestion = String(aiFeedbackAnalysis.suggestion || "").trim();

    if (!suggestion) {
      setError("No AI suggestion available to apply.");
      return;
    }

    setManagerNotes((prev) => ({
      ...prev,
      [row.$id]: suggestion,
    }));

    setSuccess("AI suggestion applied to manager notes. Review and submit when ready.");
  }

  return (
    <Stack gap="4">
      <PageHeader
        title="Team Check-ins"
        subtitle="Track team conversations and close completed sessions."
        actions={
          <Button variant="secondary" onClick={loadCheckIns} disabled={loading || working}>
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="error" title="Action failed" description={error} onDismiss={() => setError("")} />}
      {success && (
        <Alert variant="success" title="Saved" description={success} onDismiss={() => setSuccess("")} />
      )}
      {aiBudgetWarning && (
        <Alert variant="warning" title="AI Budget Warning" description={aiBudgetWarning} onDismiss={() => setAiBudgetWarning("")} />
      )}

      {roleResolved && !isManagerRole ? (
        <Card title="Team Check-ins" description="Manager access required.">
          <p className="caption">Manager feedback inputs are disabled because this account is not mapped to the manager role.</p>
        </Card>
      ) : (
      <Card title="Team Check-ins" description="Mark planned check-ins as completed with manager notes.">
        <Stack gap="3">
          <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
            <span className="caption">View:</span>
            <Button
              size="sm"
              variant={viewMode === "pending" ? "primary" : "secondary"}
              onClick={() => setViewMode("pending")}
              disabled={working}
            >
              Pending Only
            </Button>
            <Button
              size="sm"
              variant={viewMode === "all" ? "primary" : "secondary"}
              onClick={() => setViewMode("all")}
              disabled={working}
            >
              All
            </Button>
            <span className="caption">Showing: {visibleRows.length}</span>
          </div>

          {visiblePlannedIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
              <span className="caption">Visible pending: {visiblePlannedIds.length}</span>
              <span className="caption">Selected in view: {selectedVisibleCount}</span>
              <Button size="sm" variant="secondary" onClick={selectAllVisiblePlanned} disabled={working}>
                Select All Visible
              </Button>
              <Button size="sm" variant="secondary" onClick={clearVisibleSelection} disabled={working}>
                Clear Visible
              </Button>
            </div>
          )}

          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
              <span className="caption">Selected: {selectedIds.size}</span>
              <Button
                size="sm"
                onClick={() => approveRows(Array.from(selectedIds.values()))}
                loading={working}
              >
                Approve Selected
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setSelectedIds(new Set())} disabled={working}>
                Clear
              </Button>
            </div>
          )}

          {lastFailedIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-warning)] bg-[var(--color-surface)] px-3 py-2">
              <span className="caption">Last bulk action failed for {lastFailedIds.length} check-ins.</span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => approveRows(lastFailedIds)}
                loading={working}
              >
                Retry Failed
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setLastFailedIds([])} disabled={working}>
                Dismiss
              </Button>
            </div>
          )}

          {loading && <p className="caption">Loading check-ins...</p>}
          {!loading && visibleRows.length === 0 && <p className="caption">No check-ins available.</p>}

          {visibleRows.map((row) => (
            <form
              key={row.$id}
              onSubmit={(event) => handleComplete(event, row)}
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-3"
            >
              {(() => {
                const blockedMessage = getManagerRatingBlockMessage(row);
                const isRatingBlocked = Boolean(blockedMessage);
                return (
                  <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {row.status === "planned" && (
                    <Checkbox
                      label=""
                      checked={selectedIds.has(row.$id)}
                      onChange={(event) => toggleSelected(row.$id, event.target.checked)}
                    />
                  )}
                  <p className="body-sm text-[var(--color-text)]">{formatDate(row.scheduledAt)}</p>
                </div>
                <Badge variant={row.status === "completed" ? "success" : "info"}>
                  {row.status === "completed" ? "approved" : "pending approval"}
                </Badge>
              </div>

              <div className="mt-2 flex flex-wrap gap-3">
                <span className="caption">Goal: {row.goalId}</span>
                <span className="caption">Employee: {row.employeeId}</span>
              </div>

              {row.employeeNotes && <p className="caption mt-2">Employee notes: {row.employeeNotes}</p>}

              {row.status === "planned" ? (
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="body-sm font-medium text-[var(--color-text)]">Employee Self Reflection</p>
                      <Badge
                        variant={
                          String(row.employeeSelfReview?.status || "").trim() === "submitted"
                            ? "success"
                            : "warning"
                        }
                      >
                        {String(row.employeeSelfReview?.status || "draft").trim() || "draft"}
                      </Badge>
                    </div>
                    <div className="mt-2 space-y-2">
                      <div>
                        <p className="caption font-medium">Achievements</p>
                        <p className="caption mt-1">
                          {row.employeeSelfReview?.achievements || "No achievements shared yet."}
                        </p>
                      </div>
                      <div>
                        <p className="caption font-medium">Challenges</p>
                        <p className="caption mt-1">
                          {row.employeeSelfReview?.challenges || "No challenges shared yet."}
                        </p>
                      </div>
                      <div>
                        <p className="caption font-medium">Self rating</p>
                        <p className="caption mt-1">{renderSelfRating(row)}</p>
                      </div>
                      <div>
                        <p className="caption font-medium">Comments</p>
                        <p className="caption mt-1">
                          {row.employeeSelfReview?.comments || "No additional comments shared yet."}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-3">
                    <p className="body-sm font-medium text-[var(--color-text)]">Manager Feedback</p>

                    {isRatingBlocked && (
                      <Alert
                        variant="warning"
                        title="Rating blocked"
                        description={blockedMessage}
                      />
                    )}

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
                            disabled={isRatingBlocked}
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
                                  disabled={isRatingBlocked}
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

                    <Textarea
                      label="Manager Notes"
                      value={managerNotes[row.$id] || ""}
                      onChange={(event) =>
                        setManagerNotes((prev) => ({ ...prev, [row.$id]: event.target.value }))
                      }
                      placeholder="Summary and coaching notes"
                    />

                    {roleResolved && isManagerRole && (
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <SpeechToTextButton
                          ariaLabel="Manager notes speech input"
                          disabled={working}
                          onFinalTranscript={(transcript) => {
                            setManagerNotes((prev) => {
                              const current = String(prev[row.$id] || "").trim();
                              const next = transcript.trim();
                              if (!next) return prev;
                              return {
                                ...prev,
                                [row.$id]: current ? `${current} ${next}` : next,
                              };
                            });
                          }}
                        />
                        {(() => {
                          const noteText = String(managerNotes[row.$id] || "").trim();
                          const isImproveLoading = aiFeedbackAnalysis.loading && aiFeedbackTargetId === row.$id;
                          return (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleImproveWithAi(row)}
                          loading={isImproveLoading}
                          disabled={noteText.length === 0 || isImproveLoading}
                        >
                          Improve with AI
                        </Button>
                          );
                        })()}
                      </div>
                    )}

                    {aiFeedbackTargetId === row.$id && !aiFeedbackDismissed && aiFeedbackAnalysis.error && (
                      <div className="mt-1 rounded-[var(--radius-sm)] border border-[var(--color-warning)] bg-[var(--color-surface)] px-3 py-2">
                        <p className="caption">{aiFeedbackAnalysis.error}</p>
                      </div>
                    )}

                    {aiFeedbackTargetId === row.$id &&
                      !aiFeedbackDismissed &&
                      !aiFeedbackAnalysis.error &&
                      (aiFeedbackAnalysis.reason || aiFeedbackAnalysis.suggestion) && (
                        <div className="mt-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="caption">AI score: {aiFeedbackAnalysis.score}/10</p>
                            <div className="flex items-center gap-2">
                              <Badge variant={toneVariant(aiFeedbackAnalysis.tone)}>
                                {aiFeedbackAnalysis.tone || "neutral"}
                              </Badge>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => handleUseAiSuggestion(row)}
                              >
                                Use Suggestion
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => setAiFeedbackDismissed(true)}
                              >
                                Dismiss
                              </Button>
                            </div>
                          </div>
                          <p className="caption mt-1">{aiFeedbackAnalysis.reason}</p>
                          <p className="caption mt-1">Suggested feedback: {aiFeedbackAnalysis.suggestion}</p>
                        </div>
                      )}

                    <Textarea
                      label="Transcript / Summary"
                      value={transcriptText[row.$id] || ""}
                      onChange={(event) =>
                        setTranscriptText((prev) => ({ ...prev, [row.$id]: event.target.value }))
                      }
                      placeholder="Optional meeting transcript summary"
                    />

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => handleGenerateAgenda(row)}
                        loading={Boolean(aiWorking[row.$id])}
                      >
                        Generate Agenda
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => handleAnalyzeIntelligence(row)}
                        loading={Boolean(aiWorking[row.$id])}
                      >
                        Analyze Commitments & Tone
                      </Button>

                      {aiMeta[row.$id] && (
                        <div className="caption">
                          Source: {aiMeta[row.$id].source}, confidence: {aiMeta[row.$id].confidence}
                          {typeof aiMeta[row.$id].remaining === "number"
                            ? `, remaining this cycle: ${aiMeta[row.$id].remaining}`
                            : ""}
                          {typeof aiMeta[row.$id].coachingScore === "number"
                            ? `, coaching quality: ${aiMeta[row.$id].coachingScore}/10`
                            : ""}
                          {Array.isArray(aiMeta[row.$id]?.toneTips) && (aiMeta[row.$id]?.toneTips?.length || 0) > 0
                            ? `, tone tips: ${aiMeta[row.$id]?.toneTips?.join("; ")}`
                            : ""}
                          {typeof aiMeta[row.$id]?.matrixWeightedRating === "number"
                            ? `, matrix signal: ${aiMeta[row.$id]?.matrixWeightedRating?.toFixed(2)}/5 (${aiMeta[row.$id]?.matrixResponses || 0} responses)`
                            : ""}
                        </div>
                      )}
                    </div>

                    <Button type="submit" loading={working} disabled={isRatingBlocked}>Approve Check-in</Button>
                  </div>
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
                  </>
                );
              })()}
            </form>
          ))}
        </Stack>
      </Card>
      )}
    </Stack>
  );
}

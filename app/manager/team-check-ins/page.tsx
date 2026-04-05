"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Card, Input, Textarea } from "@/src/components/ui";
import { account } from "@/lib/appwrite";
import { formatDate } from "@/app/employee/_lib/pmsClient";

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
}

export default function ManagerCheckInsPage() {
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
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCheckIns();
  }, [loadCheckIns]);

  async function handleComplete(event: FormEvent, row: ManagerCheckIn) {
    event.preventDefault();
    setWorking(true);
    setError("");
    setSuccess("");

    const rawRating = (managerRatings[row.$id] || "").trim();
    const parsedRating = rawRating === "" ? NaN : Number(rawRating);
    const ratingLabel = managerRatingLabels[row.$id] || "ME";

    if (row.isFinalCheckIn) {
      if (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
        setError("Final check-in requires a manager rating from 1 to 5.");
        setWorking(false);
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
      setWorking(false);
    }
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

      <Card title="Team Check-ins" description="Mark planned check-ins as completed with manager notes.">
        <Stack gap="3">
          {loading && <p className="caption">Loading check-ins...</p>}
          {!loading && rows.length === 0 && <p className="caption">No check-ins available.</p>}

          {rows.map((row) => (
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

                  <Textarea
                    label="Manager Notes"
                    value={managerNotes[row.$id] || ""}
                    onChange={(event) =>
                      setManagerNotes((prev) => ({ ...prev, [row.$id]: event.target.value }))
                    }
                    placeholder="Summary and coaching notes"
                  />

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

                  <Button type="submit" loading={working}>Mark Completed</Button>
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

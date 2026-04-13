"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Container, Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Checkbox, Input, Select, Skeleton, Textarea } from "@/src/components/ui";
import {
  askMeetingQuestion,
  createMeetRequest,
  downloadMeetingReport,
  fetchCurrentUserContext,
  fetchEmployeeFreeBusy,
  fetchGoals,
  fetchGoogleTokenStatus,
  fetchMeetingIntelligence,
  fetchMeetRequests,
  formatDate,
  generateMeetingIntelligence,
  GoalItem,
  GoogleTokenStatus,
  MeetingIntelligenceReport,
  MeetRequestItem,
} from "@/app/employee/_lib/pmsClient";
import AvailabilityCalendar from "@/components/calendar/AvailabilityCalendar";

const DEFAULT_TIMEZONE = "UTC";

function toDateTimeLocalValue(input: string | Date) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.valueOf())) return "";
  const offset = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toIsoFromDateTimeLocal(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.valueOf()) ? "" : d.toISOString();
}

type ActiveTab = "request" | "intelligence";

export default function EmployeeMeetingCalendarDashboardPage() {
  const [tokenStatus, setTokenStatus] = useState<GoogleTokenStatus | null>(null);
  const [meetRequests, setMeetRequests] = useState<MeetRequestItem[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>("request");

  // Request form
  const [title, setTitle] = useState("1:1 Meeting Request");
  const [description, setDescription] = useState("");
  const [proposedStart, setProposedStart] = useState("");
  const [proposedEnd, setProposedEnd] = useState("");
  const [meetingType, setMeetingType] = useState<"individual" | "group">("individual");
  const [linkedGoalIds, setLinkedGoalIds] = useState<string[]>([]);
  const [goals, setGoals] = useState<GoalItem[]>([]);

  // Intelligence
  const [selectedMeetingId, setSelectedMeetingId] = useState("");
  const [transcriptText, setTranscriptText] = useState("");
  const [meetingQuestion, setMeetingQuestion] = useState("");
  const [meetingAnswer, setMeetingAnswer] = useState("");
  const [meetingCitations, setMeetingCitations] = useState<string[]>([]);
  const [meetingReport, setMeetingReport] = useState<MeetingIntelligenceReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [askingQuestion, setAskingQuestion] = useState(false);

  // Availability
  const [availabilityStart, setAvailabilityStart] = useState(() => toDateTimeLocalValue(new Date()));
  const [availabilityEnd, setAvailabilityEnd] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 7); return toDateTimeLocalValue(d);
  });
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [busySlots, setBusySlots] = useState<Array<{ start: string; end: string }>>([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [ts, mr] = await Promise.all([fetchGoogleTokenStatus(), fetchMeetRequests()]);
      setTokenStatus(ts); setMeetRequests(mr);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load meeting dashboard."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const rows = await fetchGoals();
        if (c) return;
        const approved = rows.filter((i) => i.status === "approved" || i.status === "submitted");
        setGoals(approved);
        setLinkedGoalIds((cur) => cur.filter((id) => approved.some((g) => g.$id === id)));
      } catch { if (!c) setGoals([]); }
    })();
    return () => { c = true; };
  }, []);

  useEffect(() => {
    if (!selectedMeetingId) { setMeetingReport(null); setTranscriptText(""); setMeetingAnswer(""); setMeetingCitations([]); return; }
    let c = false;
    (async () => {
      setLoadingReport(true);
      try { const p = await fetchMeetingIntelligence(selectedMeetingId); if (!c) { setMeetingReport(p.report || null); setTranscriptText(p.report?.transcriptText || ""); } }
      catch { if (!c) setMeetingReport(null); }
      finally { if (!c) setLoadingReport(false); }
    })();
    return () => { c = true; };
  }, [selectedMeetingId]);

  const stats = useMemo(() => {
    const pending = meetRequests.filter((i) => i.status === "pending").length;
    const scheduled = meetRequests.filter((i) => i.status === "scheduled").length;
    const rejected = meetRequests.filter((i) => i.status === "rejected").length;
    return { total: meetRequests.length, pending, scheduled, rejected };
  }, [meetRequests]);

  const selectedSlot = useMemo(() => {
    const s = toIsoFromDateTimeLocal(proposedStart), e = toIsoFromDateTimeLocal(proposedEnd);
    return s && e ? { start: s, end: e } : null;
  }, [proposedEnd, proposedStart]);

  const availabilityRange = useMemo(() => ({
    start: toIsoFromDateTimeLocal(availabilityStart),
    end: toIsoFromDateTimeLocal(availabilityEnd),
  }), [availabilityEnd, availabilityStart]);

  const scheduledMeetings = useMemo(() => meetRequests.filter((i) => i.status === "scheduled"), [meetRequests]);
  const scheduledMeetingOptions = useMemo(() => scheduledMeetings.map((i) => ({
    value: i.$id,
    label: `${i.title} (${formatDate(i.scheduledStartTime || i.startTime || i.requestedAt)})`,
  })), [scheduledMeetings]);

  const isConnected = tokenStatus?.connected && tokenStatus?.reason !== "expired";

  async function handleConnectGoogle() { setError(""); setSuccess(""); setConnectingGoogle(true); window.location.href = "/api/google/connect"; }

  async function handleSubmitRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSuccess("");
    if (!isConnected) { setError("Connect Google Calendar first."); return; }
    if (!proposedStart || !proposedEnd) { setError("Provide start and end time."); return; }
    const sIso = new Date(proposedStart).toISOString(), eIso = new Date(proposedEnd).toISOString();
    if (new Date(eIso).valueOf() <= new Date(sIso).valueOf()) { setError("End time must be after start time."); return; }
    setSubmitting(true);
    try {
      await createMeetRequest({ title, description, proposedStartTime: sIso, proposedEndTime: eIso, timeZone: DEFAULT_TIMEZONE, linkedGoalIds, meetingType });
      setSuccess("Meeting request submitted!"); setDescription(""); setProposedStart(""); setProposedEnd(""); await loadDashboard();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to submit request."); }
    finally { setSubmitting(false); }
  }

  async function handleCheckAvailability() {
    setError(""); setSuccess("");
    if (!isConnected) { setError("Connect Google Calendar first."); return; }
    const sIso = toIsoFromDateTimeLocal(availabilityStart), eIso = toIsoFromDateTimeLocal(availabilityEnd);
    if (!sIso || !eIso || new Date(eIso).valueOf() <= new Date(sIso).valueOf()) { setError("Provide a valid range."); return; }
    setCheckingAvailability(true);
    try {
      const ctx = await fetchCurrentUserContext();
      const eid = String(ctx?.profile?.$id || "").trim();
      if (!eid) { setError("Unable to identify current user."); return; }
      const fb = await fetchEmployeeFreeBusy({ employeeId: eid, startDate: sIso, endDate: eIso, timeZone: DEFAULT_TIMEZONE });
      setBusySlots((fb?.busy || []).map((s) => ({ start: s.start, end: s.end })));
      setSuccess("Availability loaded. Click a free slot to select it.");
    } catch (err) { setBusySlots([]); setError(err instanceof Error ? err.message : "Unable to load availability."); }
    finally { setCheckingAvailability(false); }
  }

  function handleSelectSlot(start: string, end: string) {
    setProposedStart(toDateTimeLocalValue(start)); setProposedEnd(toDateTimeLocalValue(end));
  }

  async function handleGenerateIntelligence() {
    setError(""); setSuccess("");
    if (!selectedMeetingId) { setError("Select a meeting first."); return; }
    if (!transcriptText.trim()) { setError("Paste transcript first."); return; }
    setGeneratingReport(true);
    try {
      const p = await generateMeetingIntelligence(selectedMeetingId, { transcriptText, transcriptSource: "google_meet_or_manual" });
      setMeetingReport(p.report || null); setSuccess("Intelligence generated."); await loadDashboard();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to generate intelligence."); }
    finally { setGeneratingReport(false); }
  }

  async function handleAskQuestion() {
    setError(""); setSuccess("");
    if (!selectedMeetingId || !meetingQuestion.trim()) { setError("Select meeting and enter a question."); return; }
    setAskingQuestion(true);
    try {
      const p = await askMeetingQuestion(selectedMeetingId, meetingQuestion);
      setMeetingAnswer(p.answer || ""); setMeetingCitations(p.citations || []);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to answer question."); }
    finally { setAskingQuestion(false); }
  }

  async function handleDownloadReport() {
    if (!selectedMeetingId) { setError("Select a meeting first."); return; }
    try { await downloadMeetingReport(selectedMeetingId); setSuccess("Download started."); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to download report."); }
  }

  return (
    <Container>
      <Stack gap="5" className="fade-in">
        <PageHeader
          title="Meetings"
          subtitle="Request meetings, check availability, and review meeting intelligence."
          actions={<Button variant="secondary" onClick={loadDashboard} disabled={loading}>Refresh</Button>}
        />

        {error && <Alert variant="error" title="Error" description={error} onDismiss={() => setError("")} />}
        {success && <Alert variant="success" title="Done" description={success} onDismiss={() => setSuccess("")} />}

        {/* ── Stats + Connection ──────────────────────────────────────── */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4 stagger-in">
          {[
            { label: "Total", value: stats.total, color: "var(--color-text)" },
            { label: "Pending", value: stats.pending, color: "var(--color-warning)" },
            { label: "Scheduled", value: stats.scheduled, color: "var(--color-success)" },
            { label: "Rejected", value: stats.rejected, color: "var(--color-danger)" },
          ].map((c) => (
            <div key={c.label} className="glass-stat rounded-[var(--radius-md)] p-4" style={{ borderLeftWidth: 4, borderLeftColor: c.color }}>
              <p className="caption text-[var(--color-text-muted)]">{c.label}</p>
              <p className="heading-xl mt-1" style={{ color: c.color }}>{loading ? "..." : c.value}</p>
            </div>
          ))}
        </div>

        {/* Google connection — compact */}
        <div className="glass rounded-[var(--radius-md)] px-5 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`h-3 w-3 rounded-full ${isConnected ? "bg-[var(--color-success)]" : "bg-[var(--color-warning)]"}`} />
            <div>
              <p className="body-sm font-medium text-[var(--color-text)]">
                Google Calendar — {isConnected ? "Connected" : "Not Connected"}
              </p>
              {tokenStatus?.email && <p className="caption text-[var(--color-text-muted)]">{tokenStatus.email}</p>}
            </div>
          </div>
          <Button size="sm" variant={isConnected ? "secondary" : "primary"} onClick={handleConnectGoogle} disabled={connectingGoogle}>
            {connectingGoogle ? "Redirecting..." : isConnected ? "Reconnect" : "Connect Google"}
          </Button>
        </div>

        {/* ── Tab switcher ────────────────────────────────────────────── */}
        <div className="flex gap-2">
          {(["request", "intelligence"] as ActiveTab[]).map((tab) => {
            const active = activeTab === tab;
            const label = tab === "request" ? "Request Meeting" : "Meeting Intelligence";
            return (
              <button key={tab} type="button" onClick={() => setActiveTab(tab)}
                className={`rounded-full px-5 py-2 body-sm font-medium transition-all duration-200 ${active ? "pill-active" : "glass-subtle text-[var(--color-text-muted)] hover:text-[var(--color-text)] glow-ring"}`}
              >{label}</button>
            );
          })}
        </div>

        {/* ── Request Meeting Tab ─────────────────────────────────────── */}
        {activeTab === "request" && (
          <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
            {/* Left — Form */}
            <div className="glass rounded-[var(--radius-lg)] p-6">
              <p className="heading-lg text-[var(--color-text)] mb-1">New Meeting Request</p>
              <p className="caption text-[var(--color-text-muted)] mb-5">Fill in details and pick a time slot from your calendar.</p>

              <form onSubmit={handleSubmitRequest}>
                <Stack gap="4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <Input label="Meeting title" value={title} onChange={(e) => setTitle(e.target.value)} required />
                    <Select
                      label="Type"
                      value={meetingType}
                      onChange={(e) => setMeetingType(e.target.value === "group" ? "group" : "individual")}
                      options={[{ value: "individual", label: "Individual" }, { value: "group", label: "Group" }]}
                    />
                  </div>

                  <Textarea label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />

                  {goals.length > 0 && (
                    <div className="glass-subtle rounded-[var(--radius-sm)] p-3">
                      <p className="caption font-semibold text-[var(--color-text)] mb-2">Link to goals</p>
                      <div className="space-y-1.5 max-h-[140px] overflow-auto">
                        {goals.map((goal) => (
                          <Checkbox
                            key={goal.$id}
                            label={goal.title}
                            description={`${goal.progressPercent || 0}% complete`}
                            checked={linkedGoalIds.includes(goal.$id)}
                            onChange={(e) => setLinkedGoalIds((cur) => e.target.checked ? [...new Set([...cur, goal.$id])] : cur.filter((id) => id !== goal.$id))}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="border-t border-[color-mix(in_srgb,var(--color-border)_50%,transparent)] pt-4">
                    <p className="body-sm font-semibold text-[var(--color-text)] mb-3">Schedule</p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Input label="Start" type="datetime-local" value={proposedStart} onChange={(e) => setProposedStart(e.target.value)} required />
                      <Input label="End" type="datetime-local" value={proposedEnd} onChange={(e) => setProposedEnd(e.target.value)} required />
                    </div>
                  </div>

                  <Button type="submit" loading={submitting} disabled={!isConnected}>
                    Submit Request
                  </Button>
                </Stack>
              </form>
            </div>

            {/* Right — Calendar + Upcoming */}
            <Stack gap="4">
              <div className="glass rounded-[var(--radius-lg)] p-5">
                <p className="body-sm font-semibold text-[var(--color-text)] mb-3">Check Availability</p>
                <div className="grid gap-2 grid-cols-2 mb-3">
                  <Input label="From" type="datetime-local" value={availabilityStart} onChange={(e) => setAvailabilityStart(e.target.value)} />
                  <Input label="To" type="datetime-local" value={availabilityEnd} onChange={(e) => setAvailabilityEnd(e.target.value)} />
                </div>
                <Button variant="secondary" size="sm" onClick={handleCheckAvailability} disabled={!isConnected} loading={checkingAvailability} className="mb-3">
                  Load Calendar
                </Button>

                {!checkingAvailability && busySlots.length === 0 && (
                  <div className="glass-subtle rounded-[var(--radius-sm)] p-4 text-center">
                    <p className="caption text-[var(--color-text-muted)]">Set a range and click Load Calendar to see your free/busy slots.</p>
                  </div>
                )}
                {checkingAvailability && <Skeleton variant="rect" className="h-[200px] w-full rounded-[var(--radius-sm)]" />}

                <div className="availability-calendar-shell max-h-[50vh] overflow-auto rounded-[var(--radius-sm)]">
                  <AvailabilityCalendar
                    busySlots={busySlots}
                    selectedSlot={selectedSlot}
                    loading={checkingAvailability}
                    range={availabilityRange}
                    onSelectSlot={handleSelectSlot}
                  />
                </div>
              </div>

              {/* Upcoming meetings */}
              <div className="glass rounded-[var(--radius-lg)] p-5">
                <p className="body-sm font-semibold text-[var(--color-text)] mb-3">
                  Upcoming Meetings
                  {scheduledMeetings.length > 0 && <span className="ml-2 caption text-[var(--color-text-muted)]">({scheduledMeetings.length})</span>}
                </p>
                {loading && <Skeleton variant="rect" className="h-[60px] w-full rounded-[var(--radius-sm)]" />}
                {!loading && scheduledMeetings.length === 0 && (
                  <div className="glass-subtle rounded-[var(--radius-sm)] p-4 text-center">
                    <p className="caption text-[var(--color-text-muted)]">No upcoming meetings.</p>
                  </div>
                )}
                <div className="space-y-2 max-h-[240px] overflow-auto">
                  {scheduledMeetings.map((item) => (
                    <div key={item.$id} className="glass-subtle rounded-[var(--radius-sm)] px-3.5 py-2.5 flex items-center justify-between gap-2 transition-all duration-150 hover:shadow-[var(--shadow-sm)]">
                      <div>
                        <p className="body-sm font-medium text-[var(--color-text)]">{item.title}</p>
                        <p className="caption text-[var(--color-text-muted)]">{formatDate(item.scheduledStartTime || (item as unknown as { startTime?: string }).startTime || item.requestedAt)}</p>
                      </div>
                      <Badge variant="success">Scheduled</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </Stack>
          </div>
        )}

        {/* ── Intelligence Tab ────────────────────────────────────────── */}
        {activeTab === "intelligence" && (
          <div className="glass rounded-[var(--radius-lg)] p-6">
            <p className="heading-lg text-[var(--color-text)] mb-1">Meeting Intelligence</p>
            <p className="caption text-[var(--color-text-muted)] mb-5">Select a scheduled meeting, paste the transcript, and generate AI insights.</p>

            <Stack gap="4">
              <Select
                label="Scheduled meeting"
                value={selectedMeetingId}
                onChange={(e) => setSelectedMeetingId(e.target.value)}
                options={scheduledMeetingOptions}
                placeholder="Select a meeting..."
              />
              {loadingReport && <p className="caption text-[var(--color-text-muted)]">Loading intelligence...</p>}

              <Textarea
                label="Transcript"
                rows={6}
                value={transcriptText}
                onChange={(e) => setTranscriptText(e.target.value)}
                placeholder="Paste transcript from Google Meet or other source..."
              />

              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={handleGenerateIntelligence} loading={generatingReport} disabled={!selectedMeetingId}>
                  Generate AI Summary
                </Button>
                <Button variant="ghost" onClick={handleDownloadReport} disabled={!selectedMeetingId}>
                  Download Report
                </Button>
              </div>

              {meetingReport && (
                <div className="glass-subtle rounded-[var(--radius-md)] p-5 space-y-3" style={{ animation: "slideUp 0.25s ease-out both" }}>
                  <div>
                    <p className="body-sm font-semibold text-[var(--color-text)]">Summary</p>
                    <p className="body-sm text-[var(--color-text-muted)] mt-1 leading-relaxed">{meetingReport.summary}</p>
                  </div>
                  {meetingReport.keyTakeaways?.length > 0 && (
                    <div>
                      <p className="body-sm font-semibold text-[var(--color-text)] mb-1">Key Takeaways</p>
                      <ul className="space-y-1">
                        {meetingReport.keyTakeaways.map((item) => (
                          <li key={item} className="flex items-start gap-2 caption text-[var(--color-text-muted)]">
                            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-primary)]" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="border-t border-[color-mix(in_srgb,var(--color-border)_50%,transparent)] pt-4">
                <p className="body-sm font-semibold text-[var(--color-text)] mb-3">Ask a question about this meeting</p>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      label=""
                      value={meetingQuestion}
                      onChange={(e) => setMeetingQuestion(e.target.value)}
                      placeholder="What were my action items?"
                    />
                  </div>
                  <Button variant="secondary" onClick={handleAskQuestion} loading={askingQuestion} disabled={!selectedMeetingId} className="self-end">
                    Ask AI
                  </Button>
                </div>

                {meetingAnswer && (
                  <div className="glass-subtle rounded-[var(--radius-sm)] p-4 mt-3" style={{ animation: "slideUp 0.2s ease-out both" }}>
                    <p className="body-sm text-[var(--color-text)]">{meetingAnswer}</p>
                    {meetingCitations.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {meetingCitations.map((c) => (
                          <p key={c} className="caption text-[var(--color-text-muted)] italic">{c}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Stack>
          </div>
        )}

        {/* ── Request History ─────────────────────────────────────────── */}
        <div className="glass rounded-[var(--radius-lg)] p-5">
          <p className="heading-lg text-[var(--color-text)] mb-1">Request History</p>
          <p className="caption text-[var(--color-text-muted)] mb-4">All meeting requests and their current status.</p>

          {loading && <Skeleton variant="rect" className="h-[80px] w-full rounded-[var(--radius-sm)]" />}
          {!loading && meetRequests.length === 0 && (
            <div className="glass-subtle rounded-[var(--radius-sm)] p-6 text-center">
              <p className="caption text-[var(--color-text-muted)]">No meeting requests yet. Create your first one above.</p>
            </div>
          )}
          {!loading && meetRequests.length > 0 && (
            <div className="space-y-2 max-h-[320px] overflow-auto">
              {meetRequests.map((item) => (
                <div
                  key={item.$id}
                  className="glass-subtle rounded-[var(--radius-sm)] px-4 py-3 flex items-center justify-between gap-3 transition-all duration-150 hover:shadow-[var(--shadow-sm)]"
                  style={{ borderLeftWidth: 3, borderLeftColor: item.status === "scheduled" ? "var(--color-success)" : item.status === "rejected" ? "var(--color-danger)" : "var(--color-warning)" }}
                >
                  <div>
                    <p className="body-sm font-medium text-[var(--color-text)]">{item.title}</p>
                    <p className="caption text-[var(--color-text-muted)]">
                      {formatDate(item.requestedAt)}
                      {item.meetingType === "group" ? " · Group" : ""}
                      {item.linkedGoalIds?.length ? ` · ${item.linkedGoalIds.length} goal${item.linkedGoalIds.length > 1 ? "s" : ""}` : ""}
                    </p>
                  </div>
                  <Badge variant={item.status === "scheduled" ? "success" : item.status === "rejected" ? "danger" : "info"}>
                    {item.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </Stack>
    </Container>
  );
}

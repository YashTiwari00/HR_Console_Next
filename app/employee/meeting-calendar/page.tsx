"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Grid, Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Card, Input, Textarea } from "@/src/components/ui";
import {
  createMeetRequest,
  fetchCalendarEvents,
  fetchCurrentUserContext,
  fetchEmployeeFreeBusy,
  fetchGoogleTokenStatus,
  fetchMeetRequests,
  formatDate,
  GoogleTokenStatus,
  MeetRequestItem,
} from "@/app/employee/_lib/pmsClient";
import AvailabilityCalendar from "@/components/calendar/AvailabilityCalendar";

const DEFAULT_TIMEZONE = "UTC";

function formatTimeRange(start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.valueOf()) || Number.isNaN(endDate.valueOf())) {
    return "Invalid time";
  }

  const formatter = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return `${formatter.format(startDate)} - ${formatter.format(endDate)}`;
}

function startOfWeek(date: Date) {
  const result = new Date(date);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function toDateTimeLocalValue(input: string | Date) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.valueOf())) return "";
  const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
}

function toIsoFromDateTimeLocal(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  return date.toISOString();
}

export default function EmployeeMeetingCalendarDashboardPage() {
  const [tokenStatus, setTokenStatus] = useState<GoogleTokenStatus | null>(null);
  const [meetRequests, setMeetRequests] = useState<MeetRequestItem[]>([]);
  const [events, setEvents] = useState<
    Array<{ eventId: string; title: string; startTime: string; endTime: string; meetLink: string }>
  >([]);

  const [title, setTitle] = useState("1:1 Meeting Request");
  const [description, setDescription] = useState("");
  const [proposedStart, setProposedStart] = useState("");
  const [proposedEnd, setProposedEnd] = useState("");
  const [availabilityStart, setAvailabilityStart] = useState(() => toDateTimeLocalValue(new Date()));
  const [availabilityEnd, setAvailabilityEnd] = useState(() => {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    return toDateTimeLocalValue(nextWeek);
  });
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [busySlots, setBusySlots] = useState<Array<{ start: string; end: string }>>([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [nextTokenStatus, nextMeetRequests] = await Promise.all([
        fetchGoogleTokenStatus(),
        fetchMeetRequests(),
      ]);

      setTokenStatus(nextTokenStatus);
      setMeetRequests(nextMeetRequests);

      if (!nextTokenStatus?.connected) {
        setEvents([]);
        return;
      }

      const now = new Date();
      const nextWeek = new Date(now);
      nextWeek.setDate(nextWeek.getDate() + 7);

      const calendar = await fetchCalendarEvents({
        startDate: now.toISOString(),
        endDate: nextWeek.toISOString(),
        timeZone: DEFAULT_TIMEZONE,
        maxResults: 100,
      });

      setEvents(
        (calendar?.events || []).map((item) => ({
          eventId: item.eventId,
          title: item.title,
          startTime: item.startTime,
          endTime: item.endTime,
          meetLink: item.meetLink,
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load meeting calendar dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const stats = useMemo(() => {
    const pending = meetRequests.filter((item) => item.status === "pending").length;
    const scheduled = meetRequests.filter((item) => item.status === "scheduled").length;
    const rejected = meetRequests.filter((item) => item.status === "rejected").length;

    const weekStart = startOfWeek(new Date());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const weeklyRequests = meetRequests.filter((item) => {
      const requestedAt = new Date(item.requestedAt);
      if (Number.isNaN(requestedAt.valueOf())) return false;
      return requestedAt >= weekStart && requestedAt < weekEnd;
    }).length;

    return {
      total: meetRequests.length,
      pending,
      scheduled,
      rejected,
      weeklyRequests,
    };
  }, [meetRequests]);

  const rankingRows = useMemo(
    () => [
      { label: "Scheduled ratio", value: meetRequests.length ? Math.round((stats.scheduled / meetRequests.length) * 100) : 0 },
      { label: "Pending ratio", value: meetRequests.length ? Math.round((stats.pending / meetRequests.length) * 100) : 0 },
      { label: "Rejected ratio", value: meetRequests.length ? Math.round((stats.rejected / meetRequests.length) * 100) : 0 },
    ],
    [meetRequests.length, stats.pending, stats.rejected, stats.scheduled]
  );

  const selectedSlot = useMemo(() => {
    const start = toIsoFromDateTimeLocal(proposedStart);
    const end = toIsoFromDateTimeLocal(proposedEnd);
    if (!start || !end) return null;
    return { start, end };
  }, [proposedEnd, proposedStart]);

  const availabilityRange = useMemo(
    () => ({
      start: toIsoFromDateTimeLocal(availabilityStart),
      end: toIsoFromDateTimeLocal(availabilityEnd),
    }),
    [availabilityEnd, availabilityStart]
  );

  async function handleConnectGoogle() {
    setError("");
    setSuccess("");
    setConnectingGoogle(true);
    window.location.href = "/api/google/connect";
  }

  async function handleSubmitRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!tokenStatus?.connected) {
      setError("Connect Google Calendar before creating a meeting request.");
      return;
    }

    if (!proposedStart || !proposedEnd) {
      setError("Provide proposed start and end time.");
      return;
    }

    const startIso = new Date(proposedStart).toISOString();
    const endIso = new Date(proposedEnd).toISOString();

    if (new Date(endIso).valueOf() <= new Date(startIso).valueOf()) {
      setError("Proposed end time must be after start time.");
      return;
    }

    setSubmitting(true);
    try {
      await createMeetRequest({
        title,
        description,
        proposedStartTime: startIso,
        proposedEndTime: endIso,
        timeZone: DEFAULT_TIMEZONE,
      });

      setSuccess("Meeting request submitted successfully.");
      setDescription("");
      setProposedStart("");
      setProposedEnd("");
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit meeting request.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCheckAvailability() {
    setError("");
    setSuccess("");

    if (!tokenStatus?.connected) {
      setError("Connect Google Calendar before checking availability.");
      return;
    }

    const startIso = toIsoFromDateTimeLocal(availabilityStart);
    const endIso = toIsoFromDateTimeLocal(availabilityEnd);
    if (!startIso || !endIso || new Date(endIso).valueOf() <= new Date(startIso).valueOf()) {
      setError("Provide a valid availability range.");
      return;
    }

    setCheckingAvailability(true);
    try {
      const ctx = await fetchCurrentUserContext();
      const employeeId = String(ctx?.profile?.$id || "").trim();
      if (!employeeId) {
        setError("Unable to identify current user for availability lookup.");
        return;
      }

      const freebusy = await fetchEmployeeFreeBusy({
        employeeId,
        startDate: startIso,
        endDate: endIso,
        timeZone: DEFAULT_TIMEZONE,
      });

      setBusySlots((freebusy?.busy || []).map((slot) => ({ start: slot.start, end: slot.end })));
      setSuccess("Availability loaded. Select a free slot below.");
    } catch (err) {
      setBusySlots([]);
      setError(err instanceof Error ? err.message : "Unable to load availability.");
    } finally {
      setCheckingAvailability(false);
    }
  }

  function handleSelectSlot(start: string, end: string) {
    setProposedStart(toDateTimeLocalValue(start));
    setProposedEnd(toDateTimeLocalValue(end));
  }

  return (
    <Stack gap="4">
      <PageHeader
        title="Meeting & Calendar Dashboard"
        subtitle="Track your calendar, requests, approvals status, and meeting trends in one place."
        actions={
          <Button variant="secondary" onClick={loadDashboard} disabled={loading}>
            Refresh
          </Button>
        }
      />

      {error && (
        <Alert
          variant="error"
          title="Unable to continue"
          description={error}
          onDismiss={() => setError("")}
        />
      )}
      {success && (
        <Alert
          variant="success"
          title="Success"
          description={success}
          onDismiss={() => setSuccess("")}
        />
      )}

      <Grid cols={1} colsMd={3} gap="3">
        <Card title="Total Requests">
          <p className="heading-xl">{loading ? "..." : stats.total}</p>
        </Card>
        <Card title="Scheduled Meetings">
          <p className="heading-xl">{loading ? "..." : stats.scheduled}</p>
        </Card>
        <Card title="This Week Requests">
          <p className="heading-xl">{loading ? "..." : stats.weeklyRequests}</p>
        </Card>
      </Grid>

      <Grid cols={1} colsLg={2} gap="3">
        <Card title="Team Goal Assignment" description="Your Google Calendar connection status for meetings.">
          <Stack gap="2">
            <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="body-sm text-[var(--color-text)]">Calendar connection</p>
                <Badge variant={tokenStatus?.connected ? "success" : "warning"}>
                  {tokenStatus?.connected ? "Connected" : "Not Connected"}
                </Badge>
              </div>
              {tokenStatus?.email && <p className="caption mt-1">{tokenStatus.email}</p>}
              {tokenStatus?.expiresAt && <p className="caption mt-1">Expires: {formatDate(tokenStatus.expiresAt)}</p>}
            </div>
            <Button variant="secondary" onClick={handleConnectGoogle} disabled={connectingGoogle}>
              {connectingGoogle ? "Redirecting..." : "Connect Google Calendar"}
            </Button>
          </Stack>
        </Card>

        <Card title="Team Progress Overview" description="Status breakdown of your meeting requests.">
          <Stack gap="2">
            <div className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2">
              <p className="caption">Pending</p>
              <p className="body-sm">{loading ? "..." : stats.pending}</p>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2">
              <p className="caption">Scheduled</p>
              <p className="body-sm">{loading ? "..." : stats.scheduled}</p>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2">
              <p className="caption">Rejected</p>
              <p className="body-sm">{loading ? "..." : stats.rejected}</p>
            </div>
          </Stack>
        </Card>

        <Card title="Team Ranking & Graph" description="Simple trend bars for your meeting request outcomes.">
          <Stack gap="2">
            {rankingRows.map((row) => (
              <div
                key={row.label}
                className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="body-sm text-[var(--color-text)]">{row.label}</p>
                  <p className="caption">{row.value}%</p>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-[var(--color-border)]">
                  <div
                    className="h-full rounded-full bg-[var(--color-primary)]"
                    style={{ width: `${Math.max(8, row.value)}%` }}
                  />
                </div>
              </div>
            ))}
          </Stack>
        </Card>

        <Card title="Team Approvals" description="Manager decisions on your requests.">
          <Stack gap="2">
            {!loading && meetRequests.length === 0 && <p className="caption">No meeting requests yet.</p>}
            {meetRequests.slice(0, 6).map((item) => (
              <div
                key={item.$id}
                className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="body-sm text-[var(--color-text)]">{item.title}</p>
                  <Badge variant={item.status === "scheduled" ? "success" : item.status === "rejected" ? "warning" : "info"}>
                    {item.status}
                  </Badge>
                </div>
                <p className="caption mt-1">Requested: {formatDate(item.requestedAt)}</p>
              </div>
            ))}
          </Stack>
        </Card>
      </Grid>

      <Grid cols={1} colsLg={2} gap="3">
        <Card title="Calendar Events" description="Your upcoming calendar events for the next 7 days.">
          <Stack gap="2">
            {tokenStatus?.connected ? null : (
              <p className="caption">Connect Google Calendar to load events.</p>
            )}
            {tokenStatus?.connected && !loading && events.length === 0 && (
              <p className="caption">No events in next 7 days.</p>
            )}
            {events.map((eventItem) => (
              <div
                key={eventItem.eventId || `${eventItem.title}-${eventItem.startTime}`}
                className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="body-sm text-[var(--color-text)]">{eventItem.title || "Untitled event"}</p>
                  <Badge variant="info">{formatTimeRange(eventItem.startTime, eventItem.endTime)}</Badge>
                </div>
                {eventItem.meetLink && (
                  <a
                    className="caption mt-2 inline-block text-[var(--color-primary)] underline"
                    href={eventItem.meetLink}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Google Meet
                  </a>
                )}
              </div>
            ))}
          </Stack>
        </Card>

        <Card title="Request Meeting" description="Create a new meeting request for your manager.">
          <form className="space-y-3" onSubmit={handleSubmitRequest}>
            <div className="grid gap-3 md:grid-cols-3">
              <Input
                label="Availability start"
                type="datetime-local"
                value={availabilityStart}
                onChange={(event) => setAvailabilityStart(event.target.value)}
              />
              <Input
                label="Availability end"
                type="datetime-local"
                value={availabilityEnd}
                onChange={(event) => setAvailabilityEnd(event.target.value)}
              />
              <div className="md:pt-6">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleCheckAvailability}
                  disabled={!tokenStatus?.connected}
                  loading={checkingAvailability}
                >
                  Check Availability
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="body-sm text-[var(--color-text)]">Select Time Slot</p>
              <AvailabilityCalendar
                busySlots={busySlots}
                selectedSlot={selectedSlot}
                loading={checkingAvailability}
                range={availabilityRange}
                onSelectSlot={handleSelectSlot}
              />
            </div>

            <Input
              label="Meeting title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
            <Textarea
              label="Description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
            />
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                label="Proposed start"
                type="datetime-local"
                value={proposedStart}
                onChange={(event) => setProposedStart(event.target.value)}
                required
              />
              <Input
                label="Proposed end"
                type="datetime-local"
                value={proposedEnd}
                onChange={(event) => setProposedEnd(event.target.value)}
                required
              />
            </div>
            <Button type="submit" loading={submitting} disabled={!tokenStatus?.connected}>
              Submit Request
            </Button>
          </form>
        </Card>
      </Grid>
    </Stack>
  );
}

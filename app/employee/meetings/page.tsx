"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Card, Input } from "@/src/components/ui";
import {
  CalendarEventItem,
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
const CALENDAR_WINDOW_DAYS = 7;

function formatCalendarDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Unknown date";

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatCalendarTimeRange(start: string, end: string) {
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

function groupEventsByDate(events: CalendarEventItem[]) {
  const sorted = [...events].sort(
    (a, b) => new Date(a.startTime).valueOf() - new Date(b.startTime).valueOf()
  );
  const groups = new Map<string, CalendarEventItem[]>();

  for (const item of sorted) {
    const key = formatCalendarDateLabel(item.startTime);
    const existing = groups.get(key) || [];
    existing.push(item);
    groups.set(key, existing);
  }

  return Array.from(groups.entries()).map(([label, items]) => ({
    label,
    items,
  }));
}

function getCalendarWindow() {
  const start = new Date();
  const end = new Date(start);
  end.setDate(end.getDate() + CALENDAR_WINDOW_DAYS);

  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  };
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

export default function EmployeeMeetingsPage() {
  const [tokenStatus, setTokenStatus] = useState<GoogleTokenStatus | null>(null);
  const [requests, setRequests] = useState<MeetRequestItem[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventItem[]>([]);
  const [calendarNotice, setCalendarNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [calendarWindow] = useState(() => getCalendarWindow());

  const [title, setTitle] = useState("1:1 Meeting Request");
  const [description, setDescription] = useState("");
  const [proposedStartTime, setProposedStartTime] = useState("");
  const [proposedEndTime, setProposedEndTime] = useState("");
  const [availabilityStart, setAvailabilityStart] = useState(() => toDateTimeLocalValue(new Date()));
  const [availabilityEnd, setAvailabilityEnd] = useState(() => {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    return toDateTimeLocalValue(nextWeek);
  });
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [busySlots, setBusySlots] = useState<Array<{ start: string; end: string }>>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    setCalendarNotice("");

    try {
      const [nextTokenStatus, nextRequests] = await Promise.all([
        fetchGoogleTokenStatus(),
        fetchMeetRequests(),
      ]);

      setTokenStatus(nextTokenStatus);
      setRequests(nextRequests);

      if (!nextTokenStatus?.connected) {
        setCalendarEvents([]);
        setCalendarNotice("Connect Google Calendar to load your personal calendar events.");
        return;
      }

      const nextCalendar = await fetchCalendarEvents({
          startDate: calendarWindow.startDate,
          endDate: calendarWindow.endDate,
          timeZone: DEFAULT_TIMEZONE,
          maxResults: 200,
        });

      setCalendarEvents(nextCalendar?.events || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load meeting data.");
    } finally {
      setLoading(false);
    }
  }, [calendarWindow.endDate, calendarWindow.startDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
      setError("Connect Google Calendar before submitting a meeting request.");
      return;
    }

    if (!proposedStartTime || !proposedEndTime) {
      setError("Please provide both proposed start and end time.");
      return;
    }

    setSubmitting(true);

    try {
      await createMeetRequest({
        title,
        description,
        proposedStartTime: new Date(proposedStartTime).toISOString(),
        proposedEndTime: new Date(proposedEndTime).toISOString(),
        timeZone: DEFAULT_TIMEZONE,
      });

      setSuccess("Meeting request submitted successfully.");
      setDescription("");
      setProposedStartTime("");
      setProposedEndTime("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit request.");
    } finally {
      setSubmitting(false);
    }
  }

  const upcomingMeetings = useMemo(
    () => requests.filter((item) => item.status === "scheduled"),
    [requests]
  );

  const groupedCalendarEvents = useMemo(
    () => groupEventsByDate(calendarEvents),
    [calendarEvents]
  );

  const selectedSlot = useMemo(() => {
    const start = toIsoFromDateTimeLocal(proposedStartTime);
    const end = toIsoFromDateTimeLocal(proposedEndTime);
    if (!start || !end) return null;
    return { start, end };
  }, [proposedEndTime, proposedStartTime]);

  const availabilityRange = useMemo(
    () => ({
      start: toIsoFromDateTimeLocal(availabilityStart),
      end: toIsoFromDateTimeLocal(availabilityEnd),
    }),
    [availabilityEnd, availabilityStart]
  );

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
    setProposedStartTime(toDateTimeLocalValue(start));
    setProposedEndTime(toDateTimeLocalValue(end));
  }

  return (
    <Stack gap="4">
      <PageHeader
        title="Meetings"
        subtitle="Request manager meetings and track scheduled Google Meet sessions."
        actions={
          <Button variant="secondary" onClick={loadData} disabled={loading}>
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="error" title="Unable to continue" description={error} onDismiss={() => setError("")} />}
      {success && <Alert variant="success" title="Success" description={success} onDismiss={() => setSuccess("")} />}

      <Card title="Google Connection" description="Employees must connect Google before sending meeting requests.">
        <div className="flex items-center justify-between gap-2">
          <p className="body-sm">Connection status</p>
          <Badge variant={tokenStatus?.connected ? "success" : "warning"}>
            {loading
              ? "loading"
              : tokenStatus?.connected
              ? tokenStatus.reason === "expired"
                ? "Connected (Expired) ⚠"
                : "Connected ✅"
              : "Not Connected ❌"}
          </Badge>
        </div>
        {tokenStatus?.email && <p className="caption mt-2">Connected email: {tokenStatus.email}</p>}
        {tokenStatus?.expiresAt && <p className="caption mt-1">Expires: {formatDate(tokenStatus.expiresAt)}</p>}
        <div className="mt-3 flex items-center gap-2">
          <Button variant="secondary" onClick={handleConnectGoogle} disabled={connectingGoogle}>
            {connectingGoogle
              ? "Redirecting..."
              : tokenStatus?.connected
              ? "Reconnect Google Calendar"
              : "Connect Google Calendar"}
          </Button>
          <Button variant="ghost" onClick={loadData} disabled={loading}>
            Refresh Status
          </Button>
        </div>
      </Card>

      <Card
        title="Calendar (Next 7 Days)"
        description="Your upcoming events are grouped by date for a simple week view."
      >
        <Stack gap="3">
          {loading && <p className="caption">Loading calendar events...</p>}
          {!loading && calendarNotice && <p className="caption">{calendarNotice}</p>}
          {!loading && !calendarNotice && groupedCalendarEvents.length === 0 && (
            <p className="caption">No calendar events in the next 7 days.</p>
          )}

          {groupedCalendarEvents.map((group) => (
            <div key={group.label} className="space-y-2">
              <p className="caption font-semibold text-[var(--color-text)]">{group.label}</p>
              {group.items.map((event) => (
                <div
                  key={event.eventId || `${event.title}-${event.startTime}`}
                  className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="body-sm text-[var(--color-text)]">{event.title || "Untitled event"}</p>
                    <Badge variant="info">{formatCalendarTimeRange(event.startTime, event.endTime)}</Badge>
                  </div>
                  {event.meetLink && (
                    <a
                      className="caption mt-2 inline-block text-[var(--color-primary)] underline"
                      href={event.meetLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open Google Meet
                    </a>
                  )}
                </div>
              ))}
            </div>
          ))}
        </Stack>
      </Card>

      <Card title="Request a Meeting" description="Only employees can create requests. Manager schedules the final meeting.">
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

          <label className="block">
            <span className="caption">Title</span>
            <input
              className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 body-sm"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </label>

          <label className="block">
            <span className="caption">Description</span>
            <textarea
              className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 body-sm"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="caption">Proposed start</span>
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 body-sm"
                value={proposedStartTime}
                onChange={(event) => setProposedStartTime(event.target.value)}
                required
              />
            </label>

            <label className="block">
              <span className="caption">Proposed end</span>
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 body-sm"
                value={proposedEndTime}
                onChange={(event) => setProposedEndTime(event.target.value)}
                required
              />
            </label>
          </div>

          <Button type="submit" disabled={submitting || !tokenStatus?.connected}>
            {submitting ? "Submitting..." : "Submit Request"}
          </Button>
        </form>
      </Card>

      <Card title="Upcoming Meetings" description="Scheduled meetings from manager actions.">
        <Stack gap="2">
          {!loading && upcomingMeetings.length === 0 && <p className="caption">No scheduled meetings yet.</p>}
          {upcomingMeetings.map((item) => (
            <div
              key={item.$id}
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="body-sm text-[var(--color-text)]">{item.title}</p>
                <Badge variant="success">scheduled</Badge>
              </div>
              <p className="caption mt-1">{formatDate(item.scheduledStartTime || item.requestedAt)}</p>
              {item.meetLink && (
                <a
                  className="caption mt-2 inline-block text-[var(--color-primary)] underline"
                  href={item.meetLink}
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

      <Card title="Request History" description="All submitted requests and manager decisions.">
        <Stack gap="2">
          {!loading && requests.length === 0 && <p className="caption">No meeting requests yet.</p>}
          {requests.map((item) => (
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
    </Stack>
  );
}

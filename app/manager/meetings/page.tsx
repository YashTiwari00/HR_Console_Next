"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  Modal,
  Select,
  Textarea,
} from "@/src/components/ui";
import {
  CalendarEventItem,
  createManagerDirectMeeting,
  fetchCalendarEvents,
  fetchEmployeeFreeBusy,
  fetchGoogleTokenStatus,
  fetchMeetRequests,
  fetchTeamMembers,
  formatDate,
  GoogleTokenStatus,
  MeetRequestItem,
  TeamMemberItem,
  updateMeetRequestAction,
} from "@/app/employee/_lib/pmsClient";
import AvailabilityCalendar from "@/components/calendar/AvailabilityCalendar";

const DEFAULT_TIMEZONE = "UTC";
const CALENDAR_WINDOW_DAYS = 7;
const SLOT_DURATION_MINUTES = 60;
const WORKDAY_START_HOUR = 9;
const WORKDAY_END_HOUR = 18;

type TimeSlot = {
  start: string;
  end: string;
};

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

function groupSlotsByDate(slots: TimeSlot[]) {
  const sorted = [...slots].sort(
    (a, b) => new Date(a.start).valueOf() - new Date(b.start).valueOf()
  );
  const groups = new Map<string, TimeSlot[]>();

  for (const slot of sorted) {
    const key = formatCalendarDateLabel(slot.start);
    const existing = groups.get(key) || [];
    existing.push(slot);
    groups.set(key, existing);
  }

  return Array.from(groups.entries()).map(([label, items]) => ({
    label,
    items,
  }));
}

function buildCalendarWindow() {
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

function buildDefaultAvailabilityWindow() {
  const start = new Date();
  start.setHours(WORKDAY_START_HOUR, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + CALENDAR_WINDOW_DAYS);
  end.setHours(WORKDAY_END_HOUR, 0, 0, 0);

  return {
    start: toDateTimeLocalValue(start),
    end: toDateTimeLocalValue(end),
  };
}

function buildAvailableSlots(rangeStartIso: string, rangeEndIso: string, busySlots: TimeSlot[]) {
  const rangeStart = new Date(rangeStartIso);
  const rangeEnd = new Date(rangeEndIso);

  if (
    Number.isNaN(rangeStart.valueOf()) ||
    Number.isNaN(rangeEnd.valueOf()) ||
    rangeEnd <= rangeStart
  ) {
    return [] as TimeSlot[];
  }

  const busyRanges = busySlots
    .map((slot) => {
      const start = new Date(slot.start);
      const end = new Date(slot.end);
      return { start, end };
    })
    .filter((slot) => !Number.isNaN(slot.start.valueOf()) && !Number.isNaN(slot.end.valueOf()));

  const result: TimeSlot[] = [];
  const currentDay = new Date(rangeStart);
  currentDay.setHours(0, 0, 0, 0);

  const lastDay = new Date(rangeEnd);
  lastDay.setHours(0, 0, 0, 0);

  while (currentDay <= lastDay) {
    const dayStart = new Date(currentDay);
    dayStart.setHours(WORKDAY_START_HOUR, 0, 0, 0);

    const dayEnd = new Date(currentDay);
    dayEnd.setHours(WORKDAY_END_HOUR, 0, 0, 0);

    let slotStart = new Date(dayStart);

    while (slotStart < dayEnd) {
      const slotEnd = new Date(slotStart.getTime() + SLOT_DURATION_MINUTES * 60 * 1000);
      if (slotEnd > dayEnd) break;

      if (slotStart < rangeStart || slotEnd > rangeEnd) {
        slotStart = slotEnd;
        continue;
      }

      const conflictsBusy = busyRanges.some(
        (busy) => slotStart < busy.end && slotEnd > busy.start
      );

      if (!conflictsBusy) {
        result.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
        });
      }

      slotStart = slotEnd;
    }

    currentDay.setDate(currentDay.getDate() + 1);
  }

  return result;
}

export default function ManagerMeetingsPage() {
  const [teamMembers, setTeamMembers] = useState<TeamMemberItem[]>([]);
  const [requests, setRequests] = useState<MeetRequestItem[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventItem[]>([]);
  const [calendarNotice, setCalendarNotice] = useState("");
  const [busySlots, setBusySlots] = useState<TimeSlot[]>([]);
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [availabilityChecked, setAvailabilityChecked] = useState(false);
  const [checkingAvailability, setCheckingAvailability] = useState(false);

  const [loading, setLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [tokenStatus, setTokenStatus] = useState<GoogleTokenStatus | null>(null);

  const [employeeId, setEmployeeId] = useState("");
  const [calendarWindow] = useState(() => buildCalendarWindow());
  const [availabilityDefaults] = useState(() => buildDefaultAvailabilityWindow());

  const [availabilityStart, setAvailabilityStart] = useState(availabilityDefaults.start);
  const [availabilityEnd, setAvailabilityEnd] = useState(availabilityDefaults.end);

  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleTitle, setScheduleTitle] = useState("1:1 Meeting");
  const [scheduleDescription, setScheduleDescription] = useState("");
  const [scheduleStartInput, setScheduleStartInput] = useState("");
  const [scheduleEndInput, setScheduleEndInput] = useState("");
  const [lastScheduledMeeting, setLastScheduledMeeting] = useState<{
    title: string;
    startTime: string;
    endTime: string;
    meetLink: string;
  } | null>(null);

  const employeeOptions = useMemo(
    () =>
      teamMembers.map((member) => ({
        value: member.$id,
        label: member.name || member.email || member.$id,
      })),
    [teamMembers]
  );

  const selectedEmployee = useMemo(
    () => teamMembers.find((member) => member.$id === employeeId) || null,
    [employeeId, teamMembers]
  );

  const groupedCalendarEvents = useMemo(
    () => groupEventsByDate(calendarEvents),
    [calendarEvents]
  );

  const groupedAvailableSlots = useMemo(
    () => groupSlotsByDate(availableSlots),
    [availableSlots]
  );

  const availabilityRange = useMemo(
    () => ({
      start: toIsoFromDateTimeLocal(availabilityStart),
      end: toIsoFromDateTimeLocal(availabilityEnd),
    }),
    [availabilityEnd, availabilityStart]
  );

  const loadCalendarForEmployee = useCallback(
    async (targetEmployeeId: string) => {
      if (!targetEmployeeId) {
        setCalendarEvents([]);
        setCalendarNotice("");
        return;
      }

      setCalendarLoading(true);
      setCalendarNotice("");
      try {
        const nextCalendar = await fetchCalendarEvents({
          employeeId: targetEmployeeId,
          startDate: calendarWindow.startDate,
          endDate: calendarWindow.endDate,
          timeZone: DEFAULT_TIMEZONE,
          maxResults: 200,
        });
        setCalendarEvents(nextCalendar.events || []);
      } catch (err) {
        setCalendarEvents([]);
        const message = err instanceof Error ? err.message : "Unable to load employee calendar.";

        if (String(message).toLowerCase().includes("not connected")) {
          setCalendarNotice("Selected employee has not connected Google Calendar.");
        } else {
          setError(message);
        }
      } finally {
        setCalendarLoading(false);
      }
    },
    [calendarWindow.endDate, calendarWindow.startDate]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [members, meetingRequests, nextTokenStatus] = await Promise.all([
        fetchTeamMembers(),
        fetchMeetRequests(),
        fetchGoogleTokenStatus(),
      ]);

      const employeeMembers = members.filter((item) => item.role === "employee");
      setTeamMembers(employeeMembers);
      setRequests(meetingRequests);
      setTokenStatus(nextTokenStatus);
      setEmployeeId((current) => current || employeeMembers[0]?.$id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load manager meeting data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!employeeId) {
      setCalendarEvents([]);
      return;
    }

    loadCalendarForEmployee(employeeId);
  }, [employeeId, loadCalendarForEmployee]);

  useEffect(() => {
    setAvailableSlots([]);
    setBusySlots([]);
    setSelectedSlot(null);
    setAvailabilityChecked(false);
  }, [employeeId]);

  const handleRefresh = useCallback(async () => {
    await loadData();
    if (employeeId) {
      await loadCalendarForEmployee(employeeId);
    }
  }, [employeeId, loadCalendarForEmployee, loadData]);

  async function handleCheckAvailability(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccess("");
    setError("");

    if (!employeeId || !availabilityStart || !availabilityEnd) {
      setError("Select employee and availability range first.");
      return;
    }

    const startIso = toIsoFromDateTimeLocal(availabilityStart);
    const endIso = toIsoFromDateTimeLocal(availabilityEnd);

    if (!startIso || !endIso || new Date(endIso).valueOf() <= new Date(startIso).valueOf()) {
      setError("Provide a valid range where end is after start.");
      return;
    }

    setCheckingAvailability(true);

    try {
      const data = await fetchEmployeeFreeBusy({
        employeeId,
        startDate: startIso,
        endDate: endIso,
        timeZone: DEFAULT_TIMEZONE,
      });

      setBusySlots((data.busy || []).map((slot) => ({ start: slot.start, end: slot.end })));
      const nextAvailableSlots = buildAvailableSlots(startIso, endIso, data.busy || []);
      setAvailableSlots(nextAvailableSlots);
      setAvailabilityChecked(true);
      setSelectedSlot(null);

      if (nextAvailableSlots.length === 0) {
        setSuccess("No available 60-minute slots found in selected range.");
      } else {
        setSuccess(`${nextAvailableSlots.length} available 60-minute slots found.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Availability fetch failed.");
    } finally {
      setCheckingAvailability(false);
    }
  }

  function handleSelectSlot(slot: TimeSlot) {
    setSelectedSlot(slot);
    setScheduleStartInput(toDateTimeLocalValue(slot.start));
    setScheduleEndInput(toDateTimeLocalValue(slot.end));
    setScheduleTitle("1:1 Meeting");
    setScheduleDescription("");
    setScheduleModalOpen(true);
  }

  async function handleSubmitScheduledSlot(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!employeeId) {
      setError("Select an employee first.");
      return;
    }

    const startIso = toIsoFromDateTimeLocal(scheduleStartInput);
    const endIso = toIsoFromDateTimeLocal(scheduleEndInput);

    if (!startIso || !endIso || new Date(endIso).valueOf() <= new Date(startIso).valueOf()) {
      setError("Provide valid start and end times for scheduling.");
      return;
    }

    setSaving(true);
    try {
      const created = await createManagerDirectMeeting({
        employeeId,
        startTime: startIso,
        endTime: endIso,
        title: scheduleTitle,
        description: scheduleDescription,
        timeZone: DEFAULT_TIMEZONE,
      });

      setSuccess("Meeting Scheduled");
      setLastScheduledMeeting({
        title: scheduleTitle,
        startTime: startIso,
        endTime: endIso,
        meetLink: String(created?.event?.meetLink || created?.meeting?.meetLink || "").trim(),
      });

      setScheduleModalOpen(false);
      await Promise.all([loadData(), loadCalendarForEmployee(employeeId)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to schedule meeting.");
    } finally {
      setSaving(false);
    }
  }

  async function handleScheduleRequest(item: MeetRequestItem) {
    setError("");
    setSuccess("");

    if (!item.proposedStartTime || !item.proposedEndTime) {
      setError("This request has no proposed time. Use direct scheduling instead.");
      return;
    }

    setSaving(true);
    try {
      await updateMeetRequestAction(item.$id, {
        action: "schedule",
        startTime: item.proposedStartTime,
        endTime: item.proposedEndTime,
        title: item.title,
        description: item.description,
        timeZone: item.timezone || DEFAULT_TIMEZONE,
      });
      setSuccess("Request converted into scheduled Google Meet event.");
      await Promise.all([loadData(), loadCalendarForEmployee(item.employeeId || employeeId)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to schedule request.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRejectRequest(item: MeetRequestItem) {
    setError("");
    setSuccess("");

    setSaving(true);
    try {
      await updateMeetRequestAction(item.$id, {
        action: "reject",
        managerNotes: "Rejected by manager.",
      });
      setSuccess("Request rejected.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reject request.");
    } finally {
      setSaving(false);
    }
  }

  const pendingRequests = useMemo(
    () => requests.filter((item) => item.status === "pending"),
    [requests]
  );

  const scheduledMeetings = useMemo(
    () => requests.filter((item) => item.status === "scheduled"),
    [requests]
  );

  async function handleConnectGoogle() {
    setError("");
    setSuccess("");
    setConnectingGoogle(true);
    window.location.href = "/api/google/connect";
  }

  return (
    <Stack gap="4">
      <PageHeader
        title="Manager Meetings"
        subtitle="Schedule directly or process employee meeting requests with Google Meet links."
        actions={
          <Button variant="secondary" onClick={handleRefresh} disabled={loading || calendarLoading}>
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="error" title="Unable to continue" description={error} onDismiss={() => setError("")} />}
      {success && <Alert variant="success" title="Done" description={success} onDismiss={() => setSuccess("")} />}

      <Card title="Google Connection" description="Connect your Google account to check availability and schedule meetings.">
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

      {lastScheduledMeeting && (
        <Card title="Meeting Scheduled" description="Your meeting was created successfully.">
          <Stack gap="2">
            <p className="body-sm text-[var(--color-text)]">{lastScheduledMeeting.title}</p>
            <p className="caption">
              {formatCalendarTimeRange(lastScheduledMeeting.startTime, lastScheduledMeeting.endTime)}
            </p>
            {lastScheduledMeeting.meetLink && (
              <a
                className="caption inline-block text-[var(--color-primary)] underline"
                href={lastScheduledMeeting.meetLink}
                target="_blank"
                rel="noreferrer"
              >
                Open Google Meet
              </a>
            )}
          </Stack>
        </Card>
      )}

      <Card
        title="Employee Calendar (Next 7 Days)"
        description="View selected employee events in a simplified calendar-like list grouped by date."
      >
        <Stack gap="3">
          <Select
            label="Employee"
            options={employeeOptions}
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            placeholder="Select employee"
            disabled={loading || teamMembers.length === 0}
          />

          {calendarLoading && <p className="caption">Loading employee calendar events...</p>}
          {!calendarLoading && calendarNotice && <p className="caption">{calendarNotice}</p>}
          {!calendarLoading && !employeeId && (
            <p className="caption">Select an employee to view calendar events.</p>
          )}
          {!calendarLoading && employeeId && !calendarNotice && groupedCalendarEvents.length === 0 && (
            <p className="caption">No events found for the selected employee in the next 7 days.</p>
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

      <Card title="Check Availability" description="Find available 60-minute slots in the selected date range.">
        <form className="grid gap-3 md:grid-cols-4" onSubmit={handleCheckAvailability}>
          <Select
            options={employeeOptions}
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            placeholder="Select employee"
            disabled={loading || teamMembers.length === 0}
            required
          />

          <Input
            type="datetime-local"
            value={availabilityStart}
            onChange={(event) => setAvailabilityStart(event.target.value)}
            required
          />

          <Input
            type="datetime-local"
            value={availabilityEnd}
            onChange={(event) => setAvailabilityEnd(event.target.value)}
            required
          />

          <Button type="submit" loading={checkingAvailability} disabled={!tokenStatus?.connected || !employeeId}>
            Check Availability
          </Button>
        </form>

        <Stack gap="2" className="mt-3">
          {checkingAvailability && <p className="caption">Calculating available slots...</p>}
          {!checkingAvailability && availabilityChecked && availableSlots.length === 0 && (
            <p className="caption">No available slots in this range.</p>
          )}

          <div className="space-y-2">
            <p className="body-sm text-[var(--color-text)]">Select Time Slot</p>
            <AvailabilityCalendar
              busySlots={busySlots}
              selectedSlot={selectedSlot}
              loading={checkingAvailability}
              range={availabilityRange}
              onSelectSlot={(start, end) => handleSelectSlot({ start, end })}
            />
          </div>

          <div className="md:hidden space-y-2">
            {groupedAvailableSlots.map((group) => (
            <div key={group.label} className="space-y-2">
              <p className="caption font-semibold text-[var(--color-text)]">{group.label}</p>
              <div className="flex flex-wrap gap-2">
                {group.items.map((slot) => {
                  const isSelected =
                    selectedSlot?.start === slot.start && selectedSlot?.end === slot.end;

                  return (
                    <Button
                      key={`${slot.start}-${slot.end}`}
                      variant={isSelected ? "primary" : "secondary"}
                      size="sm"
                      onClick={() => handleSelectSlot(slot)}
                      disabled={saving}
                    >
                      {formatCalendarTimeRange(slot.start, slot.end)}
                    </Button>
                  );
                })}
              </div>
            </div>
            ))}
          </div>

          {selectedSlot && (
            <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <p className="caption">
                  Selected slot: {formatCalendarDateLabel(selectedSlot.start)} {formatCalendarTimeRange(selectedSlot.start, selectedSlot.end)}
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setScheduleModalOpen(true)}
                  disabled={saving}
                >
                  Schedule Selected Slot
                </Button>
              </div>
            </div>
          )}
        </Stack>
      </Card>

      <Card title="Pending Employee Requests" description="Employees can only request. Manager decides schedule or reject.">
        <Stack gap="2">
          {!loading && pendingRequests.length === 0 && <p className="caption">No pending requests.</p>}
          {pendingRequests.map((item) => (
            <div
              key={item.$id}
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="body-sm text-[var(--color-text)]">{item.title}</p>
                <Badge variant="info">pending</Badge>
              </div>
              <p className="caption mt-1">Requested: {formatDate(item.requestedAt)}</p>
              {item.proposedStartTime && item.proposedEndTime && (
                <p className="caption mt-1">
                  Proposed: {formatDate(item.proposedStartTime)} to {formatDate(item.proposedEndTime)}
                </p>
              )}
              <div className="mt-2 flex gap-2">
                <Button variant="secondary" onClick={() => handleScheduleRequest(item)} disabled={saving}>
                  Schedule
                </Button>
                <Button variant="ghost" onClick={() => handleRejectRequest(item)} disabled={saving}>
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </Stack>
      </Card>

      <Card title="Scheduled Meetings" description="Recent scheduled meetings and Meet links.">
        <Stack gap="2">
          {!loading && scheduledMeetings.length === 0 && <p className="caption">No scheduled meetings yet.</p>}
          {scheduledMeetings.map((item) => (
            <div
              key={item.$id}
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="body-sm text-[var(--color-text)]">{item.title}</p>
                <Badge variant="success">scheduled</Badge>
              </div>
              <p className="caption mt-1">Start: {formatDate(item.scheduledStartTime || item.requestedAt)}</p>
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

      <Modal
        open={scheduleModalOpen}
        onClose={() => setScheduleModalOpen(false)}
        title="Schedule Meeting"
        description="Confirm details and create a Google Meet event from the selected slot."
      >
        <form className="space-y-3" onSubmit={handleSubmitScheduledSlot}>
          <Input
            label="Employee"
            value={selectedEmployee?.name || selectedEmployee?.email || selectedEmployee?.$id || ""}
            disabled
          />

          <Input
            label="Meeting title"
            value={scheduleTitle}
            onChange={(event) => setScheduleTitle(event.target.value)}
            required
          />

          <Textarea
            label="Description"
            value={scheduleDescription}
            onChange={(event) => setScheduleDescription(event.target.value)}
            rows={3}
            placeholder="Agenda"
          />

          <div className="grid gap-3 md:grid-cols-2">
            <Input
              label="Start time"
              type="datetime-local"
              value={scheduleStartInput}
              onChange={(event) => setScheduleStartInput(event.target.value)}
              required
            />
            <Input
              label="End time"
              type="datetime-local"
              value={scheduleEndInput}
              onChange={(event) => setScheduleEndInput(event.target.value)}
              required
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setScheduleModalOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" loading={saving} disabled={!tokenStatus?.connected}>
              Schedule Meeting
            </Button>
          </div>
        </form>
      </Modal>
    </Stack>
  );
}

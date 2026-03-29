"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Grid, Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Card, Input, Select } from "@/src/components/ui";
import {
  createManagerDirectMeeting,
  fetchCalendarEvents,
  fetchEmployeeFreeBusy,
  fetchGoogleTokenStatus,
  fetchGoogleTokenStatusForUser,
  fetchMeetRequests,
  fetchTeamMembers,
  formatDate,
  MeetRequestItem,
  TeamMemberItem,
  updateMeetRequestAction,
} from "@/app/employee/_lib/pmsClient";
import AvailabilityCalendar from "@/components/calendar/AvailabilityCalendar";

const DEFAULT_TIMEZONE = "UTC";
const SLOT_MINUTES = 60;

type EmployeeStats = {
  pending: number;
  scheduled: number;
  total: number;
  connected: boolean;
};

type TimeSlot = {
  start: string;
  end: string;
};

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

function calcAvailableSlotCount(startIso: string, endIso: string, busy: Array<{ start: string; end: string }>) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf()) || end <= start) {
    return 0;
  }

  let count = 0;
  let cursor = new Date(start);
  while (cursor < end) {
    const next = new Date(cursor.getTime() + SLOT_MINUTES * 60 * 1000);
    if (next > end) break;

    const blocked = busy.some((item) => {
      const bStart = new Date(item.start);
      const bEnd = new Date(item.end);
      if (Number.isNaN(bStart.valueOf()) || Number.isNaN(bEnd.valueOf())) return false;
      return cursor < bEnd && next > bStart;
    });

    if (!blocked) {
      count += 1;
    }

    cursor = next;
  }

  return count;
}

export default function ManagerMeetingCalendarDashboardPage() {
  const [managerGoogleConnected, setManagerGoogleConnected] = useState(true);
  const [teamMembers, setTeamMembers] = useState<TeamMemberItem[]>([]);
  const [meetRequests, setMeetRequests] = useState<MeetRequestItem[]>([]);
  const [connectionByEmployeeId, setConnectionByEmployeeId] = useState<Record<string, boolean>>({});
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [employeeEvents, setEmployeeEvents] = useState<Array<{ eventId: string; title: string; startTime: string; endTime: string; meetLink: string }>>([]);

  const [availabilityStart, setAvailabilityStart] = useState(() => {
    const now = new Date();
    now.setHours(9, 0, 0, 0);
    return toDateTimeLocalValue(now);
  });
  const [availabilityEnd, setAvailabilityEnd] = useState(() => {
    const later = new Date();
    later.setDate(later.getDate() + 7);
    later.setHours(18, 0, 0, 0);
    return toDateTimeLocalValue(later);
  });
  const [availableSlotCount, setAvailableSlotCount] = useState<number | null>(null);
  const [busySlots, setBusySlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);

  const [meetingTitle, setMeetingTitle] = useState("1:1 Meeting");
  const [meetingStart, setMeetingStart] = useState("");
  const [meetingEnd, setMeetingEnd] = useState("");

  const [loading, setLoading] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [savingMeeting, setSavingMeeting] = useState(false);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [processingApprovalId, setProcessingApprovalId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      let connected = false;
      try {
        const status = await fetchGoogleTokenStatus();
        connected = Boolean(status?.connected);
      } catch {
        connected = false;
      }
      setManagerGoogleConnected(connected);

      const [members, requests] = await Promise.all([
        fetchTeamMembers(),
        fetchMeetRequests(),
      ]);

      const employees = members.filter((member) => member.role === "employee");
      setTeamMembers(employees);
      setMeetRequests(requests);
      setSelectedEmployeeId((current) => current || employees[0]?.$id || "");

      const statuses = await Promise.all(
        employees.map(async (employee) => {
          try {
            const status = await fetchGoogleTokenStatusForUser(employee.$id);
            return [employee.$id, Boolean(status?.connected)] as const;
          } catch {
            return [employee.$id, false] as const;
          }
        })
      );

      setConnectionByEmployeeId(Object.fromEntries(statuses));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load meeting dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEmployeeEvents = useCallback(async (employeeId: string) => {
    if (!managerGoogleConnected) {
      setEmployeeEvents([]);
      return;
    }

    if (!employeeId) {
      setEmployeeEvents([]);
      return;
    }

    if (!connectionByEmployeeId[employeeId]) {
      setEmployeeEvents([]);
      return;
    }

    setLoadingEvents(true);
    try {
      const now = new Date();
      const nextWeek = new Date(now);
      nextWeek.setDate(nextWeek.getDate() + 7);

      const calendar = await fetchCalendarEvents({
        employeeId,
        startDate: now.toISOString(),
        endDate: nextWeek.toISOString(),
        timeZone: DEFAULT_TIMEZONE,
        maxResults: 100,
      });

      setEmployeeEvents(
        (calendar?.events || []).map((event) => ({
          eventId: event.eventId,
          title: event.title,
          startTime: event.startTime,
          endTime: event.endTime,
          meetLink: event.meetLink,
        }))
      );
    } catch (err) {
      setEmployeeEvents([]);
      setError(err instanceof Error ? err.message : "Unable to load employee calendar events.");
    } finally {
      setLoadingEvents(false);
    }
  }, [connectionByEmployeeId, managerGoogleConnected]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    loadEmployeeEvents(selectedEmployeeId);
  }, [loadEmployeeEvents, selectedEmployeeId]);

  const pendingApprovals = useMemo(
    () => meetRequests.filter((request) => request.status === "pending"),
    [meetRequests]
  );

  const stats = useMemo(() => {
    const byEmployee: Record<string, EmployeeStats> = {};
    for (const employee of teamMembers) {
      byEmployee[employee.$id] = {
        pending: 0,
        scheduled: 0,
        total: 0,
        connected: Boolean(connectionByEmployeeId[employee.$id]),
      };
    }

    for (const req of meetRequests) {
      const employeeStats = byEmployee[req.employeeId];
      if (!employeeStats) continue;
      employeeStats.total += 1;
      if (req.status === "pending") employeeStats.pending += 1;
      if (req.status === "scheduled") employeeStats.scheduled += 1;
    }

    const values = Object.entries(byEmployee).map(([employeeId, value]) => ({
      employeeId,
      ...value,
    }));

    return {
      byEmployee,
      totalEmployees: teamMembers.length,
      connectedEmployees: values.filter((item) => item.connected).length,
      totalPending: values.reduce((sum, item) => sum + item.pending, 0),
      totalScheduled: values.reduce((sum, item) => sum + item.scheduled, 0),
      ranking: values.sort((a, b) => b.scheduled - a.scheduled),
    };
  }, [connectionByEmployeeId, meetRequests, teamMembers]);

  const rankingMax = useMemo(
    () => Math.max(1, ...stats.ranking.map((item) => item.scheduled)),
    [stats.ranking]
  );

  const employeeOptions = useMemo(
    () =>
      teamMembers.map((member) => ({
        value: member.$id,
        label: member.name || member.email || member.$id,
      })),
    [teamMembers]
  );

  const selectedEmployeeConnected = useMemo(
    () => Boolean(selectedEmployeeId && connectionByEmployeeId[selectedEmployeeId]),
    [connectionByEmployeeId, selectedEmployeeId]
  );

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

    if (!managerGoogleConnected) {
      setError("Connect Google Calendar before checking availability.");
      return;
    }

    if (!selectedEmployeeId || !availabilityStart || !availabilityEnd) {
      setError("Select employee and availability range first.");
      return;
    }

    const startIso = toIsoFromDateTimeLocal(availabilityStart);
    const endIso = toIsoFromDateTimeLocal(availabilityEnd);

    if (!startIso || !endIso || new Date(endIso) <= new Date(startIso)) {
      setError("Provide a valid range where end is after start.");
      return;
    }

    setCheckingAvailability(true);
    try {
      const result = await fetchEmployeeFreeBusy({
        employeeId: selectedEmployeeId,
        startDate: startIso,
        endDate: endIso,
        timeZone: DEFAULT_TIMEZONE,
      });

      setBusySlots((result.busy || []).map((slot) => ({ start: slot.start, end: slot.end })));
      setSelectedSlot(null);
      const slotCount = calcAvailableSlotCount(startIso, endIso, result.busy || []);
      setAvailableSlotCount(slotCount);
      setSuccess(`Availability checked. ${slotCount} one-hour slots available.`);
    } catch (err) {
      setAvailableSlotCount(null);
      setError(err instanceof Error ? err.message : "Unable to check availability.");
    } finally {
      setCheckingAvailability(false);
    }
  }

  async function handleCreateMeeting() {
    setError("");
    setSuccess("");

    if (!managerGoogleConnected) {
      setError("Connect Google Calendar before scheduling a meeting.");
      return;
    }

    if (!selectedEmployeeId || !meetingStart || !meetingEnd) {
      setError("Employee, start time, and end time are required to schedule.");
      return;
    }

    const startIso = toIsoFromDateTimeLocal(meetingStart);
    const endIso = toIsoFromDateTimeLocal(meetingEnd);

    if (!startIso || !endIso || new Date(endIso) <= new Date(startIso)) {
      setError("Provide a valid meeting range where end is after start.");
      return;
    }

    setSavingMeeting(true);
    try {
      const created = await createManagerDirectMeeting({
        employeeId: selectedEmployeeId,
        startTime: startIso,
        endTime: endIso,
        title: meetingTitle,
        timeZone: DEFAULT_TIMEZONE,
      });

      setSuccess(
        created?.event?.meetLink
          ? `Meeting scheduled: ${created.event.meetLink}`
          : "Meeting scheduled successfully."
      );
      await Promise.all([loadDashboard(), loadEmployeeEvents(selectedEmployeeId)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create meeting.");
    } finally {
      setSavingMeeting(false);
    }
  }

  async function handleApproveRequest(item: MeetRequestItem) {
    if (!managerGoogleConnected) {
      setError("Connect Google Calendar before approving and scheduling requests.");
      return;
    }

    if (!item.proposedStartTime || !item.proposedEndTime) {
      setError("This request has no proposed time. Use schedule form to create a meeting.");
      return;
    }

    setProcessingApprovalId(item.$id);
    setError("");
    setSuccess("");
    try {
      await updateMeetRequestAction(item.$id, {
        action: "schedule",
        startTime: item.proposedStartTime,
        endTime: item.proposedEndTime,
        title: item.title,
        description: item.description,
        timeZone: item.timezone || DEFAULT_TIMEZONE,
      });

      setSuccess("Meeting request approved and scheduled.");
      await Promise.all([loadDashboard(), loadEmployeeEvents(item.employeeId)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to approve request.");
    } finally {
      setProcessingApprovalId("");
    }
  }

  async function handleRejectRequest(item: MeetRequestItem) {
    setProcessingApprovalId(item.$id);
    setError("");
    setSuccess("");
    try {
      await updateMeetRequestAction(item.$id, {
        action: "reject",
        managerNotes: "Rejected by manager.",
      });

      setSuccess("Meeting request rejected.");
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reject request.");
    } finally {
      setProcessingApprovalId("");
    }
  }

  async function handleConnectGoogle() {
    setError("");
    setSuccess("");
    setConnectingGoogle(true);
    window.location.href = "/api/google/connect";
  }

  function handleSelectSlot(start: string, end: string) {
    setSelectedSlot({ start, end });
    setMeetingStart(toDateTimeLocalValue(start));
    setMeetingEnd(toDateTimeLocalValue(end));
  }

  return (
    <Stack gap="4">
      <PageHeader
        title="Meeting & Calendar Dashboard"
        subtitle="Manage team meeting assignments, calendar visibility, ranking, and approvals in one place."
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

      {!managerGoogleConnected && (
        <Card title="Connect Google Calendar" description="Your manager account must be connected to continue with calendar availability and scheduling.">
          <Stack gap="2">
            <p className="caption">Google account is not connected for this user.</p>
            <Button variant="secondary" onClick={handleConnectGoogle} disabled={connectingGoogle}>
              {connectingGoogle ? "Redirecting..." : "Connect Google Calendar"}
            </Button>
          </Stack>
        </Card>
      )}

      <Grid cols={1} colsMd={3} gap="3">
        <Card title="Team Members">
          <p className="heading-xl">{loading ? "..." : stats.totalEmployees}</p>
        </Card>
        <Card title="Google Connected">
          <p className="heading-xl">
            {loading ? "..." : `${stats.connectedEmployees}/${stats.totalEmployees}`}
          </p>
        </Card>
        <Card title="Pending Approvals">
          <p className="heading-xl">{loading ? "..." : stats.totalPending}</p>
        </Card>
      </Grid>

      <Grid cols={1} colsLg={2} gap="3">
        <Card title="Team Goal Assignment" description="Google Calendar connection status for each team member.">
          <Stack gap="2">
            {!loading && teamMembers.length === 0 && <p className="caption">No team members found.</p>}
            {teamMembers.map((member) => {
              const connected = Boolean(connectionByEmployeeId[member.$id]);
              return (
                <div
                  key={member.$id}
                  className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="body-sm text-[var(--color-text)]">{member.name || member.email || member.$id}</p>
                    <Badge variant={connected ? "success" : "warning"}>
                      {connected ? "Connected" : "Not Connected"}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </Stack>
        </Card>

        <Card title="Team Progress Overview" description="Meeting pipeline status across your team.">
          <Stack gap="2">
            <div className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2">
              <p className="caption">Pending requests</p>
              <p className="body-sm">{loading ? "..." : stats.totalPending}</p>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2">
              <p className="caption">Scheduled meetings</p>
              <p className="body-sm">{loading ? "..." : stats.totalScheduled}</p>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2">
              <p className="caption">Connected members</p>
              <p className="body-sm">{loading ? "..." : `${stats.connectedEmployees}/${stats.totalEmployees}`}</p>
            </div>
          </Stack>
        </Card>

        <Card title="Team Ranking & Graph" description="Ranking by scheduled meetings with quick visual bars.">
          <Stack gap="2">
            {!loading && stats.ranking.length === 0 && <p className="caption">No ranking data yet.</p>}
            {stats.ranking.map((entry) => {
              const member = teamMembers.find((item) => item.$id === entry.employeeId);
              const label = member?.name || member?.email || entry.employeeId;
              const widthPercent = Math.max(8, Math.round((entry.scheduled / rankingMax) * 100));

              return (
                <div
                  key={entry.employeeId}
                  className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="body-sm text-[var(--color-text)]">{label}</p>
                    <p className="caption">{entry.scheduled} scheduled</p>
                  </div>
                  <div className="mt-2 h-2 w-full rounded-full bg-[var(--color-border)]">
                    <div
                      className="h-full rounded-full bg-[var(--color-primary)]"
                      style={{ width: `${widthPercent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </Stack>
        </Card>

        <Card title="Team Approvals" description="Approve or reject pending meeting requests.">
          <Stack gap="2">
            {!loading && pendingApprovals.length === 0 && (
              <p className="caption">No pending meeting approvals.</p>
            )}
            {pendingApprovals.map((request) => (
              <div
                key={request.$id}
                className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="body-sm text-[var(--color-text)]">{request.title}</p>
                  <Badge variant="info">pending</Badge>
                </div>
                <p className="caption mt-1">Requested: {formatDate(request.requestedAt)}</p>
                {request.proposedStartTime && request.proposedEndTime && (
                  <p className="caption mt-1">
                    Proposed: {formatDate(request.proposedStartTime)} to {formatDate(request.proposedEndTime)}
                  </p>
                )}
                <div className="mt-2 flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleApproveRequest(request)}
                    disabled={processingApprovalId === request.$id}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRejectRequest(request)}
                    disabled={processingApprovalId === request.$id}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </Stack>
        </Card>
      </Grid>

      <Grid cols={1} colsLg={2} gap="3">
        <Card title="Team Calendar" description="Selected employee events for the next 7 days.">
          <Stack gap="3">
            <Select
              label="Employee"
              options={employeeOptions}
              value={selectedEmployeeId}
              onChange={(event) => setSelectedEmployeeId(event.target.value)}
              placeholder="Select employee"
              disabled={teamMembers.length === 0 || loading}
            />

            {!managerGoogleConnected && (
              <p className="caption">Connect your Google account to view employee calendars.</p>
            )}

            {loadingEvents && <p className="caption">Loading events...</p>}
            {!loadingEvents && selectedEmployeeId && employeeEvents.length === 0 && (
              <p className="caption">
                {selectedEmployeeConnected
                  ? "No events in next 7 days."
                  : "Selected employee has not connected Google Calendar yet."}
              </p>
            )}

            {employeeEvents.map((event) => (
              <div
                key={event.eventId || `${event.title}-${event.startTime}`}
                className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="body-sm text-[var(--color-text)]">{event.title || "Untitled event"}</p>
                  <Badge variant="info">{formatTimeRange(event.startTime, event.endTime)}</Badge>
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
          </Stack>
        </Card>

        <Card title="Schedule Meeting" description="Check availability and schedule with existing calendar APIs.">
          <Stack gap="3">
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
            <Button
              variant="secondary"
              onClick={handleCheckAvailability}
              loading={checkingAvailability}
              disabled={!selectedEmployeeId || !managerGoogleConnected}
            >
              Check Availability
            </Button>

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

            {availableSlotCount !== null && (
              <p className="caption">Available one-hour slots: {availableSlotCount}</p>
            )}

            <Input
              label="Meeting title"
              value={meetingTitle}
              onChange={(event) => setMeetingTitle(event.target.value)}
            />
            <Input
              label="Meeting start"
              type="datetime-local"
              value={meetingStart}
              onChange={(event) => setMeetingStart(event.target.value)}
            />
            <Input
              label="Meeting end"
              type="datetime-local"
              value={meetingEnd}
              onChange={(event) => setMeetingEnd(event.target.value)}
            />
            <Button
              onClick={handleCreateMeeting}
              loading={savingMeeting}
              disabled={!selectedEmployeeId || !managerGoogleConnected}
            >
              Schedule Meeting
            </Button>
          </Stack>
        </Card>
      </Grid>
    </Stack>
  );
}

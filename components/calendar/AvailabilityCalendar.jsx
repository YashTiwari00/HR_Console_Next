"use client";

import FullCalendar from "@fullcalendar/react";
import interactionPlugin from "@fullcalendar/interaction";
import timeGridPlugin from "@fullcalendar/timegrid";
import { useEffect, useMemo, useState } from "react";

const SLOT_MINUTES = 30;

function toDate(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.valueOf()) ? null : date;
}

function overlaps(slotStart, slotEnd, busySlots) {
  return busySlots.some((busy) => {
    const busyStart = toDate(busy?.start);
    const busyEnd = toDate(busy?.end);
    if (!busyStart || !busyEnd) return false;
    return slotStart < busyEnd && slotEnd > busyStart;
  });
}

function buildFreeSlots(range, busySlots) {
  const start = toDate(range?.start);
  const end = toDate(range?.end);
  if (!start || !end || end <= start) return [];

  const slots = [];
  let cursor = new Date(start);

  while (cursor < end) {
    const next = new Date(cursor.getTime() + SLOT_MINUTES * 60 * 1000);
    if (next > end) break;

    if (!overlaps(cursor, next, busySlots)) {
      slots.push({
        start: cursor.toISOString(),
        end: next.toISOString(),
      });
    }

    cursor = next;
  }

  return slots;
}

function formatSlotLabel(start, end) {
  const startDate = toDate(start);
  const endDate = toDate(end);
  if (!startDate || !endDate) return "Invalid time";

  const day = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(startDate);

  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return `${day} · ${time.format(startDate)} - ${time.format(endDate)}`;
}

export default function AvailabilityCalendar({
  busySlots = [],
  selectedSlot = null,
  onSelectSlot,
  loading = false,
  range,
}) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");

    const update = () => setIsMobile(mediaQuery.matches);
    update();

    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  const rangeStart = toDate(range?.start);
  const rangeEnd = toDate(range?.end);

  const normalizedBusySlots = useMemo(
    () =>
      (busySlots || [])
        .filter((slot) => toDate(slot?.start) && toDate(slot?.end))
        .map((slot) => ({ start: slot.start, end: slot.end })),
    [busySlots]
  );

  const freeSlots = useMemo(
    () => buildFreeSlots({ start: rangeStart?.toISOString(), end: rangeEnd?.toISOString() }, normalizedBusySlots),
    [normalizedBusySlots, rangeEnd, rangeStart]
  );

  const selectedStart = selectedSlot?.start || "";
  const selectedEnd = selectedSlot?.end || "";

  const calendarEvents = useMemo(() => {
    const busy = normalizedBusySlots.map((slot, index) => ({
      id: `busy-${index}`,
      title: "Busy",
      start: slot.start,
      end: slot.end,
      display: "background",
      classNames: ["availability-busy-block"],
    }));

    const selected =
      selectedStart && selectedEnd
        ? [
            {
              id: "selected-slot",
              title: "Selected",
              start: selectedStart,
              end: selectedEnd,
              classNames: ["availability-selected-slot"],
            },
          ]
        : [];

    return [...busy, ...selected];
  }, [normalizedBusySlots, selectedEnd, selectedStart]);

  function handleSelect(startIso, endIso) {
    if (!onSelectSlot) return;

    const start = toDate(startIso);
    const end = toDate(endIso);
    if (!start || !end || end <= start) return;
    if (overlaps(start, end, normalizedBusySlots)) return;

    onSelectSlot(start.toISOString(), end.toISOString());
  }

  if (!rangeStart || !rangeEnd) {
    return <p className="caption">Pick a valid availability range to view slots.</p>;
  }

  if (loading) {
    return (
      <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
        <p className="caption">Loading calendar availability...</p>
      </div>
    );
  }

  return (
    <div className="availability-calendar-shell">
      {!isMobile && (
        <div className="hidden md:block">
          <FullCalendar
            plugins={[timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            initialDate={rangeStart.toISOString()}
            headerToolbar={false}
            allDaySlot={false}
            slotDuration="00:30:00"
            slotLabelInterval="01:00:00"
            slotMinTime="07:00:00"
            slotMaxTime="21:00:00"
            selectable
            selectMirror
            nowIndicator
            height="auto"
            events={calendarEvents}
            select={(info) => handleSelect(info.startStr, info.endStr)}
            selectAllow={(info) => {
              const start = toDate(info.startStr);
              const end = toDate(info.endStr);
              if (!start || !end || end <= start) return false;
              if (start < rangeStart || end > rangeEnd) return false;
              return !overlaps(start, end, normalizedBusySlots);
            }}
            eventDidMount={(info) => {
              if (info.event.display === "background") {
                info.el.title = "Busy slot";
              }
            }}
          />
        </div>
      )}

      <div className="md:hidden">
        <div className="space-y-2">
          {freeSlots.length === 0 && <p className="caption">No availability in this range.</p>}
          {freeSlots.map((slot) => {
            const isSelected = selectedStart === slot.start && selectedEnd === slot.end;
            return (
              <button
                key={`${slot.start}-${slot.end}`}
                type="button"
                onClick={() => handleSelect(slot.start, slot.end)}
                className={
                  isSelected
                    ? "w-full rounded-[var(--radius-sm)] border border-[var(--color-primary)] bg-[var(--color-primary)] px-3 py-2 text-left body-sm text-[var(--color-button-text)]"
                    : "w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-left body-sm text-[var(--color-text)]"
                }
              >
                {formatSlotLabel(slot.start, slot.end)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

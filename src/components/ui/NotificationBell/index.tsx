"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchNotificationFeed,
  markAllNotificationsRead,
  markNotificationRead,
  NotificationFeedItem,
} from "@/app/employee/_lib/pmsClient";

function formatTimeLabel(value: string) {
  const time = new Date(value).valueOf();
  if (Number.isNaN(time)) return "Just now";
  return new Date(time).toLocaleString();
}

function getSectionLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Earlier";

  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  const sameMonth = sameYear && date.getMonth() === now.getMonth();
  const sameDay = sameMonth && date.getDate() === now.getDate();

  if (sameDay) return "Today";

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (isYesterday) return "Yesterday";
  return "Earlier";
}

function getTypeIcon(item: NotificationFeedItem) {
  const trigger = String(item.triggerType || "").trim().toLowerCase();

  if (trigger === "goal_approved") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.4-9.8a1 1 0 10-1.4-1.4L9 9.8 7.9 8.7a1 1 0 10-1.4 1.4l1.8 1.8a1 1 0 001.4 0l3.7-3.7z" clipRule="evenodd" />
      </svg>
    );
  }

  if (trigger === "meeting_scheduled") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    );
  }

  if (trigger === "deadline_near") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    );
  }

  if (trigger === "goal_added") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </svg>
    );
  }

  if (trigger === "checkin_submitted") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    );
  }

  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  );
}

export default function NotificationBell() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [items, setItems] = useState<NotificationFeedItem[]>([]);
  const [error, setError] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  const unreadCount = useMemo(() => items.length, [items]);

  const groupedItems = useMemo(() => {
    const groups = {
      Today: [] as NotificationFeedItem[],
      Yesterday: [] as NotificationFeedItem[],
      Earlier: [] as NotificationFeedItem[],
    };

    items.forEach((item) => {
      const label = getSectionLabel(item.createdAt);
      groups[label as keyof typeof groups].push(item);
    });

    return groups;
  }, [items]);

  const seeAllHref = useMemo(() => {
    const path = String(pathname || "").trim();
    if (path.startsWith("/manager")) return "/manager/timeline";
    if (path.startsWith("/hr")) return "/hr/notifications";
    if (path.startsWith("/leadership")) return "/leadership";
    return "/employee/timeline";
  }, [pathname]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const payload = await fetchNotificationFeed({ limit: 12, includeRead: false });
      setItems(payload.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  const onMarkRead = useCallback(async (id: string) => {
    try {
      await markNotificationRead(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update notification.");
    }
  }, []);

  const onMarkAllRead = useCallback(async () => {
    if (items.length === 0) return;

    setBulkLoading(true);
    setError("");

    try {
      await markAllNotificationsRead(250);
      setItems([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to mark all notifications as read.");
    } finally {
      setBulkLoading(false);
    }
  }, [items.length]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    function onOutsideClick(event: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((prev) => !prev)}
        className="relative inline-flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[var(--color-text)] transition-colors duration-150 hover:bg-[var(--color-surface-muted)]"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.4V11a6 6 0 0 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
          <path d="M10 17a2 2 0 1 0 4 0" />
        </svg>

        {unreadCount > 0 ? (
          <span className="absolute -right-2 -top-2 inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--color-primary)] px-1 text-[11px] font-medium text-[var(--color-button-text)]">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-[min(420px,92vw)] origin-top-right animate-[notif-pop_160ms_ease-out] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-md)]">
          <style jsx>{`
            @keyframes notif-pop {
              from {
                opacity: 0;
                transform: translateY(-6px) scale(0.98);
              }
              to {
                opacity: 1;
                transform: translateY(0) scale(1);
              }
            }
          `}</style>
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
            <p className="body-sm font-medium text-[var(--color-text)]">Notifications</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="caption text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                onClick={onMarkAllRead}
                disabled={bulkLoading || loading || items.length === 0}
              >
                {bulkLoading ? "Marking..." : "Mark all read"}
              </button>
              <button
                type="button"
                className="caption text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                onClick={load}
                disabled={loading}
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="p-3">
            {error ? <p className="caption text-[var(--color-danger)]">{error}</p> : null}
            {loading ? <p className="caption">Loading notifications...</p> : null}
            {!loading && items.length === 0 ? <p className="caption">No unread notifications.</p> : null}

            {!loading && items.length > 0 ? (
              <div className="max-h-[360px] space-y-3 overflow-auto pr-1">
                {(["Today", "Yesterday", "Earlier"] as const).map((section) => {
                  const sectionItems = groupedItems[section];
                  if (sectionItems.length === 0) return null;

                  return (
                    <div key={section} className="space-y-2">
                      <p className="caption px-1 text-[var(--color-text-muted)]">{section}</p>
                      {sectionItems.map((item) => (
                        <div key={item.id} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-2">
                          <div className="flex items-start gap-2">
                            <div className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)]">
                              {getTypeIcon(item)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-2">
                                  {!item.isRead ? (
                                    <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-[var(--color-primary)]" aria-hidden="true" />
                                  ) : null}
                                  <p className="body-sm font-medium text-[var(--color-text)]">{item.title}</p>
                                </div>
                                <button
                                  type="button"
                                  className="caption whitespace-nowrap text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                                  onClick={() => onMarkRead(item.id)}
                                >
                                  Mark read
                                </button>
                              </div>
                              <p className="caption mt-1 text-[var(--color-text-muted)]">{item.message}</p>
                              <p className="caption mt-1 text-[var(--color-text-muted)]">{formatTimeLabel(item.createdAt)}</p>
                              {item.actionUrl ? (
                                <Link
                                  href={item.actionUrl}
                                  className="mt-2 inline-flex rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 caption text-[var(--color-text)] transition-colors duration-150 hover:bg-[var(--color-surface-muted)]"
                                >
                                  Open
                                </Link>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ) : null}

            <div className="mt-3 border-t border-[var(--color-border)] pt-2">
              <Link
                href={seeAllHref}
                className="inline-flex w-full items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 caption text-[var(--color-text)] transition-colors duration-150 hover:bg-[var(--color-surface-muted)]"
                onClick={() => setOpen(false)}
              >
                See all notifications
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

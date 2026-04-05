"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Card } from "@/src/components/ui";
import {
  CheckInItem,
  fetchCheckIns,
  fetchGoals,
  fetchLifecycleTimeline,
  fetchNotificationFeed,
  fetchProgressUpdates,
  getCycleIdFromDate,
  GoalItem,
  LifecycleTimelineEvent,
  markNotificationRead,
  NotificationFeedItem,
  ProgressUpdateItem,
  formatDate,
} from "@/app/employee/_lib/pmsClient";
import { getNextAction, WorkflowActionType } from "@/lib/workflow/getNextAction";
import { getInsights } from "@/lib/ai/getInsights";

interface TimelineNode {
  label: string;
  done: boolean;
  locked?: boolean;
  details: string;
}

type LifecycleSection = "Goal Creation" | "Approval" | "Check-ins" | "Review";

interface LifecycleDisplayEvent {
  id: string;
  eventType: "goal" | "progress" | "checkin" | "meeting";
  title: string;
  status: string;
  timestamp: string;
  section: LifecycleSection;
}

interface SectionActionState {
  label: string;
  actionType: WorkflowActionType;
}

function toStringSafe(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function toNumberSafe(value: unknown, fallback = 0) {
  return typeof value === "number" ? value : fallback;
}

function deriveEventType(type: LifecycleTimelineEvent["type"]): LifecycleDisplayEvent["eventType"] {
  if (type.startsWith("goal_")) return "goal";
  if (type.startsWith("progress_")) return "progress";
  if (type.startsWith("meeting_")) return "meeting";
  return "checkin";
}

function deriveSection(type: LifecycleTimelineEvent["type"]): LifecycleSection {
  if (type === "goal_created") return "Goal Creation";
  if (type === "goal_updated") return "Approval";
  if (
    type === "checkin_planned" ||
    type === "checkin_completed" ||
    type === "meeting_scheduled" ||
    type === "meeting_intelligence_ready"
  ) {
    return "Check-ins";
  }
  return "Review";
}

function deriveTitle(event: LifecycleTimelineEvent): string {
  const payload = event.payload || {};

  if (event.type === "goal_created") {
    return toStringSafe(payload.title, "Goal created");
  }

  if (event.type === "goal_updated") {
    return toStringSafe(payload.title, "Goal updated");
  }

  if (event.type === "progress_updated") {
    const updateText = toStringSafe(payload.updateText, "").trim();
    return updateText || "Progress updated";
  }

  if (event.type === "checkin_planned") {
    return "Check-in planned";
  }

  if (event.type === "meeting_scheduled") {
    return toStringSafe(payload.title, "Goal-linked meeting scheduled");
  }

  if (event.type === "meeting_intelligence_ready") {
    return toStringSafe(payload.title, "Meeting intelligence generated");
  }

  return "Check-in completed";
}

function deriveStatus(event: LifecycleTimelineEvent): string {
  const payload = event.payload || {};

  if (event.type === "goal_created") {
    return toStringSafe(payload.status, "created");
  }

  if (event.type === "goal_updated") {
    return toStringSafe(payload.status, "updated");
  }

  if (event.type === "progress_updated") {
    return `${toNumberSafe(payload.percentComplete, 0)}%`;
  }

  if (event.type === "meeting_scheduled") {
    return toStringSafe(payload.status, "scheduled");
  }

  if (event.type === "meeting_intelligence_ready") {
    return "intelligence_ready";
  }

  return toStringSafe(payload.status, event.type === "checkin_completed" ? "completed" : "planned");
}

function statusVariant(status: string) {
  const normalized = status.toLowerCase();

  if (normalized.includes("completed") || normalized.includes("approved") || normalized === "100%") {
    return "success" as const;
  }

  if (normalized.includes("pending") || normalized.includes("planned") || normalized.includes("submitted")) {
    return "warning" as const;
  }

  return "default" as const;
}

function iconForEventType(type: LifecycleDisplayEvent["eventType"]) {
  if (type === "goal") return "G";
  if (type === "progress") return "P";
  if (type === "meeting") return "M";
  return "C";
}

export default function EmployeeTimelinePage() {
  const router = useRouter();
  const cycleId = useMemo(() => getCycleIdFromDate(), []);
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [checkIns, setCheckIns] = useState<CheckInItem[]>([]);
  const [progressUpdates, setProgressUpdates] = useState<ProgressUpdateItem[]>([]);
  const [checkInCount, setCheckInCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [error, setError] = useState("");
  const [timelineEvents, setTimelineEvents] = useState<LifecycleDisplayEvent[]>([]);
  const [notifications, setNotifications] = useState<NotificationFeedItem[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [markingReadId, setMarkingReadId] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setEventsLoading(true);
    setError("");

    try {
      const [nextGoals, nextCheckIns, lifecycle, nextProgressUpdates, notificationFeed] = await Promise.all([
        fetchGoals(),
        fetchCheckIns(),
        fetchLifecycleTimeline({ cycleId, limit: 200 }),
        fetchProgressUpdates(undefined, undefined, undefined),
        fetchNotificationFeed({ limit: 10, includeRead: false }),
      ]);
      setGoals(nextGoals);
      setCheckIns(nextCheckIns);
      setCheckInCount(nextCheckIns.length);
      setProgressUpdates(nextProgressUpdates);
      setNotifications(notificationFeed.data || []);

      const shaped = (lifecycle.data || []).map((event) => ({
        id: event.id,
        eventType: deriveEventType(event.type),
        title: deriveTitle(event),
        status: deriveStatus(event),
        timestamp: event.at,
        section: deriveSection(event.type),
      }));

      setTimelineEvents(shaped);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load timeline state.");
    } finally {
      setLoading(false);
      setEventsLoading(false);
      setNotificationsLoading(false);
    }
  }, [cycleId]);

  const handleMarkRead = useCallback(async (eventId: string) => {
    if (!eventId) return;
    setMarkingReadId(eventId);
    setError("");

    try {
      await markNotificationRead(eventId);
      setNotifications((prev) => prev.filter((item) => item.id !== eventId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to mark notification as read.");
    } finally {
      setMarkingReadId("");
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const nodes = useMemo<TimelineNode[]>(() => {
    const hasDraft = goals.some((goal) => goal.status === "draft" || goal.status === "needs_changes");
    const hasSubmitted = goals.some((goal) => goal.status === "submitted");
    const hasApproved = goals.some((goal) => goal.status === "approved" || goal.status === "closed");
    const allClosed = goals.length > 0 && goals.every((goal) => goal.status === "closed");

    return [
      {
        label: "Goal Creation",
        done: !hasDraft && goals.length > 0,
        details: "Create at least one measurable goal and complete the draft stage.",
      },
      {
        label: "Goal Approval",
        done: hasApproved && !hasSubmitted,
        details: "Submit drafts and wait for manager decisions.",
      },
      {
        label: "Check-ins",
        done: checkInCount > 0,
        details: `Planned/completed check-ins this cycle: ${checkInCount}`,
      },
      {
        label: "Review",
        done: false,
        locked: true,
        details: "Review opens after the check-in window and cycle policy gates.",
      },
      {
        label: "Cycle Closed",
        done: allClosed,
        details: "All goals completed and cycle officially closed.",
      },
    ];
  }, [goals, checkInCount]);

  const groupedEvents = useMemo(() => {
    const sections: LifecycleSection[] = ["Goal Creation", "Approval", "Check-ins", "Review"];

    return sections.map((section) => ({
      section,
      events: timelineEvents.filter((event) => event.section === section),
    }));
  }, [timelineEvents]);

  const insights = useMemo(() => {
    const scopedGoals = goals.filter((goal) => goal.cycleId === cycleId);
    const goalIds = new Set(scopedGoals.map((goal) => String(goal.$id || "")).filter(Boolean));
    const scopedCheckIns = checkIns.filter((item) => goalIds.has(String(item.goalId || "")));
    const scopedProgressUpdates = progressUpdates.filter((item) =>
      goalIds.has(String(item.goalId || ""))
    );

    return getInsights(scopedGoals, scopedCheckIns, scopedProgressUpdates);
  }, [goals, checkIns, progressUpdates, cycleId]);

  const sectionActionState = useMemo(() => {
    const scopedGoals = goals.filter((goal) => goal.cycleId === cycleId);
    const goalIds = new Set(scopedGoals.map((goal) => String(goal.$id || "")).filter(Boolean));
    const scopedCheckIns = checkIns.filter((item) => goalIds.has(String(item.goalId || "")));

    const hasGoals = scopedGoals.length > 0;
    const hasDraft = scopedGoals.some(
      (goal) => goal.status === "draft" || goal.status === "needs_changes"
    );
    const hasSubmitted = scopedGoals.some((goal) => goal.status === "submitted");
    const hasApproved = scopedGoals.some(
      (goal) => goal.status === "approved" || goal.status === "closed"
    );
    const hasCheckIns = scopedCheckIns.length > 0;
    const hasFinalCheckIn = scopedCheckIns.some(
      (item) => Boolean(item.isFinalCheckIn) && item.status === "completed"
    );
    const allClosed = scopedGoals.length > 0 && scopedGoals.every((goal) => goal.status === "closed");

    const states: Record<LifecycleSection, SectionActionState> = {
      "Goal Creation": {
        label: !hasGoals
          ? "Create your goals"
          : hasDraft
            ? "Submit goals for approval"
            : "Goals drafted",
        actionType: !hasGoals ? "create_goal" : hasDraft ? "submit_goal" : null,
      },
      Approval: {
        label: hasSubmitted && !hasApproved ? "Waiting for manager approval" : hasApproved ? "Goals approved" : "Approval not started",
        actionType: null,
      },
      "Check-ins": {
        label: hasApproved && !hasCheckIns
          ? "Start first check-in"
          : hasCheckIns && !hasFinalCheckIn
            ? "Continue check-ins"
            : hasFinalCheckIn
              ? "Final check-in completed"
              : "Check-ins not started",
        actionType:
          hasApproved && !hasCheckIns
            ? "start_checkin"
            : hasCheckIns && !hasFinalCheckIn
              ? "start_checkin"
              : null,
      },
      Review: {
        label: hasFinalCheckIn && !allClosed ? "Complete review" : "Review pending",
        actionType: hasFinalCheckIn && !allClosed ? "review" : null,
      },
    };

    return states;
  }, [goals, checkIns, cycleId]);

  const nextAction = useMemo(() => getNextAction(goals, checkIns, cycleId), [goals, checkIns, cycleId]);

  const openAction = useCallback(
    (actionType: WorkflowActionType) => {
      if (!actionType) return;

      if (actionType === "create_goal" || actionType === "submit_goal") {
        router.push("/employee/goals");
        return;
      }

      if (actionType === "start_checkin") {
        router.push("/employee/check-ins");
        return;
      }

      if (actionType === "review") {
        router.push("/employee/check-ins");
      }
    },
    [router]
  );

  return (
    <Stack gap="4">
      <PageHeader
        title="Cycle Timeline"
        subtitle="Single lifecycle path for this performance cycle."
        actions={
          <Button variant="secondary" onClick={loadData} disabled={loading}>
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="error" title="Unable to load" description={error} onDismiss={() => setError("")} />}

      <Card title="Insights" description="Rule-based guidance for this cycle.">
        <Stack gap="2">
          {insights.map((insight, index) => {
            const variant = insight.type === "risk"
              ? "warning"
              : insight.type === "positive"
                ? "success"
                : "info";

            return (
              <Alert
                key={`${insight.type}-${index}`}
                variant={variant}
                title={insight.priority === "high" ? "High Priority" : insight.priority === "medium" ? "Medium Priority" : "Low Priority"}
                description={insight.message}
              />
            );
          })}
        </Stack>
      </Card>

      <Card title="Pending Notifications" description="In-app nudges and reminders for your workflow.">
        <Stack gap="2">
          {notificationsLoading && <p className="caption">Loading notifications...</p>}

          {!notificationsLoading && notifications.length === 0 && (
            <p className="caption">No unread notifications right now.</p>
          )}

          {!notificationsLoading &&
            notifications.map((item) => (
              <div
                key={item.id}
                className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="body-sm font-medium text-[var(--color-text)]">{item.title}</p>
                  <Badge variant="warning">Pending</Badge>
                </div>
                <p className="caption mt-2">{item.message}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="caption">{formatDate(item.createdAt)}</p>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleMarkRead(item.id)}
                    loading={markingReadId === item.id}
                    disabled={markingReadId === item.id}
                  >
                    Mark Read
                  </Button>
                </div>
              </div>
            ))}
        </Stack>
      </Card>

      <Card title="Timeline Nodes" description="Nodes lock/unlock based on actual workflow state.">
        <Stack gap="2">
          {loading && <p className="caption">Loading timeline...</p>}
          {nodes.map((node) => (
            <div key={node.label} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="body-sm font-medium text-[var(--color-text)]">{node.label}</p>
                <Badge variant={node.done ? "success" : node.locked ? "warning" : "default"}>
                  {node.done ? "Done" : node.locked ? "Locked" : "Pending"}
                </Badge>
              </div>
              <p className="caption mt-2">{node.details}</p>
            </div>
          ))}
        </Stack>
      </Card>

      <Card title="Unified Lifecycle" description="Single event feed across goals, progress, and check-ins.">
        <Stack gap="3">
          {!eventsLoading && (
            <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="body-sm font-medium text-[var(--color-text)]">Next Action</p>
                {nextAction.actionType ? (
                  <Button size="sm" onClick={() => openAction(nextAction.actionType)}>
                    {nextAction.label}
                  </Button>
                ) : (
                  <Badge variant="default">{nextAction.label}</Badge>
                )}
              </div>
            </div>
          )}

          {eventsLoading && <p className="caption">Loading lifecycle events...</p>}

          {!eventsLoading && timelineEvents.length === 0 && (
            <p className="caption">No lifecycle events available yet for this cycle.</p>
          )}

          {!eventsLoading &&
            groupedEvents.map((group) => (
              <div key={group.section} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="body-sm font-medium text-[var(--color-text)]">{group.section}</p>
                  {sectionActionState[group.section].actionType ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openAction(sectionActionState[group.section].actionType)}
                    >
                      {sectionActionState[group.section].label}
                    </Button>
                  ) : (
                    <Badge variant="default">{sectionActionState[group.section].label}</Badge>
                  )}
                </div>

                {group.events.length === 0 ? (
                  <p className="caption">No events in this section.</p>
                ) : (
                  <div className="relative ml-2 border-l border-[var(--color-border)] pl-4">
                    {group.events.map((event) => (
                      <div key={event.id} className="relative mb-4 last:mb-0">
                        <span className="absolute -left-[22px] inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[10px] font-medium text-[var(--color-text)]">
                          {iconForEventType(event.eventType)}
                        </span>

                        <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="body-sm font-medium text-[var(--color-text)]">{event.title}</p>
                            <Badge variant={statusVariant(event.status)}>{event.status}</Badge>
                          </div>
                          <p className="caption mt-1">{formatDate(event.timestamp)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
        </Stack>
      </Card>
    </Stack>
  );
}

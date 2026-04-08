"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Card, Input, Textarea } from "@/src/components/ui";
import {
  CheckInItem,
  fetchCheckIns,
  fetchGoals,
  fetchLifecycleTimeline,
  fetchNotificationFeed,
  fetchProgressUpdates,
  formatDate,
  getAttachmentDownloadPath,
  getCycleIdFromDate,
  GoalItem,
  LifecycleTimelineEvent,
  markNotificationRead,
  NotificationFeedItem,
  ProgressUpdateItem,
  uploadAttachments,
} from "@/app/employee/_lib/pmsClient";
import { getNextAction, WorkflowActionType } from "@/lib/workflow/getNextAction";
import { getInsights } from "@/lib/ai/getInsights";

interface TimelineNode {
  label: string;
  done: boolean;
  locked?: boolean;
  details: string;
}

type LifecycleSection =
  | "Goal Creation"
  | "Approval"
  | "Check-ins"
  | "Self Review"
  | "Manager Review";

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

interface SelfReviewGoalSummary {
  $id: string;
  title: string;
  description: string;
  cycleId: string;
  status: string;
  frameworkType: string;
  weightage: number;
  dueDate?: string | null;
  progressPercent: number;
}

interface SelfReviewData {
  $id: string;
  employeeId: string;
  goalId: string;
  cycleId: string;
  status: "draft" | "submitted";
  submittedAt?: string | null;
  selfRatingValue?: number | null;
  selfRatingLabel?: "EE" | "DE" | "ME" | "SME" | "NI" | null;
  selfComment?: string;
  achievements?: string;
  challenges?: string;
  evidenceLinks?: string[];
  achievementsJson?: string;
  challengesJson?: string;
  updatedAt?: string | null;
}

interface SelfReviewRow {
  goal: SelfReviewGoalSummary;
  selfReview: SelfReviewData | null;
  editable: boolean;
}

interface SelfReviewDraft {
  achievements: string;
  challenges: string;
  selfRating: string;
  selfComment: string;
  additionalComments: string;
  evidenceLinksText: string;
  evidenceLinks: string[];
}

function toStringSafe(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function toNumberSafe(value: unknown, fallback = 0) {
  return typeof value === "number" ? value : fallback;
}

function normalize(value: unknown) {
  return String(value || "").trim();
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
  if (type === "self_review_submitted") return "Self Review";
  if (
    type === "checkin_planned" ||
    type === "checkin_completed" ||
    type === "meeting_scheduled" ||
    type === "meeting_intelligence_ready"
  ) {
    return "Check-ins";
  }
  return "Manager Review";
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

  if (event.type === "self_review_submitted") {
    return "Self review submitted";
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

  if (event.type === "self_review_submitted") {
    return "submitted";
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

function hasManagerRating(checkIn: CheckInItem) {
  const numeric = Number(checkIn.managerRating);
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 5;
}

function isSelfReviewSatisfied(checkIn: CheckInItem) {
  if (hasManagerRating(checkIn)) return true;
  return checkIn.selfReviewStatus === "submitted";
}

function splitEvidenceLinks(input: string) {
  return normalize(input)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function buildDraft(row: SelfReviewRow): SelfReviewDraft {
  const review = row.selfReview;
  const selfComment = normalize(review?.selfComment);

  return {
    achievements: review?.achievements || "",
    challenges: review?.challenges || "",
    selfRating:
      review?.selfRatingValue !== null && typeof review?.selfRatingValue !== "undefined"
        ? String(review.selfRatingValue)
        : review?.selfRatingLabel || "",
    selfComment,
    additionalComments: selfComment,
    evidenceLinksText: Array.isArray(review?.evidenceLinks) ? review.evidenceLinks.join(", ") : "",
    evidenceLinks: Array.isArray(review?.evidenceLinks) ? review.evidenceLinks : [],
  };
}

async function fetchSelfReviewRows(cycleId: string) {
  const response = await fetch(`/api/self-review?cycleId=${encodeURIComponent(cycleId)}`, {
    method: "GET",
    credentials: "include",
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || "Unable to load self-review data.");
  }

  return (payload?.data || []) as SelfReviewRow[];
}

async function saveSelfReviewDraftRequest(input: {
  cycleId: string;
  goalId: string;
  achievements: string;
  challenges: string;
  selfRating: string;
  selfComment: string;
  evidenceLinks: string[];
}) {
  const response = await fetch("/api/self-review/save", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || "Unable to save self-review draft.");
  }

  return payload?.data as SelfReviewData;
}

async function submitSelfReviewRequest(cycleId: string) {
  const response = await fetch("/api/self-review/submit", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ cycleId }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = Array.isArray(payload?.details)
      ? payload.details
          .map((item: { goalId?: string; reason?: string }) => `${item.goalId || "goal"}: ${item.reason || "invalid"}`)
          .join(" | ")
      : "";
    throw new Error(details ? `${payload?.error || "Submit failed"}. ${details}` : payload?.error || "Submit failed");
  }

  return payload?.data || null;
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

  const [selfReviewRows, setSelfReviewRows] = useState<SelfReviewRow[]>([]);
  const [selfReviewDrafts, setSelfReviewDrafts] = useState<Record<string, SelfReviewDraft>>({});
  const [expandedGoalIds, setExpandedGoalIds] = useState<Record<string, boolean>>({});
  const [selfReviewLoading, setSelfReviewLoading] = useState(true);
  const [savingGoalId, setSavingGoalId] = useState("");
  const [uploadingGoalId, setUploadingGoalId] = useState("");
  const [submittingSelfReview, setSubmittingSelfReview] = useState(false);
  const [selfReviewMessage, setSelfReviewMessage] = useState("");

  const hydrateDrafts = useCallback((rows: SelfReviewRow[]) => {
    const nextDrafts: Record<string, SelfReviewDraft> = {};
    const nextExpanded: Record<string, boolean> = {};

    for (const row of rows) {
      nextDrafts[row.goal.$id] = buildDraft(row);
      if (!row.selfReview || normalize(row.selfReview.status) !== "submitted") {
        nextExpanded[row.goal.$id] = true;
      }
    }

    setSelfReviewDrafts(nextDrafts);
    setExpandedGoalIds(nextExpanded);
  }, []);

  const loadSelfReview = useCallback(async () => {
    setSelfReviewLoading(true);
    try {
      const rows = await fetchSelfReviewRows(cycleId);
      setSelfReviewRows(rows);
      hydrateDrafts(rows);
    } finally {
      setSelfReviewLoading(false);
    }
  }, [cycleId, hydrateDrafts]);

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
      await loadSelfReview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load timeline state.");
    } finally {
      setLoading(false);
      setEventsLoading(false);
      setNotificationsLoading(false);
    }
  }, [cycleId, loadSelfReview]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  const selfReviewByGoalId = useMemo(() => {
    const map = new Map<string, SelfReviewRow>();
    for (const row of selfReviewRows) {
      map.set(row.goal.$id, row);
    }
    return map;
  }, [selfReviewRows]);

  const completion = useMemo(() => {
    const total = selfReviewRows.length;
    const completed = selfReviewRows.filter(
      (row) => normalize(row.selfReview?.status) === "submitted"
    ).length;
    return { total, completed };
  }, [selfReviewRows]);

  const nodes = useMemo<TimelineNode[]>(() => {
    const hasDraft = goals.some((goal) => goal.status === "draft" || goal.status === "needs_changes");
    const hasSubmitted = goals.some((goal) => goal.status === "submitted");
    const hasApproved = goals.some((goal) => goal.status === "approved" || goal.status === "closed");
    const finalCompletedCheckIns = checkIns.filter(
      (item) => Boolean(item.isFinalCheckIn) && item.status === "completed"
    );
    const hasFinalCheckIn = finalCompletedCheckIns.length > 0;
    const hasPendingSelfReview = finalCompletedCheckIns.some((item) => !isSelfReviewSatisfied(item));
    const hasManagerReviewDone =
      hasFinalCheckIn && finalCompletedCheckIns.every((item) => hasManagerRating(item));
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
        label: "Self Review",
        done: hasFinalCheckIn && !hasPendingSelfReview,
        locked: !hasFinalCheckIn || hasPendingSelfReview,
        details: "Submit self review after final check-in completion.",
      },
      {
        label: "Manager Review",
        done: hasManagerReviewDone,
        locked: !hasFinalCheckIn || hasPendingSelfReview,
        details: "Manager review unlocks only after self review submission.",
      },
      {
        label: "Cycle Closed",
        done: allClosed,
        details: "All goals completed and cycle officially closed.",
      },
    ];
  }, [goals, checkInCount, checkIns]);

  const groupedEvents = useMemo(() => {
    const sections: LifecycleSection[] = [
      "Goal Creation",
      "Approval",
      "Check-ins",
      "Self Review",
      "Manager Review",
    ];

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
    const finalCompletedCheckIns = scopedCheckIns.filter(
      (item) => Boolean(item.isFinalCheckIn) && item.status === "completed"
    );
    const hasFinalCheckIn = finalCompletedCheckIns.length > 0;
    const hasPendingSelfReview = finalCompletedCheckIns.some((item) => !isSelfReviewSatisfied(item));
    const hasManagerReviewDone =
      hasFinalCheckIn && finalCompletedCheckIns.every((item) => hasManagerRating(item));

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
      "Self Review": {
        label: !hasFinalCheckIn
          ? "Final check-in pending"
          : hasPendingSelfReview
            ? "Submit self review"
            : "Self review submitted",
        actionType: hasPendingSelfReview ? "submit_self_review" : null,
      },
      "Manager Review": {
        label: !hasFinalCheckIn
          ? "Final check-in pending"
          : hasPendingSelfReview
            ? "Waiting for self review"
            : hasManagerReviewDone
              ? "Manager review completed"
              : "Awaiting manager review",
        actionType: null,
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

      if (actionType === "submit_self_review") {
        document.getElementById("self-review-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [router]
  );

  const updateDraft = useCallback((goalId: string, patch: Partial<SelfReviewDraft>) => {
    setSelfReviewDrafts((prev) => ({
      ...prev,
      [goalId]: {
        ...(prev[goalId] || {
          achievements: "",
          challenges: "",
          selfRating: "",
          selfComment: "",
          additionalComments: "",
          evidenceLinksText: "",
          evidenceLinks: [],
        }),
        ...patch,
      },
    }));
  }, []);

  const handleEvidenceUpload = useCallback(
    async (goalId: string, files: FileList | null) => {
      if (!files || files.length === 0) return;
      setUploadingGoalId(goalId);
      setSelfReviewMessage("");
      setError("");

      try {
        const uploaded = await uploadAttachments(Array.from(files));
        const uploadedIds = uploaded.map((item) => item.fileId).filter(Boolean);

        setSelfReviewDrafts((prev) => {
          const current = prev[goalId] || {
            achievements: "",
            challenges: "",
            selfRating: "",
            selfComment: "",
            additionalComments: "",
            evidenceLinksText: "",
            evidenceLinks: [],
          };
          const nextLinks = Array.from(new Set([...(current.evidenceLinks || []), ...uploadedIds]));
          return {
            ...prev,
            [goalId]: {
              ...current,
              evidenceLinks: nextLinks,
              evidenceLinksText: nextLinks.join(", "),
            },
          };
        });

        setSelfReviewMessage(`${uploadedIds.length} evidence file(s) uploaded.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Evidence upload failed.");
      } finally {
        setUploadingGoalId("");
      }
    },
    []
  );

  const handleSaveDraft = useCallback(
    async (goalId: string) => {
      const row = selfReviewByGoalId.get(goalId);
      if (!row) return;

      const draft = selfReviewDrafts[goalId] || buildDraft(row);
      const selfCommentMerged = normalize(draft.additionalComments || draft.selfComment);

      setSavingGoalId(goalId);
      setSelfReviewMessage("");
      setError("");

      try {
        await saveSelfReviewDraftRequest({
          cycleId,
          goalId,
          achievements: normalize(draft.achievements),
          challenges: normalize(draft.challenges),
          selfRating: normalize(draft.selfRating),
          selfComment: selfCommentMerged,
          evidenceLinks: splitEvidenceLinks(draft.evidenceLinksText),
        });

        setSelfReviewMessage(`Draft saved for ${row.goal.title}.`);
        await loadSelfReview();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to save self review draft.");
      } finally {
        setSavingGoalId("");
      }
    },
    [cycleId, loadSelfReview, selfReviewByGoalId, selfReviewDrafts]
  );

  const handleSubmitSelfReview = useCallback(async () => {
    setSubmittingSelfReview(true);
    setSelfReviewMessage("");
    setError("");

    try {
      await submitSelfReviewRequest(cycleId);
      setSelfReviewMessage("Self review submitted. Editing is now locked.");
      await Promise.all([loadSelfReview(), loadData()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit self review.");
    } finally {
      setSubmittingSelfReview(false);
    }
  }, [cycleId, loadData, loadSelfReview]);

  const allSubmitted = completion.total > 0 && completion.completed === completion.total;

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

      {selfReviewMessage && (
        <Alert
          variant="success"
          title="Self Review"
          description={selfReviewMessage}
          onDismiss={() => setSelfReviewMessage("")}
        />
      )}

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

      <Card title="Self Review" description="A short conversation with each goal before manager review.">
        <Stack gap="3">
          <div id="self-review-section" className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="body-sm font-medium text-[var(--color-text)]">Completion</p>
              <Badge variant={allSubmitted ? "success" : "warning"}>
                {completion.completed}/{completion.total || 0} goals submitted
              </Badge>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-muted)]">
              <div
                className="h-full bg-[var(--color-primary)] transition-all"
                style={{
                  width: completion.total > 0 ? `${Math.round((completion.completed / completion.total) * 100)}%` : "0%",
                }}
              />
            </div>
          </div>

          {selfReviewLoading && <p className="caption">Loading self-review goals...</p>}

          {!selfReviewLoading && selfReviewRows.length === 0 && (
            <p className="caption">No goals found for this cycle yet.</p>
          )}

          {!selfReviewLoading &&
            selfReviewRows.map((row) => {
              const goalId = row.goal.$id;
              const draft = selfReviewDrafts[goalId] || buildDraft(row);
              const submitted = normalize(row.selfReview?.status) === "submitted";
              const locked = submitted || !row.editable;
              const expanded = Boolean(expandedGoalIds[goalId]);

              return (
                <div key={goalId} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="body-sm font-semibold text-[var(--color-text)]">{row.goal.title}</p>
                      <p className="caption">{row.goal.description}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <Badge variant="default">Progress {row.goal.progressPercent}%</Badge>
                        <Badge variant={submitted ? "success" : "warning"}>
                          {submitted ? "Submitted" : "Draft"}
                        </Badge>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        setExpandedGoalIds((prev) => ({
                          ...prev,
                          [goalId]: !prev[goalId],
                        }))
                      }
                    >
                      {expanded ? "Collapse" : "Expand"}
                    </Button>
                  </div>

                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-muted)]">
                    <div className="h-full bg-[var(--color-accent)]" style={{ width: `${row.goal.progressPercent}%` }} />
                  </div>

                  {expanded && (
                    <div className="mt-3 space-y-3">
                      <Textarea
                        label="Achievements"
                        placeholder="What moved forward for this goal?"
                        value={draft.achievements}
                        onChange={(event) => updateDraft(goalId, { achievements: event.target.value })}
                        disabled={locked}
                      />

                      <Textarea
                        label="Challenges faced"
                        placeholder="What slowed progress, and why?"
                        value={draft.challenges}
                        onChange={(event) => updateDraft(goalId, { challenges: event.target.value })}
                        disabled={locked}
                      />

                      <label className="block text-xs font-medium text-[var(--color-text-muted)]">
                        Self rating
                        <select
                          className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
                          value={draft.selfRating}
                          onChange={(event) => updateDraft(goalId, { selfRating: event.target.value })}
                          disabled={locked}
                        >
                          <option value="">Select rating</option>
                          <option value="1">1</option>
                          <option value="2">2</option>
                          <option value="3">3</option>
                          <option value="4">4</option>
                          <option value="5">5</option>
                          <option value="EE">EE</option>
                          <option value="DE">DE</option>
                          <option value="ME">ME</option>
                          <option value="SME">SME</option>
                          <option value="NI">NI</option>
                        </select>
                      </label>

                      <Textarea
                        label="Additional comments"
                        placeholder="Anything else your manager should know?"
                        value={draft.additionalComments}
                        onChange={(event) => updateDraft(goalId, { additionalComments: event.target.value, selfComment: event.target.value })}
                        disabled={locked}
                      />

                      <Input
                        label="Evidence links or attachment IDs (comma-separated)"
                        value={draft.evidenceLinksText}
                        onChange={(event) =>
                          updateDraft(goalId, {
                            evidenceLinksText: event.target.value,
                            evidenceLinks: splitEvidenceLinks(event.target.value),
                          })
                        }
                        disabled={locked}
                      />

                      {!locked && (
                        <div>
                          <label className="caption block mb-1">Evidence upload (optional)</label>
                          <input
                            type="file"
                            multiple
                            disabled={uploadingGoalId === goalId}
                            onChange={(event) => handleEvidenceUpload(goalId, event.target.files)}
                            className="caption block w-full"
                          />
                        </div>
                      )}

                      {splitEvidenceLinks(draft.evidenceLinksText).length > 0 && (
                        <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2">
                          <p className="caption">Evidence items: {splitEvidenceLinks(draft.evidenceLinksText).length}</p>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {splitEvidenceLinks(draft.evidenceLinksText).map((item) => (
                              isUrl(item) ? (
                                <a
                                  key={item}
                                  href={item}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="caption underline"
                                >
                                  {item}
                                </a>
                              ) : (
                                <a
                                  key={item}
                                  href={getAttachmentDownloadPath(item)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="caption underline"
                                >
                                  {item}
                                </a>
                              )
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={locked || savingGoalId === goalId}
                          loading={savingGoalId === goalId}
                          onClick={() => handleSaveDraft(goalId)}
                        >
                          Save Draft
                        </Button>
                        {submitted && <Badge variant="success">Submitted</Badge>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

          <div className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-3">
            <p className="caption">
              Once submitted, self review fields become read-only.
            </p>
            <Button
              onClick={handleSubmitSelfReview}
              loading={submittingSelfReview}
              disabled={submittingSelfReview || selfReviewRows.length === 0 || allSubmitted}
            >
              Submit Self Review
            </Button>
          </div>
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

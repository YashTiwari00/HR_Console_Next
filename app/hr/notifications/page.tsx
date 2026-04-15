"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Grid, Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Card, Dropdown, Input, Textarea } from "@/src/components/ui";
import { buildCsv, dateStamp, downloadCsvFile } from "@/src/lib/csvExport";
import {
  createNotificationTemplate,
  enqueueNotificationJob,
  fetchNotificationJobs,
  fetchNotificationTemplates,
  fetchTeamMembers,
  NotificationJobItem,
  NotificationTemplateItem,
  TeamMemberItem,
} from "@/app/employee/_lib/pmsClient";

const triggerOptions = [
  { label: "Manual", value: "manual" },
  { label: "Goal Added", value: "goal_added" },
  { label: "Check-in Submitted", value: "checkin_submitted" },
  { label: "Goal Pending Approval", value: "goal_pending_approval" },
  { label: "Goal Approved", value: "goal_approved" },
  { label: "Meeting Scheduled", value: "meeting_scheduled" },
  { label: "Deadline Near", value: "deadline_near" },
  { label: "Check-in Overdue", value: "checkin_overdue" },
  { label: "Review Pending", value: "review_pending" },
  { label: "Cycle Deadline", value: "cycle_deadline" },
];

const channelOptions = [
  { label: "In-App", value: "in_app" },
  { label: "Email", value: "email" },
];

function statusVariant(status: string) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "sent") return "success" as const;
  if (normalized === "retry" || normalized === "processing") return "warning" as const;
  if (normalized === "failed") return "danger" as const;
  return "default" as const;
}

export default function HrNotificationsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [templates, setTemplates] = useState<NotificationTemplateItem[]>([]);
  const [jobs, setJobs] = useState<NotificationJobItem[]>([]);
  const [members, setMembers] = useState<TeamMemberItem[]>([]);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [enqueueingJob, setEnqueueingJob] = useState(false);

  const [templateForm, setTemplateForm] = useState({
    name: "",
    triggerType: "manual",
    channel: "in_app",
    subject: "",
    body: "",
    suppressWindowMinutes: "10",
  });

  const [jobForm, setJobForm] = useState({
    userId: "",
    templateId: "",
    triggerType: "manual",
    channel: "in_app",
    title: "",
    message: "",
    actionUrl: "/employee/timeline",
    maxAttempts: "3",
  });

  const userOptions = useMemo(
    () =>
      members.map((member) => ({
        label: `${member.name} (${member.role})`,
        value: member.$id,
      })),
    [members]
  );

  const templateOptions = useMemo(
    () =>
      templates.map((template) => ({
        label: `${template.name} (${template.channel})`,
        value: template.id,
      })),
    [templates]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [nextTemplates, nextJobs, nextMembers] = await Promise.all([
        fetchNotificationTemplates({ limit: 50, includeDisabled: true }),
        fetchNotificationJobs({ limit: 50 }),
        fetchTeamMembers(undefined, { includeManagers: true }),
      ]);

      setTemplates(nextTemplates.data || []);
      setJobs(nextJobs.data || []);
      setMembers(nextMembers || []);

      setJobForm((prev) => ({
        ...prev,
        userId: prev.userId || nextMembers[0]?.$id || "",
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load notification policy data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleCreateTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingTemplate(true);
    setError("");
    setSuccess("");

    try {
      await createNotificationTemplate({
        name: templateForm.name,
        triggerType: templateForm.triggerType,
        channel: templateForm.channel,
        subject: templateForm.subject,
        body: templateForm.body,
        suppressWindowMinutes: Number.parseInt(templateForm.suppressWindowMinutes, 10) || 0,
      });

      setSuccess("Notification template created.");
      setTemplateForm((prev) => ({ ...prev, name: "", subject: "", body: "" }));
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create template.");
    } finally {
      setCreatingTemplate(false);
    }
  }

  async function handleEnqueueJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEnqueueingJob(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        title: jobForm.title || "Pending performance action",
        message: jobForm.message || "Please review your pending workflow action.",
        actionUrl: jobForm.actionUrl || "/employee/timeline",
      };

      await enqueueNotificationJob({
        userId: jobForm.userId,
        templateId: jobForm.templateId || undefined,
        triggerType: jobForm.triggerType,
        channel: jobForm.channel,
        payload,
        maxAttempts: Number.parseInt(jobForm.maxAttempts, 10) || 3,
      });

      setSuccess("Notification job queued.");
      setJobForm((prev) => ({ ...prev, title: "", message: "" }));
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to enqueue notification job.");
    } finally {
      setEnqueueingJob(false);
    }
  }

  function handleExportTemplatesCsv() {
    const csv = buildCsv(templates, [
      { key: "id", header: "Template ID", value: (row) => row.id },
      { key: "name", header: "Name", value: (row) => row.name },
      { key: "triggerType", header: "Trigger", value: (row) => row.triggerType },
      { key: "channel", header: "Channel", value: (row) => row.channel },
      { key: "subject", header: "Subject", value: (row) => row.subject || "" },
      { key: "body", header: "Body", value: (row) => row.body || "" },
      { key: "isEnabled", header: "Enabled", value: (row) => row.isEnabled ? "yes" : "no" },
      { key: "suppressWindowMinutes", header: "Suppress Window Minutes", value: (row) => row.suppressWindowMinutes ?? "" },
    ]);
    downloadCsvFile(csv, `hr-notification-templates-${dateStamp()}.csv`);
  }

  function handleExportJobsCsv() {
    const csv = buildCsv(jobs, [
      { key: "id", header: "Job ID", value: (row) => row.id },
      { key: "userId", header: "User ID", value: (row) => row.userId },
      { key: "templateId", header: "Template ID", value: (row) => row.templateId || "" },
      { key: "triggerType", header: "Trigger", value: (row) => row.triggerType },
      { key: "channel", header: "Channel", value: (row) => row.channel },
      { key: "status", header: "Status", value: (row) => row.status },
      { key: "attemptCount", header: "Attempt Count", value: (row) => row.attemptCount ?? 0 },
      { key: "maxAttempts", header: "Max Attempts", value: (row) => row.maxAttempts ?? 0 },
      { key: "scheduledAt", header: "Scheduled At", value: (row) => row.scheduledAt },
      { key: "processedAt", header: "Processed At", value: (row) => row.processedAt || "" },
      { key: "lastError", header: "Last Error", value: (row) => row.lastError || "" },
    ]);
    downloadCsvFile(csv, `hr-notification-jobs-${dateStamp()}.csv`);
  }

  return (
    <Stack gap="4">
      <PageHeader
        title="Notification Policy"
        subtitle="Manage reminder templates and queue jobs for employee nudges."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={handleExportTemplatesCsv} disabled={loading || templates.length === 0}>
              Download CSV: Templates
            </Button>
            <Button variant="secondary" size="sm" onClick={handleExportJobsCsv} disabled={loading || jobs.length === 0}>
              Download CSV: Jobs
            </Button>
            <Button variant="secondary" onClick={loadData} disabled={loading}>
              Refresh
            </Button>
          </div>
        }
      />

      {error && <Alert variant="error" title="Unable to continue" description={error} onDismiss={() => setError("")} />}
      {success && <Alert variant="success" title="Done" description={success} onDismiss={() => setSuccess("")} />}

      <Grid cols={1} colsLg={2} gap="3">
        <Card title="Create Template" description="Define reusable reminder message templates.">
          <form className="space-y-3" onSubmit={handleCreateTemplate}>
            <Input
              label="Template Name"
              value={templateForm.name}
              onChange={(event) => setTemplateForm((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
            <Grid cols={1} colsMd={2} gap="2">
              <Dropdown
                label="Trigger"
                value={templateForm.triggerType}
                options={triggerOptions}
                onChange={(value) => setTemplateForm((prev) => ({ ...prev, triggerType: value }))}
              />
              <Dropdown
                label="Channel"
                value={templateForm.channel}
                options={channelOptions}
                onChange={(value) => setTemplateForm((prev) => ({ ...prev, channel: value }))}
              />
            </Grid>
            <Input
              label="Subject"
              value={templateForm.subject}
              onChange={(event) => setTemplateForm((prev) => ({ ...prev, subject: event.target.value }))}
            />
            <Textarea
              label="Body"
              value={templateForm.body}
              onChange={(event) => setTemplateForm((prev) => ({ ...prev, body: event.target.value }))}
              required
            />
            <Input
              label="Suppress Window (minutes)"
              type="number"
              min={0}
              max={10080}
              value={templateForm.suppressWindowMinutes}
              onChange={(event) =>
                setTemplateForm((prev) => ({ ...prev, suppressWindowMinutes: event.target.value }))
              }
            />
            <Button type="submit" loading={creatingTemplate}>Create Template</Button>
          </form>
        </Card>

        <Card title="Queue Job" description="Schedule a reminder for a specific user.">
          <form className="space-y-3" onSubmit={handleEnqueueJob}>
            <Dropdown
              label="Target User"
              value={jobForm.userId}
              options={userOptions}
              onChange={(value) => setJobForm((prev) => ({ ...prev, userId: value }))}
            />
            <Dropdown
              label="Template (optional)"
              value={jobForm.templateId}
              options={[{ label: "None", value: "" }, ...templateOptions]}
              onChange={(value) => setJobForm((prev) => ({ ...prev, templateId: value }))}
            />
            <Grid cols={1} colsMd={2} gap="2">
              <Dropdown
                label="Trigger"
                value={jobForm.triggerType}
                options={triggerOptions}
                onChange={(value) => setJobForm((prev) => ({ ...prev, triggerType: value }))}
              />
              <Dropdown
                label="Channel"
                value={jobForm.channel}
                options={channelOptions}
                onChange={(value) => setJobForm((prev) => ({ ...prev, channel: value }))}
              />
            </Grid>
            <Input
              label="Title"
              value={jobForm.title}
              onChange={(event) => setJobForm((prev) => ({ ...prev, title: event.target.value }))}
            />
            <Textarea
              label="Message"
              value={jobForm.message}
              onChange={(event) => setJobForm((prev) => ({ ...prev, message: event.target.value }))}
            />
            <Input
              label="Action URL"
              value={jobForm.actionUrl}
              onChange={(event) => setJobForm((prev) => ({ ...prev, actionUrl: event.target.value }))}
            />
            <Input
              label="Max Attempts"
              type="number"
              min={1}
              max={20}
              value={jobForm.maxAttempts}
              onChange={(event) => setJobForm((prev) => ({ ...prev, maxAttempts: event.target.value }))}
            />
            <Button type="submit" loading={enqueueingJob}>Queue Job</Button>
          </form>
        </Card>
      </Grid>

      <Card title="Templates" description="Current notification templates.">
        <Stack gap="2">
          {templates.length === 0 && <p className="caption">No templates created yet.</p>}
          {templates.map((template) => (
            <div key={template.id} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="body-sm font-medium text-[var(--color-text)]">{template.name}</p>
                <Badge variant={template.isEnabled ? "success" : "warning"}>
                  {template.isEnabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>
              <p className="caption mt-1">{template.triggerType} • {template.channel}</p>
              <p className="caption mt-1">{template.subject || "No subject"}</p>
            </div>
          ))}
        </Stack>
      </Card>

      <Card title="Recent Jobs" description="Latest notification queue activity.">
        <Stack gap="2">
          {jobs.length === 0 && <p className="caption">No queued jobs yet.</p>}
          {jobs.map((job) => (
            <div key={job.id} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="body-sm font-medium text-[var(--color-text)]">{job.triggerType}</p>
                <Badge variant={statusVariant(job.status)}>{job.status}</Badge>
              </div>
              <p className="caption mt-1">user: {job.userId}</p>
              <p className="caption mt-1">scheduled: {new Date(job.scheduledAt).toUTCString()}</p>
            </div>
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}
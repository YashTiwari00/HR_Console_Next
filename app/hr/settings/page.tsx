"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Grid, Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Card, Input } from "@/src/components/ui";
import {
  fetchGoals,
  fetchHrCycleAutoApprovalConfig,
  GoalItem,
  updateHrCycleAutoApprovalConfig,
} from "@/app/employee/_lib/pmsClient";

function getCurrentCycleId() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const quarter = Math.floor(now.getUTCMonth() / 3) + 1;
  return `Q${quarter}-${year}`;
}

export default function HrSettingsPage() {
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [cycleId, setCycleId] = useState("");
  const [autoApprovalEnabled, setAutoApprovalEnabled] = useState(false);
  const [autoApprovalDays, setAutoApprovalDays] = useState("7");
  const [saving, setSaving] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);

  const cycleOptions = useMemo(() => {
    const values = new Set<string>();
    goals.forEach((goal) => {
      const value = String(goal.cycleId || "").trim().toUpperCase();
      if (value) values.add(value);
    });

    if (values.size === 0) {
      values.add(getCurrentCycleId());
    }

    return Array.from(values).sort((a, b) => b.localeCompare(a));
  }, [goals]);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const nextGoals = await fetchGoals("all");
      setGoals(nextGoals || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load HR settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCycleConfig = useCallback(async () => {
    const selectedCycleId = String(cycleId || "").trim().toUpperCase();
    if (!selectedCycleId) return;

    setLoadingConfig(true);
    setError("");

    try {
      const config = await fetchHrCycleAutoApprovalConfig(selectedCycleId);
      setAutoApprovalEnabled(Boolean(config.autoApprovalEnabled));
      setAutoApprovalDays(String(config.autoApprovalDays || 7));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load cycle settings.");
    } finally {
      setLoadingConfig(false);
    }
  }, [cycleId]);

  const saveCycleConfig = useCallback(async () => {
    const selectedCycleId = String(cycleId || "").trim().toUpperCase();
    if (!selectedCycleId) {
      setError("Select a cycle first.");
      return;
    }

    const parsedDays = Number.parseInt(String(autoApprovalDays || ""), 10);
    if (Number.isNaN(parsedDays) || parsedDays < 1 || parsedDays > 90) {
      setError("Auto-approve days must be between 1 and 90.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const updated = await updateHrCycleAutoApprovalConfig(selectedCycleId, {
        autoApprovalEnabled,
        autoApprovalDays: parsedDays,
      });

      setAutoApprovalEnabled(Boolean(updated.autoApprovalEnabled));
      setAutoApprovalDays(String(updated.autoApprovalDays || parsedDays));
      setSuccess(`Saved auto-approval settings for ${selectedCycleId}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save cycle settings.");
    } finally {
      setSaving(false);
    }
  }, [autoApprovalDays, autoApprovalEnabled, cycleId]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  useEffect(() => {
    setCycleId((prev) => {
      if (prev && cycleOptions.includes(prev)) return prev;
      return cycleOptions[0] || "";
    });
  }, [cycleOptions]);

  useEffect(() => {
    if (!cycleId) return;
    loadCycleConfig();
  }, [cycleId, loadCycleConfig]);

  return (
    <Stack gap="4">
      <PageHeader
        title="HR Settings"
        subtitle="Manage cycle-level policy controls for automated goal approvals."
        actions={
          <Button variant="secondary" onClick={loadPage} disabled={loading || saving || loadingConfig}>
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="error" title="Unable to continue" description={error} onDismiss={() => setError("")} />}
      {success && <Alert variant="success" title="Saved" description={success} onDismiss={() => setSuccess("")} />}

      <Grid cols={1} colsLg={2} gap="3">
        <Card title="Goal Auto-Approval" description="If a manager does not act in time, goals can auto-approve after a cycle-specific threshold.">
          <Stack gap="3">
            <div>
              <label className="caption text-[var(--color-text-muted)]" htmlFor="hr-settings-cycle-id">
                Cycle
              </label>
              <select
                id="hr-settings-cycle-id"
                className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 body-sm text-[var(--color-text)]"
                value={cycleId}
                onChange={(event) => setCycleId(event.target.value)}
                disabled={loading || saving || loadingConfig}
              >
                {cycleOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <Input
              label="Auto-Approve After (Days)"
              type="number"
              min={1}
              max={90}
              value={autoApprovalDays}
              onChange={(event) => setAutoApprovalDays(event.target.value)}
              disabled={loading || saving || loadingConfig}
            />

            <label className="inline-flex w-fit items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
              <input
                type="checkbox"
                checked={autoApprovalEnabled}
                onChange={(event) => setAutoApprovalEnabled(event.target.checked)}
                disabled={loading || saving || loadingConfig}
              />
              <span className="body-sm text-[var(--color-text)]">Enable Auto-Approval</span>
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" onClick={loadCycleConfig} disabled={loading || saving || loadingConfig}>
                {loadingConfig ? "Loading..." : "Reload Cycle"}
              </Button>
              <Button type="button" onClick={saveCycleConfig} disabled={loading || saving || loadingConfig}>
                {saving ? "Saving..." : "Save Policy"}
              </Button>
              <Badge variant={autoApprovalEnabled ? "success" : "default"}>
                {autoApprovalEnabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>
          </Stack>
        </Card>

        <Card title="How It Works" description="Operational behavior for this policy.">
          <Stack gap="2">
            <p className="body-sm text-[var(--color-text)]">Managers receive a reminder 1 day before auto-approval.</p>
            <p className="body-sm text-[var(--color-text)]">The scheduler checks submitted goals daily and auto-approves overdue items.</p>
            <p className="body-sm text-[var(--color-text)]">Auto-approved records are written with system audit markers for traceability.</p>
          </Stack>
        </Card>
      </Grid>
    </Stack>
  );
}

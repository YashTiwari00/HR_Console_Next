"use client";

import { useCallback, useEffect, useState } from "react";
import { Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Card } from "@/src/components/ui";
import {
  fetchCurrentUserContext,
  fetchGoogleTokenStatusForUser,
  fetchTeamMembers,
  formatDate,
  GoogleTokenStatus,
  TeamMemberItem,
  upsertGoogleTokenAsAdmin,
} from "@/app/employee/_lib/pmsClient";

export default function ManagerGoogleTokenSetupPage() {
  const [teamMembers, setTeamMembers] = useState<TeamMemberItem[]>([]);
  const [debugTargetUserId, setDebugTargetUserId] = useState("");
  const [debugAccessToken, setDebugAccessToken] = useState("");
  const [debugRefreshToken, setDebugRefreshToken] = useState("");
  const [debugExpiry, setDebugExpiry] = useState("");
  const [debugScope, setDebugScope] = useState("");
  const [debugTokenStatus, setDebugTokenStatus] = useState<GoogleTokenStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [context, members] = await Promise.all([
        fetchCurrentUserContext(),
        fetchTeamMembers(),
      ]);

      setTeamMembers(members.filter((item) => item.role === "employee"));
      setDebugTargetUserId((current) => current || String(context?.profile?.$id || ""));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load token setup data.");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshDebugTokenStatus = useCallback(async () => {
    if (!debugTargetUserId) {
      setDebugTokenStatus(null);
      return;
    }

    try {
      const status = await fetchGoogleTokenStatusForUser(debugTargetUserId);
      setDebugTokenStatus(status);
    } catch (err) {
      setDebugTokenStatus(null);
      setError(err instanceof Error ? err.message : "Unable to fetch token status.");
    }
  }, [debugTargetUserId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    refreshDebugTokenStatus();
  }, [refreshDebugTokenStatus]);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!debugTargetUserId || (!debugAccessToken && !debugRefreshToken)) {
      setError("Select target user and provide at least one token. Use refresh token for one-time setup.");
      return;
    }

    setSaving(true);
    try {
      await upsertGoogleTokenAsAdmin({
        targetUserId: debugTargetUserId,
        accessToken: debugAccessToken || undefined,
        refreshToken: debugRefreshToken || undefined,
        expiry: debugExpiry ? new Date(debugExpiry).toISOString() : undefined,
        scope: debugScope || undefined,
      });

      setDebugAccessToken("");
      setSuccess("Token saved. With refresh token stored, you should not need to enter token again.");
      await refreshDebugTokenStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save token.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack gap="4">
      <PageHeader
        title="Google Token Setup"
        subtitle="One-time token setup page for manager and HR. Save refresh token once to avoid repeated manual entry."
        actions={
          <Button variant="secondary" onClick={loadData} disabled={loading}>
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="error" title="Unable to continue" description={error} onDismiss={() => setError("")} />}
      {success && <Alert variant="success" title="Done" description={success} onDismiss={() => setSuccess("")} />}

      <Card title="Token Setup" description="Email is auto-resolved from user profile. Refresh token is enough for long-term setup.">
        <form className="space-y-3" onSubmit={handleSave}>
          <select
            className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 body-sm"
            value={debugTargetUserId}
            onChange={(event) => setDebugTargetUserId(event.target.value)}
            required
          >
            <option value="">Select target user</option>
            {teamMembers.map((member) => (
              <option key={member.$id} value={member.$id}>
                {member.name || member.email || member.$id}
              </option>
            ))}
          </select>

          <input
            type="password"
            className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 body-sm"
            placeholder="Refresh token (recommended)"
            value={debugRefreshToken}
            onChange={(event) => setDebugRefreshToken(event.target.value)}
          />

          <input
            type="password"
            className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 body-sm"
            placeholder="Access token (optional)"
            value={debugAccessToken}
            onChange={(event) => setDebugAccessToken(event.target.value)}
          />

          <div className="grid gap-3 md:grid-cols-2">
            <input
              type="datetime-local"
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 body-sm"
              value={debugExpiry}
              onChange={(event) => setDebugExpiry(event.target.value)}
            />
            <input
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 body-sm"
              placeholder="Scope (optional)"
              value={debugScope}
              onChange={(event) => setDebugScope(event.target.value)}
            />
          </div>

          <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Token"}</Button>
        </form>

        <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="caption">Selected user token status</p>
            <div className="flex items-center gap-2">
              <Badge variant={debugTokenStatus?.connected ? "success" : "warning"}>
                {debugTokenStatus?.connected
                  ? debugTokenStatus.reason === "expired"
                    ? "expired"
                    : "connected"
                  : "not connected"}
              </Badge>
              <Button variant="ghost" onClick={refreshDebugTokenStatus}>
                Refresh Status
              </Button>
            </div>
          </div>
          {debugTokenStatus?.email && <p className="caption mt-1">Email: {debugTokenStatus.email}</p>}
          {debugTokenStatus?.expiresAt && <p className="caption mt-1">Expires: {formatDate(debugTokenStatus.expiresAt)}</p>}
        </div>
      </Card>
    </Stack>
  );
}

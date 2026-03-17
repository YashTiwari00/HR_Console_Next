"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Grid, Stack } from "@/src/components/layout";
import { DataTable, PageHeader } from "@/src/components/patterns";
import type { DataTableColumn } from "@/src/components/patterns";
import { Alert, Badge, Button, Card } from "@/src/components/ui";
import {
  AppRole,
  fetchHrManagers,
  HrManagerSummary,
  updateUserRoleAsHr,
} from "@/app/employee/_lib/pmsClient";

interface HrManagerRow extends Record<string, unknown> {
  managerId: string;
  managerName: string;
  managerEmail: string;
  teamSize: number;
  teamGoals: number;
  teamAverageProgress: number;
  pendingManagerGoalApprovals: number;
  pendingCheckInApprovals: number;
}

export default function HrDashboardPage() {
  const [rows, setRows] = useState<HrManagerSummary[]>([]);
  const [selectedManagerId, setSelectedManagerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reassignUserId, setReassignUserId] = useState("");
  const [reassignRole, setReassignRole] = useState<AppRole>("employee");
  const [reassignLoading, setReassignLoading] = useState(false);
  const [reassignMessage, setReassignMessage] = useState("");
  const [reassignError, setReassignError] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const nextRows = await fetchHrManagers();
      setRows(nextRows);

      if (nextRows.length > 0) {
        setSelectedManagerId((prev) => {
          if (prev && nextRows.some((item) => item.managerId === prev)) {
            return prev;
          }

          return nextRows[0].managerId;
        });
      } else {
        setSelectedManagerId("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load HR dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const managerRows = useMemo<HrManagerRow[]>(
    () =>
      rows.map((item) => ({
        managerId: item.managerId,
        managerName: item.managerName,
        managerEmail: item.managerEmail,
        teamSize: item.teamSize,
        teamGoals: item.teamGoals,
        teamAverageProgress: item.teamAverageProgress,
        pendingManagerGoalApprovals: item.pendingManagerGoalApprovals,
        pendingCheckInApprovals: item.pendingCheckInApprovals,
      })),
    [rows]
  );

  const selectedManager = useMemo(
    () => rows.find((item) => item.managerId === selectedManagerId) || null,
    [rows, selectedManagerId]
  );

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, item) => {
          acc.managers += 1;
          acc.pendingGoalApprovals += item.pendingManagerGoalApprovals;
          acc.pendingCheckInApprovals += item.pendingCheckInApprovals;
          acc.teamGoals += item.teamGoals;
          return acc;
        },
        { managers: 0, pendingGoalApprovals: 0, pendingCheckInApprovals: 0, teamGoals: 0 }
      ),
    [rows]
  );

  const columns = useMemo<DataTableColumn<HrManagerRow>[]>(
    () => [
      {
        key: "managerName",
        header: "Manager",
        render: (_value: unknown, row: HrManagerRow) => (
          <div>
            <p className="body-sm font-medium text-[var(--color-text)]">{row.managerName}</p>
            <p className="caption">{row.managerEmail}</p>
          </div>
        ),
      },
      {
        key: "teamSize",
        header: "Team",
        align: "center",
      },
      {
        key: "teamAverageProgress",
        header: "Team Progress",
        align: "center",
        render: (_value: unknown, row: HrManagerRow) => <span>{row.teamAverageProgress}%</span>,
      },
      {
        key: "pendingManagerGoalApprovals",
        header: "Goals Pending",
        align: "center",
        render: (_value: unknown, row: HrManagerRow) => (
          <Badge variant={row.pendingManagerGoalApprovals > 0 ? "warning" : "success"}>
            {row.pendingManagerGoalApprovals}
          </Badge>
        ),
      },
      {
        key: "pendingCheckInApprovals",
        header: "Check-ins Pending",
        align: "center",
        render: (_value: unknown, row: HrManagerRow) => (
          <Badge variant={row.pendingCheckInApprovals > 0 ? "warning" : "success"}>
            {row.pendingCheckInApprovals}
          </Badge>
        ),
      },
      {
        key: "managerId",
        header: "Action",
        align: "right",
        render: (_value: unknown, row: HrManagerRow) => (
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant={row.managerId === selectedManagerId ? "primary" : "secondary"}
              onClick={() => setSelectedManagerId(row.managerId)}
            >
              {row.managerId === selectedManagerId ? "Expanded" : "Expand"}
            </Button>
            <Link
              href={`/hr/managers/${encodeURIComponent(row.managerId)}`}
              className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 body-sm font-medium text-[var(--color-text)] transition-colors duration-150 hover:bg-[var(--color-surface-muted)]"
            >
              Open
            </Link>
          </div>
        ),
      },
    ],
    [selectedManagerId]
  );

  const handleRoleReassign = useCallback(async () => {
    const userId = reassignUserId.trim();

    if (!userId) {
      setReassignError("Enter a valid user ID.");
      return;
    }

    setReassignLoading(true);
    setReassignError("");
    setReassignMessage("");

    try {
      const result = await updateUserRoleAsHr(userId, reassignRole);

      if (result.changed) {
        setReassignMessage(`Role updated to ${result.role} for ${result.userId}.`);
      } else {
        setReassignMessage(`No change needed. User is already ${result.role}.`);
      }
    } catch (err) {
      setReassignError(err instanceof Error ? err.message : "Role reassignment failed.");
    } finally {
      setReassignLoading(false);
    }
  }, [reassignRole, reassignUserId]);

  return (
    <Stack gap="4">
      <PageHeader
        title="HR Dashboard"
        subtitle="Monitor manager-level team progress, approvals, and check-in cadence across the organization."
        actions={
          <Button variant="secondary" onClick={loadDashboard} disabled={loading}>
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="error" title="Unable to load" description={error} onDismiss={() => setError("")} />}

      <Grid cols={1} colsMd={4} gap="3">
        <Card title="Managers Tracked" className="bg-[linear-gradient(160deg,var(--color-surface)_0%,var(--color-surface-muted)_100%)]">
          <p className="heading-xl">{loading ? "..." : totals.managers}</p>
        </Card>
        <Card title="Team Goals" className="bg-[linear-gradient(160deg,var(--color-surface)_0%,var(--color-surface-muted)_100%)]">
          <p className="heading-xl">{loading ? "..." : totals.teamGoals}</p>
        </Card>
        <Card title="Pending Manager Goals" className="bg-[linear-gradient(160deg,var(--color-surface)_0%,var(--color-surface-muted)_100%)]">
          <p className="heading-xl">{loading ? "..." : totals.pendingGoalApprovals}</p>
        </Card>
        <Card title="Pending Manager Check-ins" className="bg-[linear-gradient(160deg,var(--color-surface)_0%,var(--color-surface-muted)_100%)]">
          <p className="heading-xl">{loading ? "..." : totals.pendingCheckInApprovals}</p>
        </Card>
      </Grid>

      <Card title="Managers Overview" description="Expand a manager for quick team preview or open full drill-down.">
        <DataTable
          columns={columns}
          rows={managerRows}
          loading={loading}
          rowKey={(row) => row.managerId}
          emptyMessage="No managers available yet."
        />
      </Card>

      <Card title="Role Reassignment" description="HR-only action to reassign a user role by Appwrite user ID.">
        <Stack gap="2">
          {reassignError && (
            <Alert
              variant="error"
              title="Reassignment failed"
              description={reassignError}
              onDismiss={() => setReassignError("")}
            />
          )}

          {reassignMessage && (
            <Alert
              variant="success"
              title="Role updated"
              description={reassignMessage}
              onDismiss={() => setReassignMessage("")}
            />
          )}

          <div className="grid gap-3 md:grid-cols-[1.8fr_1fr_auto]">
            <input
              type="text"
              value={reassignUserId}
              onChange={(event) => setReassignUserId(event.target.value)}
              placeholder="User ID"
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[var(--color-text)] outline-none"
            />

            <select
              value={reassignRole}
              onChange={(event) => setReassignRole(event.target.value as AppRole)}
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[var(--color-text)] outline-none"
            >
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
              <option value="hr">HR</option>
            </select>

            <Button type="button" onClick={handleRoleReassign} disabled={reassignLoading}>
              {reassignLoading ? "Updating..." : "Update Role"}
            </Button>
          </div>
        </Stack>
      </Card>

      <Card title="Expanded Manager Snapshot" description="Quick preview of team members and pending governance actions.">
        <Stack gap="2">
          {!loading && !selectedManager && <p className="caption">Select a manager row to preview their team.</p>}

          {selectedManager && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="info">Manager: {selectedManager.managerName}</Badge>
                <Badge variant="default">Team: {selectedManager.teamSize}</Badge>
                <Badge variant="warning">Pending Goals: {selectedManager.pendingManagerGoalApprovals}</Badge>
                <Badge variant="warning">Pending Check-ins: {selectedManager.pendingCheckInApprovals}</Badge>
              </div>

              {selectedManager.teamMembers.length === 0 ? (
                <p className="caption">No team members mapped yet.</p>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  {selectedManager.teamMembers.map((member) => (
                    <div
                      key={member.$id}
                      className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2"
                    >
                      <p className="body-sm text-[var(--color-text)]">{member.name || member.email || member.$id}</p>
                      <p className="caption">{member.email || "No email"}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}

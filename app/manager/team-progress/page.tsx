"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Grid, Stack } from "@/src/components/layout";
import { DataTable, PageHeader } from "@/src/components/patterns";
import type { DataTableColumn } from "@/src/components/patterns";
import { Alert, Avatar, Badge, Button, Card, Dropdown, Input } from "@/src/components/ui";
import {
  fetchGoals,
  fetchProgressUpdates,
  fetchTeamMembers,
  formatDate,
  getAttachmentDownloadPath,
  GoalItem,
  goalStatusVariant,
  ProgressUpdateItem,
  RagStatus,
  TeamMemberItem,
} from "@/app/employee/_lib/pmsClient";

interface TeamMemberRow extends Record<string, unknown> {
  $id: string;
  name: string;
  email: string;
  role: string;
  department: string;
}

function isWithinDateRange(dateValue: string, fromDate: string, toDate: string) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.valueOf())) return false;

  if (fromDate) {
    const from = new Date(`${fromDate}T00:00:00.000Z`);
    if (date < from) return false;
  }

  if (toDate) {
    const to = new Date(`${toDate}T23:59:59.999Z`);
    if (date > to) return false;
  }

  return true;
}

function getWeeklyProgressDelta(updates: ProgressUpdateItem[]) {
  if (updates.length === 0) {
    return { delta: null as number | null, latest: null as number | null };
  }

  const sorted = [...updates].sort(
    (a, b) => new Date(b.createdAt).valueOf() - new Date(a.createdAt).valueOf()
  );

  const latest = sorted[0];
  const latestTime = new Date(latest.createdAt).valueOf();
  if (Number.isNaN(latestTime)) {
    return { delta: null as number | null, latest: latest.percentComplete ?? 0 };
  }

  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const baselineTime = latestTime - sevenDaysMs;

  const baseline = sorted.find((item) => {
    const itemTime = new Date(item.createdAt).valueOf();
    return !Number.isNaN(itemTime) && itemTime <= baselineTime;
  });

  if (!baseline) {
    return { delta: null as number | null, latest: latest.percentComplete ?? 0 };
  }

  return {
    delta: Math.round((latest.percentComplete || 0) - (baseline.percentComplete || 0)),
    latest: latest.percentComplete || 0,
  };
}

function ragVariant(status: RagStatus) {
  if (status === "completed") return "success" as const;
  if (status === "behind") return "warning" as const;
  return "info" as const;
}

function initialsFromName(name: string) {
  const parts = name
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return "NA";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

export default function ManagerTeamProgressPage() {
  const [teamMembers, setTeamMembers] = useState<TeamMemberItem[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [updates, setUpdates] = useState<ProgressUpdateItem[]>([]);
  const [memberQuery, setMemberQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [updateFromDate, setUpdateFromDate] = useState("");
  const [updateToDate, setUpdateToDate] = useState("");

  const [teamLoading, setTeamLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedEmployee = useMemo(
    () => teamMembers.find((item) => item.$id === selectedEmployeeId) || null,
    [teamMembers, selectedEmployeeId]
  );

  const averageProgress = useMemo(() => {
    if (goals.length === 0) return 0;
    const total = goals.reduce((sum, item) => sum + (item.progressPercent || 0), 0);
    return Math.round(total / goals.length);
  }, [goals]);

  const latestUpdate = updates[0] || null;
  const weeklyTrend = useMemo(() => getWeeklyProgressDelta(updates), [updates]);

  const teamRows = useMemo<TeamMemberRow[]>(
    () =>
      teamMembers.map((member) => ({
        $id: member.$id,
        name: member.name || "Unnamed",
        email: member.email || "",
        role: member.role || "employee",
        department: member.department || "Not set",
      })),
    [teamMembers]
  );

  const departmentOptions = useMemo(() => {
    const values = Array.from(new Set(teamRows.map((row) => row.department))).sort();
    return [
      { value: "all", label: "All Departments" },
      ...values.map((value) => ({ value, label: value })),
    ];
  }, [teamRows]);

  const filteredTeamRows = useMemo(() => {
    const normalizedQuery = memberQuery.trim().toLowerCase();

    return teamRows.filter((row) => {
      const matchesQuery =
        !normalizedQuery ||
        row.name.toLowerCase().includes(normalizedQuery) ||
        row.email.toLowerCase().includes(normalizedQuery) ||
        row.department.toLowerCase().includes(normalizedQuery);

      const matchesDepartment = departmentFilter === "all" || row.department === departmentFilter;

      return matchesQuery && matchesDepartment;
    });
  }, [teamRows, memberQuery, departmentFilter]);

  const filteredUpdates = useMemo(
    () =>
      updates.filter((item) => isWithinDateRange(item.createdAt, updateFromDate, updateToDate)),
    [updates, updateFromDate, updateToDate]
  );

  const loadTeamMembers = useCallback(async () => {
    setTeamLoading(true);
    setError("");

    try {
      const members = await fetchTeamMembers();
      setTeamMembers(members);

      if (members.length === 0) {
        setSelectedEmployeeId("");
        setGoals([]);
        setUpdates([]);
        return;
      }

      setSelectedEmployeeId((prev) => {
        if (prev && members.some((item) => item.$id === prev)) {
          return prev;
        }

        return members[0].$id;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load team members.");
    } finally {
      setTeamLoading(false);
    }
  }, []);

  const loadEmployeeDetails = useCallback(async (employeeId: string) => {
    if (!employeeId) {
      setGoals([]);
      setUpdates([]);
      return;
    }

    setDetailsLoading(true);
    setError("");

    try {
      const [goalData, updateData] = await Promise.all([
        fetchGoals("team", employeeId),
        fetchProgressUpdates(undefined, "team", employeeId),
      ]);

      setGoals(goalData);
      setUpdates(updateData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load employee progress.");
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTeamMembers();
  }, [loadTeamMembers]);

  useEffect(() => {
    if (!selectedEmployeeId) return;
    loadEmployeeDetails(selectedEmployeeId);
  }, [selectedEmployeeId, loadEmployeeDetails]);

  useEffect(() => {
    setUpdateFromDate("");
    setUpdateToDate("");
  }, [selectedEmployeeId]);

  const tableColumns = useMemo<DataTableColumn<TeamMemberRow>[]>(
    () => [
      {
        key: "name",
        header: "Employee",
        render: (_value: unknown, row: TeamMemberRow) => (
          <div className="flex items-center gap-2">
            <Avatar size="sm" initials={initialsFromName(row.name)} />
            <div>
              <p className="body-sm font-medium text-[var(--color-text)]">{row.name}</p>
              <p className="caption">{row.department}</p>
            </div>
          </div>
        ),
      },
      {
        key: "role",
        header: "Role",
      },
      {
        key: "$id",
        header: "Action",
        align: "right" as const,
        render: (_value: unknown, row: TeamMemberRow) => (
          <Button
            type="button"
            size="sm"
            variant={row.$id === selectedEmployeeId ? "primary" : "secondary"}
            onClick={() => setSelectedEmployeeId(row.$id)}
          >
            {row.$id === selectedEmployeeId ? "Selected" : "View"}
          </Button>
        ),
      },
    ],
    [selectedEmployeeId]
  );

  return (
    <Stack gap="4">
      <PageHeader
        title="My Team Progress Updates"
        subtitle="Select a direct report to track current goals, updates, and status."
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              loadTeamMembers();
              if (selectedEmployeeId) {
                loadEmployeeDetails(selectedEmployeeId);
              }
            }}
            disabled={teamLoading || detailsLoading}
          >
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="error" title="Action failed" description={error} onDismiss={() => setError("")} />}

      {!teamLoading && teamMembers.length === 0 && (
        <Card title="No Team Members" description="No employees are currently assigned to you.">
          <p className="caption">Once HR assigns employees, this page will list them here.</p>
        </Card>
      )}

      <Grid cols={1} colsMd={4} gap="3">
        <Card title="Selected Employee">
          <p className="heading-xl">{selectedEmployee ? selectedEmployee.name || "Unnamed" : "-"}</p>
        </Card>
        <Card title="Goals Tracked">
          <p className="heading-xl">{detailsLoading ? "..." : goals.length}</p>
        </Card>
        <Card title="Average Progress">
          <p className="heading-xl">{detailsLoading ? "..." : `${averageProgress}%`}</p>
        </Card>
        <Card title="Weekly Delta">
          {detailsLoading ? (
            <p className="heading-xl">...</p>
          ) : weeklyTrend.delta === null ? (
            <p className="caption">Need 7-day history</p>
          ) : (
            <p className="heading-xl">{weeklyTrend.delta >= 0 ? `+${weeklyTrend.delta}%` : `${weeklyTrend.delta}%`}</p>
          )}
        </Card>
      </Grid>

      <Grid cols={1} colsLg={3} gap="3">
        <Card title="My Team" description="Direct reports assigned to your manager profile.">
          <Grid cols={1} colsMd={2} gap="2" className="mb-3">
            <Input
              label="Search Team Member"
              placeholder="Search by name, email, or department"
              value={memberQuery}
              onChange={(event) => setMemberQuery(event.target.value)}
            />
            <Dropdown
              label="Department"
              value={departmentFilter}
              onChange={setDepartmentFilter}
              options={departmentOptions}
            />
          </Grid>
          <DataTable
            columns={tableColumns}
            rows={filteredTeamRows}
            loading={teamLoading}
            rowKey={(row) => row.$id}
            emptyMessage="No team members match current filters."
          />
        </Card>

        <div className="lg:col-span-2">
          <Stack gap="3">
            <Card title="Employee Snapshot" description="Quick summary of selected employee activity.">
              {!selectedEmployee && <p className="caption">Select a team member to view their progress.</p>}
              {selectedEmployee && (
                <Grid cols={1} colsMd={2} gap="3">
                  <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-3">
                    <p className="caption">Name</p>
                    <p className="body-sm font-medium text-[var(--color-text)]">{selectedEmployee.name || "Unnamed"}</p>
                  </div>
                  <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-3">
                    <p className="caption">Department</p>
                    <p className="body-sm font-medium text-[var(--color-text)]">
                      {selectedEmployee.department || "Not set"}
                    </p>
                  </div>
                  <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-3">
                    <p className="caption">Email</p>
                    <p className="body-sm font-medium text-[var(--color-text)]">{selectedEmployee.email || "Not set"}</p>
                  </div>
                  <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-3">
                    <p className="caption">Latest Update</p>
                    <p className="body-sm font-medium text-[var(--color-text)]">
                      {latestUpdate ? formatDate(latestUpdate.createdAt) : "No updates yet"}
                    </p>
                  </div>
                </Grid>
              )}
            </Card>

            <Card title="Goal Progress" description="Goal-by-goal progress for selected employee.">
              <Stack gap="2">
                {!detailsLoading && goals.length === 0 && (
                  <p className="caption">No goals available for this employee.</p>
                )}

                {goals.map((goal) => (
                  <div
                    key={goal.$id}
                    className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="body-sm font-medium text-[var(--color-text)]">{goal.title}</p>
                      <Badge variant={goalStatusVariant(goal.status)}>{goal.status}</Badge>
                    </div>
                    <p className="caption mt-1">{goal.description}</p>
                    <p className="caption mt-2">Progress: {goal.progressPercent || 0}%</p>
                  </div>
                ))}
              </Stack>
            </Card>

            <Card title="Recent Progress Updates" description="What this employee is currently doing.">
              <Grid cols={1} colsMd={3} gap="2" className="mb-3">
                <Input
                  label="From"
                  type="date"
                  value={updateFromDate}
                  onChange={(event) => setUpdateFromDate(event.target.value)}
                />
                <Input
                  label="To"
                  type="date"
                  value={updateToDate}
                  onChange={(event) => setUpdateToDate(event.target.value)}
                />
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setUpdateFromDate("");
                      setUpdateToDate("");
                    }}
                  >
                    Clear Dates
                  </Button>
                </div>
              </Grid>

              <Stack gap="2">
                {!detailsLoading && filteredUpdates.length === 0 && (
                  <p className="caption">No progress updates in selected date range.</p>
                )}

                {filteredUpdates.slice(0, 8).map((item) => (
                  <div
                    key={item.$id}
                    className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="caption">{formatDate(item.createdAt)}</p>
                      <Badge variant={ragVariant(item.ragStatus)}>{item.ragStatus}</Badge>
                    </div>
                    <p className="body-sm mt-2 text-[var(--color-text)]">{item.updateText}</p>
                    <p className="caption mt-2">Progress: {item.percentComplete}%</p>
                    {item.attachmentIds && item.attachmentIds.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {item.attachmentIds.map((fileId) => (
                          <a
                            key={fileId}
                            href={getAttachmentDownloadPath(fileId)}
                            target="_blank"
                            rel="noreferrer"
                            className="caption text-[var(--color-primary)] hover:underline"
                          >
                            Attachment {fileId.slice(0, 8)}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </Stack>
            </Card>
          </Stack>
        </div>
      </Grid>
    </Stack>
  );
}

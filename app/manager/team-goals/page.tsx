"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Grid, Stack } from "@/src/components/layout";
import { PageHeader } from "@/src/components/patterns";
import { Alert, Badge, Button, Card, Dropdown, Input, Textarea } from "@/src/components/ui";
import {
  createTeamGoal,
  fetchGoals,
  fetchMe,
  fetchTeamMembers,
  getCycleIdFromDate,
  GoalItem,
  goalStatusVariant,
  TeamMemberItem,
  updateGoal,
} from "@/app/employee/_lib/pmsClient";

type TeamGoalItem = GoalItem & {
  employeeId?: string;
  $createdAt?: string;
};

const frameworkOptions = [
  { value: "OKR", label: "OKR" },
  { value: "MBO", label: "MBO" },
  { value: "HYBRID", label: "HYBRID" },
];

function canEditGoalStatus(status: GoalItem["status"]) {
  return status === "draft" || status === "needs_changes";
}

export default function ManagerTeamGoalsPage() {
  const [teamMembers, setTeamMembers] = useState<TeamMemberItem[]>([]);
  const [teamGoals, setTeamGoals] = useState<TeamGoalItem[]>([]);
  const [managerProfileId, setManagerProfileId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState({
    employeeId: "",
    title: "",
    description: "",
    cycleId: getCycleIdFromDate(),
    frameworkType: "OKR",
    weightage: "20",
    dueDate: "",
  });

  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    cycleId: "",
    frameworkType: "OKR",
    weightage: "20",
    dueDate: "",
  });

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [me, members, goals] = await Promise.all([
        fetchMe(),
        fetchTeamMembers(),
        fetchGoals("team"),
      ]);

      const profileId = String(me?.profile?.$id || "").trim();
      setManagerProfileId(profileId);
      setTeamMembers(members);
      setTeamGoals(
        (goals as TeamGoalItem[])
          .filter((goal) => !profileId || goal.managerId === profileId)
          .sort((a, b) => new Date(b.$createdAt || 0).getTime() - new Date(a.$createdAt || 0).getTime())
      );

      setForm((prev) => ({
        ...prev,
        employeeId: prev.employeeId || members[0]?.$id || "",
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load team goal workspace.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const teamMemberById = useMemo(() => {
    const map = new Map<string, TeamMemberItem>();
    teamMembers.forEach((member) => map.set(member.$id, member));
    return map;
  }, [teamMembers]);

  const employeeOptions = useMemo(
    () =>
      teamMembers.map((member) => ({
        value: member.$id,
        label: member.name || member.email || member.$id,
        description: member.department || member.email || "",
      })),
    [teamMembers]
  );

  const selectedEmployeeWeightage = useMemo(() => {
    if (!form.employeeId || !form.cycleId) return 0;

    return teamGoals
      .filter((goal) => goal.employeeId === form.employeeId && goal.cycleId === form.cycleId)
      .reduce((sum, goal) => sum + (Number(goal.weightage) || 0), 0);
  }, [form.cycleId, form.employeeId, teamGoals]);

  async function handleCreateGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      await createTeamGoal({
        employeeId: form.employeeId,
        title: form.title,
        description: form.description,
        cycleId: form.cycleId,
        frameworkType: form.frameworkType,
        weightage: Number.parseInt(form.weightage, 10),
        dueDate: form.dueDate || null,
      });

      setSuccess("Team goal created as draft. The employee can review and submit it.");
      setForm((prev) => ({
        ...prev,
        title: "",
        description: "",
      }));
      await loadPage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create team goal.");
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(goal: TeamGoalItem) {
    setEditingGoalId(goal.$id);
    setEditForm({
      title: goal.title,
      description: goal.description,
      cycleId: goal.cycleId,
      frameworkType: goal.frameworkType,
      weightage: String(goal.weightage),
      dueDate: "",
    });
  }

  async function handleSaveEdit(goal: TeamGoalItem) {
    setSavingEdit(true);
    setError("");
    setSuccess("");

    try {
      await updateGoal(goal.$id, {
        title: editForm.title,
        description: editForm.description,
        cycleId: editForm.cycleId,
        frameworkType: editForm.frameworkType,
        managerId: goal.managerId,
        weightage: Number.parseInt(editForm.weightage, 10),
        dueDate: editForm.dueDate || null,
      });

      setSuccess("Team goal updated.");
      setEditingGoalId(null);
      await loadPage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update team goal.");
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <Stack gap="4">
      <PageHeader
        title="Team Goal Assignment"
        subtitle="Create goals for employees assigned to you and refine drafts before submission."
        actions={
          <Button variant="secondary" onClick={loadPage} disabled={loading || submitting || savingEdit}>
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="error" title="Action failed" description={error} onDismiss={() => setError("")} />}
      {success && (
        <Alert variant="success" title="Saved" description={success} onDismiss={() => setSuccess("")} />
      )}

      <Grid cols={1} colsLg={2} gap="3">
        <Card title="Assign New Goal" description="Create draft goals for direct reports.">
          <form className="space-y-3" onSubmit={handleCreateGoal}>
            <Dropdown
              label="Employee"
              value={form.employeeId}
              options={employeeOptions}
              onChange={(employeeId) => setForm((prev) => ({ ...prev, employeeId }))}
              placeholder={loading ? "Loading team members..." : "Select employee"}
              disabled={loading || employeeOptions.length === 0}
            />

            <Input
              label="Goal Title"
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              required
            />

            <Textarea
              label="Description"
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              required
            />

            <Grid cols={1} colsMd={3} gap="2">
              <Input
                label="Cycle ID"
                value={form.cycleId}
                onChange={(event) => setForm((prev) => ({ ...prev, cycleId: event.target.value }))}
                required
              />
              <Dropdown
                label="Framework"
                value={form.frameworkType}
                options={frameworkOptions}
                onChange={(frameworkType) => setForm((prev) => ({ ...prev, frameworkType }))}
              />
              <Input
                label="Weightage"
                type="number"
                min={1}
                max={100}
                value={form.weightage}
                onChange={(event) => setForm((prev) => ({ ...prev, weightage: event.target.value }))}
                required
              />
            </Grid>

            <Input
              label="Due Date"
              type="date"
              value={form.dueDate}
              onChange={(event) => setForm((prev) => ({ ...prev, dueDate: event.target.value }))}
            />

            <p className="caption text-[var(--color-text-muted)]">
              Existing weightage for selected employee in {form.cycleId}: {selectedEmployeeWeightage}%
            </p>

            <Button
              type="submit"
              loading={submitting}
              disabled={loading || !form.employeeId || employeeOptions.length === 0}
            >
              Create Team Goal
            </Button>
          </form>
        </Card>

        <Card title="Team Goal Summary" description="Quick view of assignments managed by you.">
          <Stack gap="2">
            <p className="body-sm text-[var(--color-text)]">Assigned employees: {loading ? "..." : teamMembers.length}</p>
            <p className="body-sm text-[var(--color-text)]">Goals you manage: {loading ? "..." : teamGoals.length}</p>
            <p className="body-sm text-[var(--color-text)]">
              Draft / needs changes: {loading ? "..." : teamGoals.filter((goal) => canEditGoalStatus(goal.status)).length}
            </p>
            <p className="caption">Only goals in draft or needs_changes can be edited from this page.</p>
          </Stack>
        </Card>
      </Grid>

      <Card title="Managed Team Goals" description="Edit only draft or needs_changes goals.">
        <Stack gap="3">
          {loading && <p className="caption">Loading team goals...</p>}
          {!loading && teamGoals.length === 0 && <p className="caption">No team goals found yet.</p>}

          {teamGoals.map((goal) => {
            const employee = teamMemberById.get(String(goal.employeeId || ""));
            const editable = canEditGoalStatus(goal.status);
            const isEditing = editingGoalId === goal.$id;

            return (
              <div
                key={goal.$id}
                className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="body-sm font-medium text-[var(--color-text)]">{goal.title}</p>
                    <p className="caption mt-1">Employee: {employee?.name || goal.employeeId}</p>
                  </div>
                  <Badge variant={goalStatusVariant(goal.status)}>{goal.status}</Badge>
                </div>

                {!isEditing && (
                  <>
                    <p className="caption mt-2">{goal.description}</p>
                    <div className="mt-2 flex flex-wrap gap-3">
                      <span className="caption">Cycle: {goal.cycleId}</span>
                      <span className="caption">Framework: {goal.frameworkType}</span>
                      <span className="caption">Weightage: {goal.weightage}%</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => startEdit(goal)}
                        disabled={!editable || Boolean(editingGoalId)}
                      >
                        Edit Goal
                      </Button>
                      {!editable && <p className="caption self-center">Locked after submission.</p>}
                    </div>
                  </>
                )}

                {isEditing && (
                  <div className="mt-3 space-y-3">
                    <Input
                      label="Goal Title"
                      value={editForm.title}
                      onChange={(event) => setEditForm((prev) => ({ ...prev, title: event.target.value }))}
                      required
                    />
                    <Textarea
                      label="Description"
                      value={editForm.description}
                      onChange={(event) => setEditForm((prev) => ({ ...prev, description: event.target.value }))}
                      required
                    />
                    <Grid cols={1} colsMd={3} gap="2">
                      <Input
                        label="Cycle ID"
                        value={editForm.cycleId}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, cycleId: event.target.value }))}
                        required
                      />
                      <Dropdown
                        label="Framework"
                        value={editForm.frameworkType}
                        options={frameworkOptions}
                        onChange={(frameworkType) =>
                          setEditForm((prev) => ({ ...prev, frameworkType }))
                        }
                      />
                      <Input
                        label="Weightage"
                        type="number"
                        min={1}
                        max={100}
                        value={editForm.weightage}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, weightage: event.target.value }))}
                        required
                      />
                    </Grid>
                    <Input
                      label="Due Date"
                      type="date"
                      value={editForm.dueDate}
                      onChange={(event) => setEditForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" loading={savingEdit} onClick={() => handleSaveEdit(goal)}>
                        Save Changes
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setEditingGoalId(null)}
                        disabled={savingEdit}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </Stack>
      </Card>
    </Stack>
  );
}

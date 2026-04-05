"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Checkbox, Input, Select, Button, Alert, Badge } from "@/src/components/ui";
import type { GoalItem, TeamMemberItem } from "@/app/employee/_lib/pmsClient";
import { createGoalCascade, fetchGoals, fetchTeamMembers } from "@/app/employee/_lib/pmsClient";

export interface CascadeGoalComposerProps {
  className?: string;
  onCreated?: (goals: GoalItem[]) => void;
}

type SplitType = "equal" | "custom";

function toEqualSplit(employeeIds: string[]) {
  const total = employeeIds.length;
  if (total === 0) return new Map<string, number>();

  const base = Math.floor(100 / total);
  const remainder = 100 % total;
  const out = new Map<string, number>();

  employeeIds.forEach((id, index) => {
    out.set(id, base + (index < remainder ? 1 : 0));
  });

  return out;
}

function toInt(value: string, fallback = 0) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function goalOptionLabel(goal: GoalItem) {
  const cycle = String(goal.cycleId || "").trim();
  const status = String(goal.status || "").trim();
  return `${goal.title} (${cycle}${status ? ` • ${status}` : ""})`;
}

export default function CascadeGoalComposer({ className, onCreated }: CascadeGoalComposerProps) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [parentGoals, setParentGoals] = useState<GoalItem[]>([]);
  const [members, setMembers] = useState<TeamMemberItem[]>([]);

  const [parentGoalId, setParentGoalId] = useState("");
  const [splitType, setSplitType] = useState<SplitType>("equal");
  const [selectedByEmployeeId, setSelectedByEmployeeId] = useState<Record<string, boolean>>({});
  const [customContributionByEmployeeId, setCustomContributionByEmployeeId] = useState<Record<string, string>>({});

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      setLoading(true);
      setError("");

      try {
        const [goalRows, memberRows] = await Promise.all([
          fetchGoals("all"),
          fetchTeamMembers(undefined, { includeManagers: false }),
        ]);

        if (!mounted) return;

        const employeeMembers = (memberRows || []).filter((item) => item.role === "employee");

        setParentGoals(goalRows || []);
        setMembers(employeeMembers);

        if ((goalRows || []).length > 0) {
          setParentGoalId(String(goalRows[0].$id || "").trim());
        }

        const initialSelection: Record<string, boolean> = {};
        employeeMembers.forEach((member) => {
          initialSelection[member.$id] = false;
        });
        setSelectedByEmployeeId(initialSelection);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Unable to load cascading inputs.");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    bootstrap();

    return () => {
      mounted = false;
    };
  }, []);

  const selectedEmployeeIds = useMemo(
    () =>
      Object.entries(selectedByEmployeeId)
        .filter(([, selected]) => selected)
        .map(([employeeId]) => employeeId),
    [selectedByEmployeeId]
  );

  const previewRows = useMemo(() => {
    if (selectedEmployeeIds.length === 0) return [];

    if (splitType === "equal") {
      const map = toEqualSplit(selectedEmployeeIds);
      return selectedEmployeeIds.map((employeeId) => ({
        employeeId,
        contributionPercent: Number(map.get(employeeId) || 0),
      }));
    }

    return selectedEmployeeIds.map((employeeId) => ({
      employeeId,
      contributionPercent: toInt(customContributionByEmployeeId[employeeId] || "0", 0),
    }));
  }, [selectedEmployeeIds, splitType, customContributionByEmployeeId]);

  const previewTotal = useMemo(
    () => previewRows.reduce((sum, item) => sum + Number(item.contributionPercent || 0), 0),
    [previewRows]
  );

  const memberNameById = useMemo(
    () =>
      new Map(
        members.map((member) => [member.$id, member.name || member.email || member.$id] as const)
      ),
    [members]
  );

  const canSubmit =
    !loading &&
    !submitting &&
    Boolean(parentGoalId) &&
    selectedEmployeeIds.length > 0 &&
    previewRows.length > 0 &&
    previewRows.every((item) => Number.isInteger(item.contributionPercent) && item.contributionPercent >= 1) &&
    previewTotal <= 100;

  async function handleSubmit() {
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const payload =
        splitType === "equal"
          ? {
              parentGoalId,
              employeeIds: selectedEmployeeIds,
              splitStrategy: "equal" as const,
            }
          : {
              parentGoalId,
              employeeIds: selectedEmployeeIds,
              splitStrategy: {
                type: "custom" as const,
                contributions: previewRows.map((row) => ({
                  employeeId: row.employeeId,
                  contributionPercent: row.contributionPercent,
                })),
              },
            };

      const created = await createGoalCascade(payload);
      setSuccess(`${created.data.length} child goals created successfully.`);

      if (onCreated) {
        onCreated(created.data);
      }

      setSelectedByEmployeeId((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          next[key] = false;
        }
        return next;
      });
      setCustomContributionByEmployeeId({});
      setSplitType("equal");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to cascade goals.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card
      title="Cascade Goals"
      description="Select a parent goal, choose team members, set contribution split, and preview before creating child goals."
      className={className}
    >
      <div className="space-y-4">
        {error && <Alert variant="error" title="Unable to cascade" description={error} onDismiss={() => setError("")} />}
        {success && <Alert variant="success" title="Cascade complete" description={success} onDismiss={() => setSuccess("")} />}

        <Select
          label="Parent Goal"
          value={parentGoalId}
          onChange={(event) => setParentGoalId(event.target.value)}
          options={parentGoals.map((goal) => ({ value: goal.$id, label: goalOptionLabel(goal) }))}
          placeholder="Select parent goal"
          disabled={loading || parentGoals.length === 0}
        />

        <Select
          label="Split Strategy"
          value={splitType}
          onChange={(event) => setSplitType(event.target.value as SplitType)}
          options={[
            { value: "equal", label: "Equal split" },
            { value: "custom", label: "Custom split" },
          ]}
        />

        <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-3">
          <p className="body-sm font-medium text-[var(--color-text)]">Team Members</p>
          <div className="mt-3 space-y-2">
            {members.length === 0 && <p className="caption">No team members available.</p>}
            {members.map((member) => {
              const selected = Boolean(selectedByEmployeeId[member.$id]);

              return (
                <div key={member.$id} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Checkbox
                      checked={selected}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setSelectedByEmployeeId((prev) => ({ ...prev, [member.$id]: checked }));
                        if (checked && splitType === "custom" && !customContributionByEmployeeId[member.$id]) {
                          setCustomContributionByEmployeeId((prev) => ({ ...prev, [member.$id]: "0" }));
                        }
                      }}
                      label={member.name || member.email || member.$id}
                      description={member.department || member.email || ""}
                    />

                    {splitType === "custom" && selected && (
                      <Input
                        label="Contribution %"
                        type="number"
                        min={1}
                        max={100}
                        className="w-[140px]"
                        value={customContributionByEmployeeId[member.$id] || ""}
                        onChange={(event) =>
                          setCustomContributionByEmployeeId((prev) => ({
                            ...prev,
                            [member.$id]: event.target.value,
                          }))
                        }
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="body-sm font-medium text-[var(--color-text)]">Preview</p>
            <Badge variant={previewTotal > 100 ? "danger" : "info"}>Total: {previewTotal}%</Badge>
          </div>

          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left body-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="py-2 pr-3">Member</th>
                  <th className="py-2">Contribution</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row) => (
                  <tr key={row.employeeId} className="border-b border-[var(--color-border)]">
                    <td className="py-2 pr-3">{memberNameById.get(row.employeeId) || row.employeeId}</td>
                    <td className="py-2">{row.contributionPercent}%</td>
                  </tr>
                ))}
                {previewRows.length === 0 && (
                  <tr>
                    <td colSpan={2} className="py-3 caption">Select at least one team member to preview split.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {previewTotal > 100 && (
            <p className="caption mt-2 text-[var(--color-danger)]">
              Total contribution must be less than or equal to 100.
            </p>
          )}
        </div>

        <div className="flex justify-end">
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit} loading={submitting}>
            Create Child Goals
          </Button>
        </div>
      </div>
    </Card>
  );
}

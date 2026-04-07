"use client";

import { Button, Card, Input, Select } from "@/src/components/ui";

interface FiltersBarProps {
  cycleId: string;
  role: string;
  loading?: boolean;
  onCycleIdChange: (value: string) => void;
  onRoleChange: (value: string) => void;
  onApply: () => void;
  onRefresh: () => void;
}

const ROLE_OPTIONS = [
  { value: "", label: "All roles" },
  { value: "employee", label: "Employee" },
  { value: "manager", label: "Manager" },
  { value: "hr", label: "HR" },
  { value: "leadership", label: "Leadership" },
  { value: "region-admin", label: "Region Admin" },
];

export default function FiltersBar({
  cycleId,
  role,
  loading = false,
  onCycleIdChange,
  onRoleChange,
  onApply,
  onRefresh,
}: FiltersBarProps) {
  return (
    <Card
      title="Scope"
      description="Filter governance signals by cycle and role for focused operational decisions."
      className="border-[color-mix(in_srgb,var(--color-primary)_20%,var(--color-border))]"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="w-full lg:max-w-xs">
          <Input
            label="Cycle ID"
            value={cycleId}
            onChange={(event) => onCycleIdChange(event.target.value)}
            placeholder="Q2-2026"
          />
        </div>

        <div className="w-full lg:max-w-xs">
          <Select
            label="Role"
            options={ROLE_OPTIONS}
            value={role}
            onChange={(event) => onRoleChange(event.target.value)}
          />
        </div>

        <div className="flex w-full gap-2 lg:w-auto lg:ml-auto">
          <Button variant="secondary" onClick={onRefresh} disabled={loading} className="w-full lg:w-auto">
            Refresh
          </Button>
          <Button onClick={onApply} disabled={loading} className="w-full lg:w-auto">
            Apply Filters
          </Button>
        </div>
      </div>
    </Card>
  );
}

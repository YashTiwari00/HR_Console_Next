"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Grid, Stack } from "@/src/components/layout";
import { DataTable, PageHeader } from "@/src/components/patterns";
import type { DataTableColumn } from "@/src/components/patterns";
import { Alert, Badge, Button, Card, Dropdown, Input, Modal } from "@/src/components/ui";
import {
  assignEmployeeToManager,
  assignManagerToHr,
  fetchManagerAssignments,
  fetchTeamAssignments,
  ManagerAssignmentItem,
  removeEmployeeManagerAssignment,
  removeManagerHrAssignment,
  TeamMemberItem,
  updateEmployeeManagerAssignment,
  updateManagerHrAssignment,
} from "@/app/employee/_lib/pmsClient";

interface EmployeeAssignmentRow extends Record<string, unknown> {
  employeeId: string;
  name: string;
  email: string;
  department: string;
  managerId: string;
}

interface ManagerAssignmentRow extends Record<string, unknown> {
  managerId: string;
  managerName: string;
  managerEmail: string;
  department: string;
  hrId: string;
  hrName: string;
  hrEmail: string;
}

export default function HrTeamAssignmentsPage() {
  const [employees, setEmployees] = useState<TeamMemberItem[]>([]);
  const [managerAssignments, setManagerAssignments] = useState<ManagerAssignmentItem[]>([]);
  const [hrUsers, setHrUsers] = useState<TeamMemberItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [employeeQuery, setEmployeeQuery] = useState("");
  const [managerQuery, setManagerQuery] = useState("");

  const [employeeModalOpen, setEmployeeModalOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [selectedEmployeeManagerId, setSelectedEmployeeManagerId] = useState("");

  const [managerModalOpen, setManagerModalOpen] = useState(false);
  const [selectedManagerId, setSelectedManagerId] = useState("");
  const [selectedHrId, setSelectedHrId] = useState("");

  const managerById = useMemo(
    () => new Map(managerAssignments.map((item) => [item.managerId, item])),
    [managerAssignments]
  );

  const employeeRows = useMemo<EmployeeAssignmentRow[]>(
    () =>
      employees.map((item) => ({
        employeeId: item.$id,
        name: item.name || "Unnamed",
        email: item.email || "",
        department: item.department || "Not set",
        managerId: String(item.managerId || "").trim(),
      })),
    [employees]
  );

  const filteredEmployeeRows = useMemo(() => {
    const query = employeeQuery.trim().toLowerCase();
    if (!query) return employeeRows;

    return employeeRows.filter((item) => {
      const manager = managerById.get(item.managerId);
      return (
        item.name.toLowerCase().includes(query) ||
        item.email.toLowerCase().includes(query) ||
        item.department.toLowerCase().includes(query) ||
        (manager?.managerName || "").toLowerCase().includes(query)
      );
    });
  }, [employeeRows, employeeQuery, managerById]);

  const managerRows = useMemo<ManagerAssignmentRow[]>(
    () =>
      managerAssignments.map((item) => ({
        managerId: item.managerId,
        managerName: item.managerName || "Unnamed",
        managerEmail: item.managerEmail || "",
        department: item.department || "Not set",
        hrId: String(item.hrId || "").trim(),
        hrName: item.hrName || "",
        hrEmail: item.hrEmail || "",
      })),
    [managerAssignments]
  );

  const filteredManagerRows = useMemo(() => {
    const query = managerQuery.trim().toLowerCase();
    if (!query) return managerRows;

    return managerRows.filter((item) => {
      return (
        item.managerName.toLowerCase().includes(query) ||
        item.managerEmail.toLowerCase().includes(query) ||
        item.department.toLowerCase().includes(query) ||
        item.hrName.toLowerCase().includes(query) ||
        item.hrEmail.toLowerCase().includes(query)
      );
    });
  }, [managerRows, managerQuery]);

  const employeeCounts = useMemo(() => {
    const total = employeeRows.length;
    const unassigned = employeeRows.filter((item) => !item.managerId).length;
    return { total, unassigned };
  }, [employeeRows]);

  const managerCounts = useMemo(() => {
    const total = managerRows.length;
    const unassigned = managerRows.filter((item) => !item.hrId).length;
    return { total, unassigned };
  }, [managerRows]);

  const managerOptions = useMemo(
    () =>
      managerAssignments.map((item) => ({
        value: item.managerId,
        label: `${item.managerName || item.managerEmail || item.managerId} (${item.department || "No dept"})`,
      })),
    [managerAssignments]
  );

  const hrOptions = useMemo(
    () =>
      hrUsers.map((item) => ({
        value: item.$id,
        label: `${item.name || item.email || item.$id} (${item.email || "No email"})`,
      })),
    [hrUsers]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [employeeData, managerData] = await Promise.all([
        fetchTeamAssignments(),
        fetchManagerAssignments(),
      ]);

      setEmployees(employeeData);
      setManagerAssignments(managerData.data || []);
      setHrUsers((managerData.meta?.hrUsers || []).filter((item) => item.role === "hr"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load assignment data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function openEmployeeModal(row: EmployeeAssignmentRow) {
    setSelectedEmployeeId(row.employeeId);
    setSelectedEmployeeManagerId(row.managerId || "");
    setEmployeeModalOpen(true);
  }

  function openManagerModal(row: ManagerAssignmentRow) {
    setSelectedManagerId(row.managerId);
    setSelectedHrId(row.hrId || "");
    setManagerModalOpen(true);
  }

  async function handleSaveEmployeeAssignment() {
    if (!selectedEmployeeId || !selectedEmployeeManagerId) {
      setError("Select both employee and manager to save assignment.");
      return;
    }

    setWorking(true);
    setError("");
    setSuccess("");

    try {
      const existing = employees.find((item) => item.$id === selectedEmployeeId);
      if (String(existing?.managerId || "").trim()) {
        await updateEmployeeManagerAssignment(selectedEmployeeId, selectedEmployeeManagerId);
      } else {
        await assignEmployeeToManager({
          employeeId: selectedEmployeeId,
          managerId: selectedEmployeeManagerId,
        });
      }

      setSuccess("Employee-to-manager mapping saved.");
      setEmployeeModalOpen(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save employee assignment.");
    } finally {
      setWorking(false);
    }
  }

  async function handleRemoveEmployeeAssignment(employeeId: string) {
    setWorking(true);
    setError("");
    setSuccess("");

    try {
      await removeEmployeeManagerAssignment(employeeId);
      setSuccess("Employee mapping removed.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove employee assignment.");
    } finally {
      setWorking(false);
    }
  }

  async function handleSaveManagerAssignment() {
    if (!selectedManagerId || !selectedHrId) {
      setError("Select both manager and HR to save assignment.");
      return;
    }

    setWorking(true);
    setError("");
    setSuccess("");

    try {
      const existing = managerAssignments.find((item) => item.managerId === selectedManagerId);
      if (String(existing?.hrId || "").trim()) {
        await updateManagerHrAssignment(selectedManagerId, selectedHrId);
      } else {
        await assignManagerToHr({ managerId: selectedManagerId, hrId: selectedHrId });
      }

      setSuccess("Manager-to-HR mapping saved.");
      setManagerModalOpen(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save manager assignment.");
    } finally {
      setWorking(false);
    }
  }

  async function handleRemoveManagerAssignment(managerId: string) {
    setWorking(true);
    setError("");
    setSuccess("");

    try {
      await removeManagerHrAssignment(managerId);
      setSuccess("Manager-to-HR mapping removed.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove manager assignment.");
    } finally {
      setWorking(false);
    }
  }

  const employeeColumns = useMemo<DataTableColumn<EmployeeAssignmentRow>[]>(
    () => [
      {
        key: "name",
        header: "Employee",
        render: (_value: unknown, row: EmployeeAssignmentRow) => (
          <div>
            <p className="body-sm font-medium text-[var(--color-text)]">{row.name}</p>
            <p className="caption">{row.email}</p>
          </div>
        ),
      },
      { key: "department", header: "Department" },
      {
        key: "managerId",
        header: "Manager",
        render: (_value: unknown, row: EmployeeAssignmentRow) => {
          const manager = managerById.get(row.managerId);
          if (!row.managerId || !manager) {
            return <Badge variant="warning">Unassigned</Badge>;
          }

          return (
            <div>
              <p className="body-sm text-[var(--color-text)]">{manager.managerName || manager.managerId}</p>
              <p className="caption">{manager.managerEmail || manager.managerId}</p>
            </div>
          );
        },
      },
      {
        key: "employeeId",
        header: "Action",
        align: "right",
        render: (_value: unknown, row: EmployeeAssignmentRow) => (
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => openEmployeeModal(row)}
              disabled={working}
            >
              {row.managerId ? "Reassign" : "Assign"}
            </Button>
            {row.managerId && (
              <Button
                type="button"
                size="sm"
                variant="danger"
                onClick={() => handleRemoveEmployeeAssignment(row.employeeId)}
                disabled={working}
              >
                Remove
              </Button>
            )}
          </div>
        ),
      },
    ],
    [managerById, working]
  );

  const managerColumns = useMemo<DataTableColumn<ManagerAssignmentRow>[]>(
    () => [
      {
        key: "managerName",
        header: "Manager",
        render: (_value: unknown, row: ManagerAssignmentRow) => (
          <div>
            <p className="body-sm font-medium text-[var(--color-text)]">{row.managerName}</p>
            <p className="caption">{row.managerEmail}</p>
          </div>
        ),
      },
      { key: "department", header: "Department" },
      {
        key: "hrId",
        header: "Assigned HR",
        render: (_value: unknown, row: ManagerAssignmentRow) => {
          if (!row.hrId) {
            return <Badge variant="warning">Unassigned</Badge>;
          }

          return (
            <div>
              <p className="body-sm text-[var(--color-text)]">{row.hrName || row.hrId}</p>
              <p className="caption">{row.hrEmail || row.hrId}</p>
            </div>
          );
        },
      },
      {
        key: "managerId",
        header: "Action",
        align: "right",
        render: (_value: unknown, row: ManagerAssignmentRow) => (
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => openManagerModal(row)}
              disabled={working}
            >
              {row.hrId ? "Reassign" : "Assign"}
            </Button>
            {row.hrId && (
              <Button
                type="button"
                size="sm"
                variant="danger"
                onClick={() => handleRemoveManagerAssignment(row.managerId)}
                disabled={working}
              >
                Remove
              </Button>
            )}
          </div>
        ),
      },
    ],
    [working]
  );

  return (
    <Stack gap="4">
      <PageHeader
        title="Team Assignments"
        subtitle="Map employees to managers and managers to HR owners with immediate visibility of unassigned accounts."
        actions={
          <Button variant="secondary" onClick={loadData} disabled={loading || working}>
            Refresh
          </Button>
        }
      />

      {error && <Alert variant="error" title="Action failed" description={error} onDismiss={() => setError("")} />}
      {success && <Alert variant="success" title="Updated" description={success} onDismiss={() => setSuccess("")} />}

      <Grid cols={1} colsMd={4} gap="3">
        <Card title="Employees">
          <p className="heading-xl">{loading ? "..." : employeeCounts.total}</p>
        </Card>
        <Card title="Employees Unassigned">
          <p className="heading-xl">{loading ? "..." : employeeCounts.unassigned}</p>
        </Card>
        <Card title="Managers">
          <p className="heading-xl">{loading ? "..." : managerCounts.total}</p>
        </Card>
        <Card title="Managers Unassigned to HR">
          <p className="heading-xl">{loading ? "..." : managerCounts.unassigned}</p>
        </Card>
      </Grid>

      <Card title="Employee to Manager Mapping" description="Assign or reassign reporting managers for employee profiles.">
        <Stack gap="2">
          <Input
            label="Search employees"
            value={employeeQuery}
            onChange={(event) => setEmployeeQuery(event.target.value)}
            placeholder="Search by name, email, department, or manager"
          />
          <DataTable
            columns={employeeColumns}
            rows={filteredEmployeeRows}
            loading={loading}
            rowKey={(row) => row.employeeId}
            emptyMessage="No employees found."
          />
        </Stack>
      </Card>

      <Card title="Manager to HR Mapping" description="Assign governance ownership for each manager.">
        <Stack gap="2">
          <Input
            label="Search managers"
            value={managerQuery}
            onChange={(event) => setManagerQuery(event.target.value)}
            placeholder="Search by manager, department, or HR owner"
          />
          <DataTable
            columns={managerColumns}
            rows={filteredManagerRows}
            loading={loading}
            rowKey={(row) => row.managerId}
            emptyMessage="No managers found."
          />
        </Stack>
      </Card>

      <Modal
        open={employeeModalOpen}
        onClose={() => !working && setEmployeeModalOpen(false)}
        title="Assign Employee Manager"
        description="Choose the reporting manager for this employee profile."
        allowContentOverflow
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEmployeeModalOpen(false)}
              disabled={working}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSaveEmployeeAssignment} loading={working}>
              Save Mapping
            </Button>
          </>
        }
      >
        <Stack gap="2">
          <Dropdown
            label="Manager"
            value={selectedEmployeeManagerId}
            onChange={setSelectedEmployeeManagerId}
            options={managerOptions}
            placeholder="Select manager"
          />
        </Stack>
      </Modal>

      <Modal
        open={managerModalOpen}
        onClose={() => !working && setManagerModalOpen(false)}
        title="Assign Manager HR Owner"
        description="Choose the HR owner responsible for this manager."
        allowContentOverflow
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setManagerModalOpen(false)}
              disabled={working}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSaveManagerAssignment} loading={working}>
              Save Mapping
            </Button>
          </>
        }
      >
        <Stack gap="2">
          <Dropdown
            label="HR Owner"
            value={selectedHrId}
            onChange={setSelectedHrId}
            options={hrOptions}
            placeholder="Select HR"
          />
        </Stack>
      </Modal>
    </Stack>
  );
}

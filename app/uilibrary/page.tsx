'use client';

import { ReactNode, useState } from 'react';

// UI primitives
import Alert from '@/src/components/ui/Alert';
import Avatar from '@/src/components/ui/Avatar';
import Badge from '@/src/components/ui/Badge';
import Button from '@/src/components/ui/Button';
import Card from '@/src/components/ui/Card';
import Checkbox from '@/src/components/ui/Checkbox';
import Divider from '@/src/components/ui/Divider';
import Dropdown from '@/src/components/ui/Dropdown';
import Input from '@/src/components/ui/Input';
import Modal from '@/src/components/ui/Modal';
import Skeleton from '@/src/components/ui/Skeleton';
import Spinner from '@/src/components/ui/Spinner';
import Textarea from '@/src/components/ui/Textarea';
import Tooltip from '@/src/components/ui/Tooltip';

// Layout
import Container from '@/src/components/layout/Container';
import Grid from '@/src/components/layout/Grid';
import SidebarLayout from '@/src/components/layout/SidebarLayout';
import Stack from '@/src/components/layout/Stack';

// Patterns
import DataTable from '@/src/components/patterns/DataTable';
import type { DataTableColumn } from '@/src/components/patterns/DataTable';
import CascadeGoalComposer from '@/src/components/patterns/CascadeGoalComposer';
import ExplainabilityDrawer from '@/src/components/patterns/ExplainabilityDrawer';
import FormSection from '@/src/components/patterns/FormSection';
import type { GoalLineageData } from '@/app/employee/_lib/pmsClient';
import GoalLineageView from '@/src/components/patterns/GoalLineageView';
import PageHeader from '@/src/components/patterns/PageHeader';

// ─── Sample data ──────────────────────────────────────────────────────────────

interface EmployeeRow extends Record<string, unknown> {
  id: string;
  name: string;
  role: string;
  department: string;
  status: string;
  joined: string;
}

const EMPLOYEES: EmployeeRow[] = [
  { id: '1', name: 'Alice Johnson', role: 'Frontend Engineer', department: 'Engineering', status: 'Active', joined: 'Jan 2023' },
  { id: '2', name: 'Bob Chen', role: 'Product Manager', department: 'Product', status: 'Active', joined: 'Mar 2022' },
  { id: '3', name: 'Clara Davis', role: 'UI Designer', department: 'Design', status: 'Inactive', joined: 'Jul 2021' },
  { id: '4', name: 'David Lee', role: 'Backend Engineer', department: 'Engineering', status: 'Active', joined: 'Nov 2023' },
  { id: '5', name: 'Emma Wilson', role: 'QA Engineer', department: 'Engineering', status: 'Active', joined: 'Feb 2024' },
];

const EMPLOYEE_COLUMNS: DataTableColumn<EmployeeRow>[] = [
  {
    key: 'name',
    header: 'Name',
    render: (_, row) => (
      <div className="flex items-center gap-2">
        <Avatar
          size="sm"
          initials={(row.name as string)
            .split(' ')
            .map((n) => n[0])
            .join('')}
        />
        <span className="font-medium text-[var(--color-text)] ">
          {row.name as string}
        </span>
      </div>
    ),
  },
  { key: 'role', header: 'Role' },
  { key: 'department', header: 'Department' },
  {
    key: 'status',
    header: 'Status',
    render: (value) => (
      <Badge variant={value === 'Active' ? 'success' : 'default'}>
        {value as string}
      </Badge>
    ),
  },
  { key: 'joined', header: 'Joined', align: 'right' },
];

const SAMPLE_LINEAGE: GoalLineageData = {
  ancestors: [
    {
      $id: 'goal-business-1',
      title: 'Expand APAC enterprise revenue by 20%',
      description: 'Business-level growth objective for FY26.',
      goalLevel: 'business',
      status: 'active',
      progressPercent: 58,
      contributionPercent: 100,
      cycleId: 'FY26',
      children: [],
    },
    {
      $id: 'goal-manager-1',
      title: 'Reduce hiring cycle time to 21 days',
      description: 'Manager-level hiring efficiency objective.',
      goalLevel: 'manager',
      status: 'active',
      progressPercent: 62,
      contributionPercent: 40,
      cycleId: 'FY26',
      children: [],
    },
  ],
  currentGoal: {
    $id: 'goal-employee-1',
    title: 'Automate candidate screening scorecards',
    description: 'Build scorecard automation and reduce manual review steps.',
    goalLevel: 'employee',
    status: 'in_progress',
    progressPercent: 47,
    contributionPercent: 55,
    cycleId: 'FY26-Q2',
    children: [],
  },
  descendants: [
    {
      $id: 'goal-employee-2',
      title: 'Integrate ATS webhook validation checks',
      goalLevel: 'employee',
      status: 'active',
      progressPercent: 52,
      contributionPercent: 25,
      cycleId: 'FY26-Q2',
      children: [],
    },
    {
      $id: 'goal-employee-3',
      title: 'Launch recruiter dashboard for funnel bottlenecks',
      goalLevel: 'employee',
      status: 'active',
      progressPercent: 39,
      contributionPercent: 30,
      cycleId: 'FY26-Q2',
      children: [
        {
          $id: 'goal-employee-4',
          title: 'Add weekly alerting for stalled candidates',
          goalLevel: 'employee',
          status: 'active',
          progressPercent: 72,
          contributionPercent: 15,
          cycleId: 'FY26-Q2',
          children: [],
        },
      ],
    },
  ],
};

// ─── Nav config ───────────────────────────────────────────────────────────────

const NAV_GROUPS = [
  {
    label: 'Primitives',
    items: [
      { id: 'buttons', label: 'Buttons' },
      { id: 'badges', label: 'Badges' },
      { id: 'avatars', label: 'Avatars' },
      { id: 'spinners', label: 'Spinners' },
      { id: 'dividers', label: 'Dividers' },
      { id: 'skeletons', label: 'Skeletons' },
    ],
  },
  {
    label: 'Form',
    items: [
      { id: 'inputs', label: 'Input & Textarea' },
      { id: 'selects', label: 'Select' },
      { id: 'checkboxes', label: 'Checkbox' },
    ],
  },
  {
    label: 'Feedback',
    items: [
      { id: 'alerts', label: 'Alerts' },
      { id: 'modals', label: 'Modal' },
      { id: 'tooltips', label: 'Tooltip' },
    ],
  },
  {
    label: 'Containers',
    items: [{ id: 'cards', label: 'Card' }],
  },
  {
    label: 'Layout',
    items: [
      { id: 'stack', label: 'Stack' },
      { id: 'grid', label: 'Grid' },
    ],
  },
  {
    label: 'Patterns',
    items: [
      { id: 'pageheader', label: 'Page Header' },
      { id: 'formsection', label: 'Form Section' },
      { id: 'explainability', label: 'Explainability Drawer' },
      { id: 'cascading-goals', label: 'Cascading Goals' },
      { id: 'goal-lineage', label: 'Goal Lineage' },
      { id: 'datatable', label: 'Data Table' },
    ],
  },
];

// ─── Internal helpers ─────────────────────────────────────────────────────────

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="flex flex-col gap-6 scroll-mt-6"
    >
      <div className="pb-2 border-b border-[var(--color-border)]">
        <h2 className="heading-lg text-[var(--color-text)]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function DemoRow({
  label,
  align = 'center',
  children,
}: {
  label?: string;
  align?: 'start' | 'center';
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      {label && <p className="caption">{label}</p>}
      <div
        className={`flex flex-wrap gap-2 ${
          align === 'start' ? 'items-start' : 'items-center'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function DemoBox({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] body-sm text-[var(--color-text-muted)]">
      {children}
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar() {
  return (
    <div className="flex flex-col h-full">
      {/* Branding */}
      <div className="px-4 py-6 border-b border-[var(--color-border)] shrink-0">
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-[var(--radius-sm)] bg-[var(--color-primary)] shrink-0"
            aria-hidden="true"
          />
          <span className="body-sm font-semibold text-[var(--color-text)]">
            UI System
          </span>
        </div>
        <p className="caption mt-1">Component Showcase</p>
      </div>

      {/* Nav */}
      <nav
        aria-label="Component sections"
        className="flex-1 overflow-y-auto px-2 py-4"
      >
        <Stack gap="4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="caption px-2 mb-1 uppercase tracking-wider">
                {group.label}
              </p>
              <ul className="flex flex-col gap-1">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className="flex items-center px-2 py-1 body-sm text-[var(--color-text-muted)] rounded-[var(--radius-sm)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)] transition-colors duration-100"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Stack>
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-[var(--color-border)] shrink-0">
        <p className="caption">HR Console · v0.1.0</p>
      </div>
    </div>
  );
}

// ─── Showcase ─────────────────────────────────────────────────────────────────

export default function ComponentShowcase() {
  const [modalOpen, setModalOpen] = useState(false);
  const [explainabilityOpen, setExplainabilityOpen] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableEmpty, setTableEmpty] = useState(false);
  const [infoDismissed, setInfoDismissed] = useState(false);

  return (
    <SidebarLayout sidebar={<Sidebar />}>
      <Container maxWidth="lg">
        <Stack gap="6" className="py-8">

          {/* ── Buttons ───────────────────────────────────────────────── */}
          <Section id="buttons" title="Buttons">
            <Card>
              <Stack gap="4">
                <DemoRow label="Variants">
                  <Button variant="primary">Primary</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="danger">Danger</Button>
                </DemoRow>

                <Divider />

                <DemoRow label="Sizes">
                  <Button size="sm">Small</Button>
                  <Button size="md">Medium</Button>
                  <Button size="lg">Large</Button>
                </DemoRow>

                <Divider />

                <DemoRow label="States">
                  <Button loading>Saving…</Button>
                  <Button variant="secondary" loading>Loading</Button>
                  <Button disabled>Disabled</Button>
                  <Button variant="secondary" disabled>Disabled</Button>
                </DemoRow>
              </Stack>
            </Card>
          </Section>

          {/* ── Badges ────────────────────────────────────────────────── */}
          <Section id="badges" title="Badges">
            <Card>
              <DemoRow>
                <Badge>Default</Badge>
                <Badge variant="success">Active</Badge>
                <Badge variant="danger">Rejected</Badge>
                <Badge variant="warning">Pending</Badge>
                <Badge variant="info">New</Badge>
              </DemoRow>
            </Card>
          </Section>

          {/* ── Avatars ───────────────────────────────────────────────── */}
          <Section id="avatars" title="Avatars">
            <Card>
              <DemoRow label="Sizes — initials fallback">
                <Avatar size="sm" initials="AJ" />
                <Avatar size="md" initials="BC" />
                <Avatar size="lg" initials="CD" />
              </DemoRow>
            </Card>
          </Section>

          {/* ── Spinners ──────────────────────────────────────────────── */}
          <Section id="spinners" title="Spinners">
            <Card>
              <DemoRow label="Sizes">
                <Spinner size="sm" />
                <Spinner size="md" />
                <Spinner size="lg" />
              </DemoRow>
            </Card>
          </Section>

          {/* ── Dividers ──────────────────────────────────────────────── */}
          <Section id="dividers" title="Dividers">
            <Card>
              <Stack gap="3">
                <p className="body-sm text-[var(--color-text-muted)]">
                  Above the divider
                </p>
                <Divider />
                <p className="body-sm text-[var(--color-text-muted)]">
                  Below the divider
                </p>
                <Divider label="or continue with" />
                <p className="body-sm text-[var(--color-text-muted)]">
                  Below the labeled divider
                </p>
                <div className="flex items-center gap-4 h-8">
                  <span className="body-sm text-[var(--color-text-muted)]">
                    Left
                  </span>
                  <Divider orientation="vertical" />
                  <span className="body-sm text-[var(--color-text-muted)]">
                    Right
                  </span>
                </div>
              </Stack>
            </Card>
          </Section>

          {/* ── Skeletons ─────────────────────────────────────────────── */}
          <Section id="skeletons" title="Skeletons">
            <Card title="Loading placeholders">
              <Stack gap="4">
                <DemoRow label="Text lines" align="start">
                  <Stack gap="2" className="w-full max-w-xs">
                    <Skeleton variant="text" width="80%" />
                    <Skeleton variant="text" width="65%" />
                    <Skeleton variant="text" width="72%" />
                  </Stack>
                </DemoRow>
                <DemoRow label="Shapes">
                  <Skeleton variant="circle" width={40} height={40} />
                  <Skeleton variant="rect" width={120} height={40} />
                  <Skeleton variant="rect" width={80} height={80} />
                </DemoRow>
              </Stack>
            </Card>
          </Section>

          {/* ── Input & Textarea ──────────────────────────────────────── */}
          <Section id="inputs" title="Input & Textarea">
            <Grid cols={1} colsMd={2} gap="3">
              <Input label="Full Name" placeholder="Alice Johnson" />
              <Input
                label="Email address"
                placeholder="alice@acme.com"
                type="email"
              />
              <Input
                label="With error"
                placeholder="Enter a value"
                error="This field is required."
              />
              <Input
                label="With helper text"
                placeholder="Enter a value"
                helperText="Must be at least 8 characters."
              />
              <Input
                label="Disabled"
                placeholder="Cannot be edited"
                disabled
              />
            </Grid>
            <Textarea
              label="Bio"
              placeholder="Tell us about yourself…"
              rows={3}
            />
            <Textarea
              label="Notes (with error)"
              placeholder="Add a note…"
              rows={2}
              error="Notes cannot be empty."
            />
          </Section>

          {/* ── Select ────────────────────────────────────────────────── */}
          <Section id="selects" title="Select">
            <Grid cols={1} colsMd={2} gap="3">
              <Dropdown
                label="Department"
                placeholder="Choose a department…"
                options={[
                  { value: 'eng', label: 'Engineering' },
                  { value: 'design', label: 'Design' },
                  { value: 'product', label: 'Product' },
                  { value: 'marketing', label: 'Marketing' },
                ]}
              />
              <Dropdown
                label="With error"
                placeholder="Choose a department…"
                options={[
                  { value: 'eng', label: 'Engineering' },
                  { value: 'design', label: 'Design' },
                ]}
                error="Please select a department."
              />
            </Grid>
          </Section>

          {/* ── Checkbox ──────────────────────────────────────────────── */}
          <Section id="checkboxes" title="Checkbox">
            <Card>
              <Stack gap="3">
                <Checkbox label="Basic checkbox" />
                <Checkbox
                  label="Two-factor authentication"
                  description="Adds an extra layer of security to your account."
                  defaultChecked
                />
                <Checkbox
                  label="Weekly digest"
                  description="Receive a summary of activity every Monday morning."
                />
                <Checkbox label="Disabled option" disabled />
              </Stack>
            </Card>
          </Section>

          {/* ── Alerts ────────────────────────────────────────────────── */}
          <Section id="alerts" title="Alerts">
            <Stack gap="2">
              <Alert
                variant="success"
                title="Changes saved"
                description="Your profile has been updated successfully."
              />
              <Alert
                variant="error"
                title="Upload failed"
                description="The file could not be processed. Please try again."
              />
              <Alert
                variant="warning"
                title="Trial ending soon"
                description="Your free trial expires in 3 days. Upgrade to keep access."
              />
              <Alert
                variant="info"
                title="New feature available"
                description="You can now export reports as CSV directly from the dashboard."
              />
              {!infoDismissed && (
                <Alert
                  variant="info"
                  title="Dismissible alert"
                  description="Click × to dismiss this alert."
                  onDismiss={() => setInfoDismissed(true)}
                />
              )}
            </Stack>
          </Section>

          {/* ── Modal ─────────────────────────────────────────────────── */}
          <Section id="modals" title="Modal">
            <Card>
              <Button onClick={() => setModalOpen(true)}>Open Modal</Button>
            </Card>

            <Modal
              open={modalOpen}
              onClose={() => setModalOpen(false)}
              title="Delete record"
              description="Are you sure you want to delete this record? This action cannot be undone."
              footer={
                <>
                  <Button
                    variant="secondary"
                    onClick={() => setModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => setModalOpen(false)}
                  >
                    Delete
                  </Button>
                </>
              }
            >
              <Alert
                variant="warning"
                title="Warning"
                description="All associated data including logs and attachments will also be removed permanently."
              />
            </Modal>
          </Section>

          {/* ── Tooltip ───────────────────────────────────────────────── */}
          <Section id="tooltips" title="Tooltip">
            <Card>
              <DemoRow label="Positions — hover or focus each button">
                <Tooltip content="Tooltip on top" position="top">
                  <Button variant="secondary" size="sm">
                    Top
                  </Button>
                </Tooltip>
                <Tooltip content="Tooltip on bottom" position="bottom">
                  <Button variant="secondary" size="sm">
                    Bottom
                  </Button>
                </Tooltip>
                <Tooltip content="Tooltip on left" position="left">
                  <Button variant="secondary" size="sm">
                    Left
                  </Button>
                </Tooltip>
                <Tooltip content="Tooltip on right" position="right">
                  <Button variant="secondary" size="sm">
                    Right
                  </Button>
                </Tooltip>
              </DemoRow>
            </Card>
          </Section>

          {/* ── Card ──────────────────────────────────────────────────── */}
          <Section id="cards" title="Card">
            <Grid cols={1} colsMd={3} gap="3">
              <Card>
                <p className="body-sm text-[var(--color-text-muted)]">
                  Minimal card — just children, no title.
                </p>
              </Card>

              <Card
                title="With title"
                description="A short description explaining what this card contains."
              >
                <p className="body-sm text-[var(--color-text-muted)]">
                  Card body content area.
                </p>
              </Card>

              <Card
                title="With footer"
                description="This card includes action buttons in the footer."
                footer={
                  <>
                    <Button variant="ghost" size="sm">
                      Discard
                    </Button>
                    <Button size="sm">Save</Button>
                  </>
                }
              >
                <p className="body-sm text-[var(--color-text-muted)]">
                  Card content area.
                </p>
              </Card>
            </Grid>
          </Section>

          {/* ── Stack ─────────────────────────────────────────────────── */}
          <Section id="stack" title="Stack">
            <Grid cols={1} colsMd={2} gap="3">
              <Card title="Vertical (default)">
                <Stack gap="2">
                  {['Item A', 'Item B', 'Item C'].map((item) => (
                    <DemoBox key={item}>{item}</DemoBox>
                  ))}
                </Stack>
              </Card>

              <Card title="Horizontal">
                <Stack gap="2" direction="horizontal" align="center">
                  {['Item A', 'Item B', 'Item C'].map((item) => (
                    <DemoBox key={item}>{item}</DemoBox>
                  ))}
                </Stack>
              </Card>

              <Card title="Horizontal — space between">
                <Stack
                  gap="2"
                  direction="horizontal"
                  align="center"
                  justify="between"
                >
                  {['Left', 'Center', 'Right'].map((item) => (
                    <DemoBox key={item}>{item}</DemoBox>
                  ))}
                </Stack>
              </Card>

              <Card title="Vertical — centered">
                <Stack gap="2" align="center">
                  {['Short', 'A longer item', 'Mid'].map((item) => (
                    <DemoBox key={item}>{item}</DemoBox>
                  ))}
                </Stack>
              </Card>
            </Grid>
          </Section>

          {/* ── Grid ──────────────────────────────────────────────────── */}
          <Section id="grid" title="Grid">
            <Card title="Responsive: 1 col → 2 col (md) → 3 col (lg)">
              <Grid cols={1} colsMd={2} colsLg={3} gap="2">
                {Array.from({ length: 6 }, (_, i) => (
                  <div
                    key={i}
                    className="px-4 py-4 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] body-sm text-[var(--color-text-muted)] text-center"
                  >
                    Col {i + 1}
                  </div>
                ))}
              </Grid>
            </Card>
          </Section>

          {/* ── PageHeader ────────────────────────────────────────────── */}
          <Section id="pageheader" title="Page Header">
            <Card>
              <PageHeader
                title="Team Members"
                subtitle="Manage your team's access, roles and permissions."
                actions={
                  <>
                    <Button variant="secondary" size="sm">
                      Export CSV
                    </Button>
                    <Button size="sm">Invite Member</Button>
                  </>
                }
              />
            </Card>
            <Card>
              <PageHeader title="Settings" />
            </Card>
          </Section>

          {/* ── FormSection ───────────────────────────────────────────── */}
          <Section id="formsection" title="Form Section">
            <Card>
              <Stack gap="5">
                <FormSection
                  title="Personal Information"
                  description="Update your name and contact details."
                >
                  <Grid cols={1} colsMd={2} gap="3">
                    <Input label="First Name" placeholder="Alice" />
                    <Input label="Last Name" placeholder="Johnson" />
                  </Grid>
                  <Input
                    label="Email Address"
                    placeholder="alice@acme.com"
                    type="email"
                  />
                  <Textarea
                    label="Bio"
                    placeholder="A short bio about yourself…"
                    rows={3}
                  />
                </FormSection>

                <FormSection
                  title="Notifications"
                  description="Choose how and when you receive notifications."
                  divider
                >
                  <Stack gap="2">
                    <Checkbox
                      label="Email notifications"
                      description="Receive important updates via email."
                      defaultChecked
                    />
                    <Checkbox
                      label="Push notifications"
                      description="Get instant alerts on your device."
                    />
                    <Checkbox
                      label="Weekly digest"
                      description="A summary of all activity, sent every Monday."
                      defaultChecked
                    />
                  </Stack>
                </FormSection>

                <div className="flex justify-end gap-2">
                  <Button variant="secondary">Discard</Button>
                  <Button>Save Changes</Button>
                </div>
              </Stack>
            </Card>
          </Section>

          {/* ── Explainability Drawer ──────────────────────────────── */}
          <Section id="explainability" title="Explainability Drawer">
            <Card>
              <Button onClick={() => setExplainabilityOpen(true)}>
                Open Explainability Drawer
              </Button>
            </Card>

            <ExplainabilityDrawer
              open={explainabilityOpen}
              onClose={() => setExplainabilityOpen(false)}
              payload={{
                source: 'openrouter_llm',
                confidence: 'high',
                whyFactors: [
                  'Role and cycle context fit',
                  'Framework alignment for measurable outcomes',
                  'Recent progress and blocker signals',
                ],
                timeWindow: 'Q2-2026',
              }}
            />
          </Section>

          {/* ── Cascade Goal Composer ─────────────────────────────── */}
          <Section id="cascading-goals" title="Cascade Goal Composer">
            <CascadeGoalComposer />
          </Section>

          {/* ── Goal Lineage View ─────────────────────────────── */}
          <Section id="goal-lineage" title="Goal Lineage View">
            <GoalLineageView lineage={SAMPLE_LINEAGE} />
          </Section>

          {/* ── DataTable ─────────────────────────────────────────────── */}
          <Section id="datatable" title="Data Table">
            <Stack gap="2" direction="horizontal" align="center">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setTableLoading((v) => !v);
                  setTableEmpty(false);
                }}
              >
                {tableLoading ? 'Show data' : 'Toggle loading'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setTableEmpty((v) => !v);
                  setTableLoading(false);
                }}
              >
                {tableEmpty ? 'Show data' : 'Toggle empty'}
              </Button>
            </Stack>

            <DataTable<EmployeeRow>
              columns={EMPLOYEE_COLUMNS}
              rows={tableEmpty ? [] : EMPLOYEES}
              loading={tableLoading}
              emptyMessage="No employees found."
              rowKey={(row) => row.id as string}
            />
          </Section>

        </Stack>
      </Container>
    </SidebarLayout>
  );
}

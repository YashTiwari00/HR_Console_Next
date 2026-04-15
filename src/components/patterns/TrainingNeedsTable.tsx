'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Card } from '@/src/components/ui';
import DataTable, { type DataTableColumn } from '@/src/components/patterns/DataTable';
import { cn } from '@/src/lib/cn';

export interface TrainingNeedGoal {
  goalId: string;
  title: string;
  frameworkType: string;
  managerFinalRatingLabel: 'NI' | 'SME' | '';
  cycleId: string;
}

export interface TrainingSuggestion {
  weakArea: string;
  suggestedTraining: string;
  priority: 'High' | 'Medium' | 'Low';
  rationale: string;
}

export interface TrainingNeedEmployee extends Record<string, unknown> {
  employeeId: string;
  employeeName: string;
  department: string;
  weakGoals: TrainingNeedGoal[];
  suggestions?: TrainingSuggestion[];
  aiError?: string;
}

interface TrainingNeedsMeta {
  totalEmployees: number;
  totalWeakGoals: number;
  cycleId: string | null;
}

interface TrainingNeedsResponse {
  data: TrainingNeedEmployee[];
  meta: TrainingNeedsMeta;
}

interface TrainingSuggestionResponse {
  employeeId: string;
  suggestions: TrainingSuggestion[];
}

interface TrainingBulkResponse {
  results: Array<{
    employeeId: string;
    employeeName: string;
    suggestions: TrainingSuggestion[];
    error?: string;
  }>;
}

export interface TrainingNeedsTableProps {
  cycleId?: string;
  managerId?: string;
  className?: string;
}

const DEFAULT_META: TrainingNeedsMeta = {
  totalEmployees: 0,
  totalWeakGoals: 0,
  cycleId: null,
};

function buildQuery(cycleId?: string, managerId?: string) {
  const params = new URLSearchParams();

  if (cycleId) {
    params.set('cycleId', cycleId);
  }

  if (managerId) {
    params.set('managerId', managerId);
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<{ status: number; data: T }> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  const payload = (await response.json().catch(() => ({}))) as T;

  if (!response.ok) {
    const message = String((payload as { error?: string })?.error || 'Request failed');
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return {
    status: response.status,
    data: payload,
  };
}

function mapPriorityVariant(priority: TrainingSuggestion['priority']) {
  if (priority === 'High') return 'danger';
  if (priority === 'Medium') return 'warning';
  return 'info';
}

function TableLoadingSkeleton() {
  return (
    <Card title="Training Needs Analysis" description="Analyzing weak-goal data across employees.">
      <div className="flex flex-col gap-[var(--space-3)]">
        <div className="h-9 w-full rounded-[var(--radius-sm)] bg-[var(--color-surface-muted)] animate-pulse" />
        <div className="h-12 w-full rounded-[var(--radius-sm)] bg-[var(--color-surface-muted)] animate-pulse" />
        <div className="h-64 w-full rounded-[var(--radius-sm)] bg-[var(--color-surface-muted)] animate-pulse" />
      </div>
    </Card>
  );
}

export default function TrainingNeedsTable({ cycleId, managerId, className }: TrainingNeedsTableProps) {
  const [rows, setRows] = useState<TrainingNeedEmployee[]>([]);
  const [meta, setMeta] = useState<TrainingNeedsMeta>(DEFAULT_META);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [limitReached, setLimitReached] = useState(false);
  const [rowLoadingMap, setRowLoadingMap] = useState<Record<string, boolean>>({});
  const [bulkLoading, setBulkLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  const loadTrainingNeeds = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const query = buildQuery(cycleId, managerId);
      const { data } = await requestJson<TrainingNeedsResponse>(`/api/hr/training-needs${query}`);

      setRows(Array.isArray(data.data) ? data.data : []);
      setMeta(data.meta || DEFAULT_META);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load training needs.';
      setError(message);
      setRows([]);
      setMeta(DEFAULT_META);
    } finally {
      setLoading(false);
    }
  }, [cycleId, managerId]);

  useEffect(() => {
    void loadTrainingNeeds();
  }, [loadTrainingNeeds]);

  const handleGenerateRowSuggestions = useCallback(
    async (employee: TrainingNeedEmployee) => {
      if (limitReached) return;

      setRowLoadingMap((current) => ({ ...current, [employee.employeeId]: true }));

      try {
        const cycle = cycleId || employee.weakGoals[0]?.cycleId || '';

        const { data } = await requestJson<TrainingSuggestionResponse>('/api/ai/training-suggestions', {
          method: 'POST',
          body: JSON.stringify({
            employeeId: employee.employeeId,
            employeeName: employee.employeeName,
            department: employee.department,
            cycleId: cycle,
            weakGoals: employee.weakGoals,
          }),
        });

        setRows((current) =>
          current.map((row) =>
            row.employeeId === employee.employeeId
              ? {
                  ...row,
                  suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
                  aiError: '',
                }
              : row
          )
        );
      } catch (err) {
        const status = (err as { status?: number })?.status;
        if (status === 429) {
          setLimitReached(true);
        }

        const message = err instanceof Error ? err.message : 'AI generation failed';
        setRows((current) =>
          current.map((row) =>
            row.employeeId === employee.employeeId
              ? {
                  ...row,
                  suggestions: [],
                  aiError: message,
                }
              : row
          )
        );
      } finally {
        setRowLoadingMap((current) => ({ ...current, [employee.employeeId]: false }));
      }
    },
    [cycleId, limitReached]
  );

  const handleBulkGenerate = useCallback(async () => {
    if (limitReached || rows.length === 0) return;

    setBulkLoading(true);
    setError('');

    try {
      const resolvedCycle = cycleId || rows[0]?.weakGoals[0]?.cycleId || '';
      const payloadEmployees = rows.map((employee) => ({
        employeeId: employee.employeeId,
        employeeName: employee.employeeName,
        department: employee.department,
        weakGoals: employee.weakGoals,
      }));

      const { data } = await requestJson<TrainingBulkResponse>('/api/hr/training-needs/bulk-ai', {
        method: 'POST',
        body: JSON.stringify({
          cycleId: resolvedCycle,
          employees: payloadEmployees,
        }),
      });

      const resultMap = new Map(data.results.map((result) => [result.employeeId, result]));

      setRows((current) =>
        current.map((row) => {
          const result = resultMap.get(row.employeeId);
          if (!result) return row;

          return {
            ...row,
            suggestions: Array.isArray(result.suggestions) ? result.suggestions : [],
            aiError: result.error || '',
          };
        })
      );
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 429) {
        setLimitReached(true);
      }

      const message = err instanceof Error ? err.message : 'Bulk AI generation failed';
      setError(message);
    } finally {
      setBulkLoading(false);
    }
  }, [cycleId, limitReached, rows]);

  const handleExportCsv = useCallback(async () => {
    setExportLoading(true);
    setError('');

    try {
      const query = buildQuery(cycleId, managerId);
      const response = await fetch(`/api/hr/training-needs/export${query}`);

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || 'CSV export failed');
      }

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const datePart = new Date().toISOString().slice(0, 10);
      const cyclePart = cycleId || 'all';

      anchor.href = downloadUrl;
      anchor.download = `training-needs-${cyclePart}-${datePart}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'CSV export failed';
      setError(message);
    } finally {
      setExportLoading(false);
    }
  }, [cycleId, managerId]);

  const columns = useMemo<DataTableColumn<TrainingNeedEmployee>[]>(
    () => [
      {
        key: 'employeeName',
        header: 'Employee',
        width: '18%',
      },
      {
        key: 'department',
        header: 'Department',
        width: '14%',
      },
      {
        key: 'weakGoals',
        header: 'Weak Goal Titles',
        width: '30%',
        render: (_value, row) => {
          const titles = row.weakGoals.map((goal) => goal.title).filter(Boolean);
          if (titles.length === 0) {
            return <span className="caption">No weak goals found.</span>;
          }

          return (
            <div className="flex flex-wrap gap-[var(--space-1)]">
              {titles.slice(0, 3).map((title) => (
                <span
                  key={`${row.employeeId}-${title}`}
                  className="caption rounded-[var(--radius-sm)] bg-[var(--color-surface-muted)] px-[var(--space-2)] py-[var(--space-1)] text-[var(--color-text)]"
                >
                  {title}
                </span>
              ))}
              {titles.length > 3 ? <span className="caption">+{titles.length - 3} more</span> : null}
            </div>
          );
        },
      },
      {
        key: 'ratings',
        header: 'Ratings',
        align: 'center',
        width: '12%',
        render: (_value, row) => {
          const labels = Array.from(
            new Set(
              row.weakGoals
                .map((goal) => goal.managerFinalRatingLabel)
                .filter((label): label is 'NI' | 'SME' => label === 'NI' || label === 'SME')
            )
          );

          if (labels.length === 0) {
            return <Badge variant="default">-</Badge>;
          }

          return (
            <div className="flex justify-center gap-[var(--space-1)]">
              {labels.map((label) => (
                <Badge key={`${row.employeeId}-${label}`} variant={label === 'NI' ? 'danger' : 'warning'}>
                  {label}
                </Badge>
              ))}
            </div>
          );
        },
      },
      {
        key: 'suggestions',
        header: 'AI Suggestions',
        align: 'center',
        width: '12%',
        render: (_value, row) => {
          if (rowLoadingMap[row.employeeId]) {
            return <Badge variant="info">Generating...</Badge>;
          }

          if (row.aiError) {
            return <Badge variant="danger">Error</Badge>;
          }

          const count = Array.isArray(row.suggestions) ? row.suggestions.length : 0;
          if (count === 0) {
            return <Badge variant="default">Not generated</Badge>;
          }

          return <Badge variant="success">{count} ready</Badge>;
        },
      },
      {
        key: 'actions',
        header: 'Actions',
        align: 'right',
        width: '14%',
        render: (_value, row) => (
          <Button
            variant="secondary"
            size="sm"
            loading={Boolean(rowLoadingMap[row.employeeId])}
            disabled={limitReached || bulkLoading}
            onClick={() => void handleGenerateRowSuggestions(row)}
          >
            Generate AI
          </Button>
        ),
      },
    ],
    [bulkLoading, handleGenerateRowSuggestions, limitReached, rowLoadingMap]
  );
  const hasSuggestions = rows.some((row) => (row.suggestions || []).length > 0 || row.aiError);

  if (loading) {
    return <TableLoadingSkeleton />;
  }

  return (
    <Card
      title="Training Needs Analysis"
      description="Identify weak-goal trends, generate AI training paths, and export targeted interventions."
      className={className}
    >
      <div className="flex flex-col gap-[var(--space-3)]">
        {limitReached ? (
          <Alert
            variant="warning"
            title="AI usage limit reached"
            description="You have reached the AI suggestion limit for this cycle. CSV export remains available."
            onDismiss={() => setLimitReached(false)}
          />
        ) : null}

        {error ? (
          <Alert
            variant="error"
            title="Unable to complete request"
            description={error}
            onDismiss={() => setError('')}
          />
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-[var(--space-2)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-[var(--space-3)]">
          <div className="flex flex-wrap items-center gap-[var(--space-2)]">
            <Badge variant="info">Employees: {meta.totalEmployees}</Badge>
            <Badge variant="warning">Weak Goals: {meta.totalWeakGoals}</Badge>
            {meta.cycleId ? <Badge variant="default">Cycle: {meta.cycleId}</Badge> : null}
          </div>

          <div className="flex flex-wrap items-center gap-[var(--space-2)]">
            <Button
              variant="primary"
              loading={bulkLoading}
              disabled={rows.length === 0 || limitReached || exportLoading}
              onClick={() => void handleBulkGenerate()}
            >
              Generate Bulk AI
            </Button>
            <Button
              variant="secondary"
              loading={exportLoading}
              disabled={bulkLoading}
              onClick={() => void handleExportCsv()}
            >
              Download CSV: Training Needs
            </Button>
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.employeeId}
          emptyMessage="No training needs found for the selected filters."
        />

        {hasSuggestions ? (
          <div className="flex flex-col gap-[var(--space-3)]">
            {rows
              .filter((row) => (row.suggestions || []).length > 0 || row.aiError)
              .map((row) => (
                <div
                  key={`${row.employeeId}-insights`}
                  className={cn(
                    'rounded-[var(--radius-md)] border border-[var(--color-border)]',
                    'bg-[var(--color-surface-muted)] p-[var(--space-3)]',
                    'flex flex-col gap-[var(--space-2)]'
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-[var(--space-2)]">
                    <h4 className="body font-medium text-[var(--color-text)]">
                      {row.employeeName} - AI Training Suggestions
                    </h4>
                    <Badge variant="default">{row.department}</Badge>
                  </div>

                  {row.aiError ? (
                    <Alert variant="error" title="AI generation failed" description={row.aiError} />
                  ) : null}

                  {(row.suggestions || []).length > 0 ? (
                    <div className="grid gap-[var(--space-2)] md:grid-cols-2">
                      {(row.suggestions || []).map((suggestion, index) => (
                        <div
                          key={`${row.employeeId}-${suggestion.weakArea}-${index}`}
                          className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-3)]"
                        >
                          <div className="mb-[var(--space-2)] flex items-center justify-between gap-[var(--space-2)]">
                            <p className="body-sm font-medium text-[var(--color-text)]">{suggestion.weakArea || 'General'}</p>
                            <Badge variant={mapPriorityVariant(suggestion.priority)}>{suggestion.priority}</Badge>
                          </div>
                          <p className="caption text-[var(--color-text)]">{suggestion.suggestedTraining}</p>
                          <p className="caption mt-[var(--space-1)]">{suggestion.rationale}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

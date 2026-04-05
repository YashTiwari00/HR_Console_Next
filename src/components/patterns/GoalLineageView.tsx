"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Alert, Badge, Card, Button } from "@/src/components/ui";
import {
  fetchGoalLineage,
  GoalLineageData,
  GoalLineageNode,
} from "@/app/employee/_lib/pmsClient";

export interface GoalLineageViewProps {
  goalId?: string;
  lineage?: GoalLineageData;
  title?: string;
  description?: string;
  className?: string;
  embedded?: boolean;
  goalHrefBuilder?: (goalId: string) => string;
}

function toProgress(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function contributionText(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "n/a";
  return `${Math.max(0, Math.min(100, Math.round(numeric)))}%`;
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between gap-2">
        <span className="caption">Progress</span>
        <span className="caption">{value}%</span>
      </div>
      <div className="mt-1 h-2 rounded-[var(--radius-sm)] bg-[var(--color-surface-muted)]">
        <div
          className="h-2 rounded-[var(--radius-sm)] bg-[var(--color-primary)]"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function NodeCard({
  node,
  depth = 0,
  goalHrefBuilder,
}: {
  node: GoalLineageNode;
  depth?: number;
  goalHrefBuilder?: (goalId: string) => string;
}) {
  const progress = toProgress(node.progressPercent);
  const contribution = contributionText(node.contributionPercent);
  const href = node.$id && goalHrefBuilder ? goalHrefBuilder(node.$id) : "";

  return (
    <div
      className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
      style={{ marginLeft: depth > 0 ? `${Math.min(depth * 20, 120)}px` : 0 }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="body-sm font-medium text-[var(--color-text)]">{node.title || "Untitled goal"}</p>
        <div className="flex flex-wrap gap-2">
          {node.goalLevel && <Badge variant="info">{String(node.goalLevel)}</Badge>}
          {node.status && <Badge variant="default">{String(node.status)}</Badge>}
          <Badge variant="default">Contribution: {contribution}</Badge>
        </div>
      </div>

      {node.description && <p className="caption mt-1">{node.description}</p>}

      <div className="mt-2 flex flex-wrap gap-3">
        {node.cycleId && <span className="caption">Cycle: {node.cycleId}</span>}
        {node.weightage !== undefined && <span className="caption">Weightage: {node.weightage}%</span>}
        {href && (
          <Link
            href={href}
            className="caption text-[var(--color-primary)] hover:underline"
          >
            Open goal details
          </Link>
        )}
      </div>

      <ProgressBar value={progress} />
    </div>
  );
}

function DescendantTree({
  nodes,
  depth = 0,
  goalHrefBuilder,
}: {
  nodes: GoalLineageNode[];
  depth?: number;
  goalHrefBuilder?: (goalId: string) => string;
}) {
  return (
    <div className="space-y-2">
      {nodes.map((node) => (
        <div key={node.$id || `${node.title}-${depth}`} className="space-y-2">
          <NodeCard node={node} depth={depth} goalHrefBuilder={goalHrefBuilder} />
          {Array.isArray(node.children) && node.children.length > 0 && (
            <DescendantTree nodes={node.children} depth={depth + 1} goalHrefBuilder={goalHrefBuilder} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function GoalLineageView({
  goalId,
  lineage,
  title = "Goal Lineage",
  description = "Trace parent chain, current goal, and children goals with contribution and progress.",
  className,
  embedded = false,
  goalHrefBuilder,
}: GoalLineageViewProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<GoalLineageData | null>(lineage || null);

  const sourceData = useMemo(() => lineage || data, [lineage, data]);

  useEffect(() => {
    let mounted = true;

    async function loadLineage() {
      if (!goalId || lineage) return;

      setLoading(true);
      setError("");

      try {
        const payload = await fetchGoalLineage(goalId);
        if (!mounted) return;
        setData(payload);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Unable to fetch goal lineage.");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadLineage();

    return () => {
      mounted = false;
    };
  }, [goalId, lineage]);

  const content = (
    <div className="space-y-4">
        {error && <Alert variant="error" title="Lineage error" description={error} onDismiss={() => setError("")} />}

        {!lineage && goalId && (
          <div className="flex justify-end">
            <Button type="button" size="sm" variant="secondary" onClick={async () => {
              setLoading(true);
              setError("");
              try {
                const payload = await fetchGoalLineage(goalId);
                setData(payload);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Unable to refresh lineage.");
              } finally {
                setLoading(false);
              }
            }} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
        )}

        {!loading && !sourceData && <p className="caption">No lineage data available.</p>}
        {loading && <p className="caption">Loading lineage...</p>}

        {sourceData && (
          <div className="space-y-4">
            <div>
              <p className="body-sm font-medium text-[var(--color-text)]">Parent Chain</p>
              <div className="mt-2 space-y-2">
                {sourceData.ancestors.length === 0 ? (
                  <p className="caption">No parent goals found (this appears to be a root goal).</p>
                ) : (
                  sourceData.ancestors.map((node, index) => (
                    <NodeCard
                      key={node.$id || `ancestor-${index}`}
                      node={node}
                      depth={0}
                      goalHrefBuilder={goalHrefBuilder}
                    />
                  ))
                )}
              </div>
            </div>

            <div>
              <p className="body-sm font-medium text-[var(--color-text)]">Current Goal</p>
              <div className="mt-2">
                <NodeCard node={sourceData.currentGoal} depth={0} goalHrefBuilder={goalHrefBuilder} />
              </div>
            </div>

            <div>
              <p className="body-sm font-medium text-[var(--color-text)]">Children Goals</p>
              <div className="mt-2 space-y-2">
                {sourceData.descendants.length === 0 ? (
                  <p className="caption">No children goals found.</p>
                ) : (
                  <DescendantTree nodes={sourceData.descendants} goalHrefBuilder={goalHrefBuilder} />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
  );

  if (embedded) {
    return <div className={className}>{content}</div>;
  }

  return (
    <Card title={title} description={description} className={className}>
      {content}
    </Card>
  );
}

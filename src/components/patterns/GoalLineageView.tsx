"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Alert, Badge, Card, Button } from "@/src/components/ui";
import {
  fetchGoalLineageChain,
  fetchGoalLineage,
  GoalLineageChainData,
  GoalLineageChainNode,
  GoalLineageData,
  GoalLineageNode,
} from "@/app/employee/_lib/pmsClient";

export interface GoalLineageViewProps {
  goalId?: string;
  lineage?: GoalLineageData;
  chainData?: GoalLineageChainData;
  mode?: "tree" | "chain";
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

function hasAopData(node: GoalLineageNode | null | undefined) {
  if (!node) return false;
  return typeof node.aopAligned === "boolean" || Boolean(node.aopReference);
}

function contributionBand(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Medium";
  if (value <= 33) return "Low";
  if (value <= 66) return "Medium";
  return "High";
}

function contributionDisplay(value: number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
  }

  return contributionBand(value);
}

function chainLevelTitle(index: number, total: number) {
  if (total <= 1) return "Goal";
  if (index === 0) return "Employee Goal";
  if (index === total - 1) return "Business Goal / AOP";
  return "Manager Goal";
}

function buildExplanation(chainData: GoalLineageChainData | null) {
  if (!chainData) return "No lineage explanation is available.";

  const managerGoal = chainData.parentGoal?.title || "its parent goal";
  const companyObjective = chainData.aopReference || "an identified company objective";

  return `This goal contributes to ${managerGoal}, which supports the company objective: ${companyObjective}.`;
}

function ChainNode({ node, index, total }: { node: GoalLineageChainNode; index: number; total: number }) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="body-sm font-medium text-[var(--color-text)]">{node.title || "Untitled goal"}</p>
        <Badge variant="default">Contribution: {contributionDisplay(node.contributionPercent)}</Badge>
      </div>
      <p className="caption mt-1">{chainLevelTitle(index, total)}</p>
      <div className="mt-1 flex flex-wrap gap-3">
        {node.owner && <span className="caption">Owner: {node.owner}</span>}
        {node.goalLevel && <span className="caption">Level: {node.goalLevel}</span>}
        {node.status && <span className="caption">Status: {node.status}</span>}
      </div>
      {node.aopReference && <p className="caption mt-1">AOP: {node.aopReference}</p>}
    </div>
  );
}

function VerticalChainView({ chainData }: { chainData: GoalLineageChainData }) {
  const chain = Array.isArray(chainData.chain) ? chainData.chain : [];

  if (chain.length === 0) {
    return <p className="caption">No lineage data available.</p>;
  }

  return (
    <div className="space-y-2">
      {chain.map((node, index) => (
        <div key={node.goalId || `chain-${index}`}>
          <ChainNode node={node} index={index} total={chain.length} />
          {index < chain.length - 1 && (
            <p className="caption px-2 py-1">Downstream contribution: {contributionDisplay(chain[index].contributionPercent)}</p>
          )}
        </div>
      ))}

      <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
        <p className="caption font-medium">Explanation</p>
        <p className="caption mt-1">{buildExplanation(chainData)}</p>
      </div>
    </div>
  );
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
  chainData,
  mode = "tree",
  title = "Goal Lineage",
  description = "Trace parent chain, current goal, and children goals with contribution and progress.",
  className,
  embedded = false,
  goalHrefBuilder,
}: GoalLineageViewProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<GoalLineageData | null>(lineage || null);
  const [chainState, setChainState] = useState<GoalLineageChainData | null>(chainData || null);

  const sourceData = useMemo(() => lineage || data, [lineage, data]);
  const sourceChainData = useMemo(() => chainData || chainState, [chainData, chainState]);

  useEffect(() => {
    let mounted = true;

    async function loadLineage() {
      if (!goalId) return;

      if (mode === "tree" && lineage) return;
      if (mode === "chain" && chainData) return;

      setLoading(true);
      setError("");

      try {
        if (mode === "chain") {
          const payload = await fetchGoalLineageChain(goalId);
          if (!mounted) return;
          setChainState(payload);
          return;
        }

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
  }, [goalId, lineage, chainData, mode]);

  const content = (
    <div className="space-y-4">
        {error && <Alert variant="error" title="Lineage error" description={error} onDismiss={() => setError("")} />}

        {!lineage && !chainData && goalId && (
          <div className="flex justify-end">
            <Button type="button" size="sm" variant="secondary" onClick={async () => {
              setLoading(true);
              setError("");
              try {
                if (mode === "chain") {
                  const payload = await fetchGoalLineageChain(goalId);
                  setChainState(payload);
                } else {
                  const payload = await fetchGoalLineage(goalId);
                  setData(payload);
                }
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

        {mode === "tree" && !loading && !sourceData && <p className="caption">No lineage data available.</p>}
        {mode === "chain" && !loading && !sourceChainData && <p className="caption">No lineage data available.</p>}
        {loading && <p className="caption">Loading lineage...</p>}

        {!loading && mode === "chain" && sourceChainData && (
          <VerticalChainView chainData={sourceChainData} />
        )}

        {mode === "tree" && sourceData && (
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
              {hasAopData(sourceData.currentGoal) && (
                <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
                  <p className="caption font-medium">Business Alignment</p>
                  {sourceData.currentGoal.aopAligned ? (
                    <>
                      <p className="caption mt-1">This contributes to AOP.</p>
                      <p className="caption mt-1">
                        {sourceData.currentGoal.aopReference || "This goal aligns with company objectives."}
                      </p>
                    </>
                  ) : (
                    <p className="caption mt-1">No direct AOP linkage identified</p>
                  )}
                </div>
              )}
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

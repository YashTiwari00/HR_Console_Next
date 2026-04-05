"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Card, Input, Textarea } from "@/src/components/ui";
import { Grid, Stack } from "@/src/components/layout";
import type { BulkGoalAnalysisItem } from "@/app/employee/_lib/pmsClient";
import GoalAllocationSuggestionCard from "@/src/components/patterns/GoalAllocationSuggestionCard";

export interface GoalAiDraft {
  title: string;
  description: string;
  weight: number;
  metrics: string;
  allocationSplitText: string;
}

export interface GoalAiComparisonCardProps {
  item: BulkGoalAnalysisItem;
  index: number;
  role: "manager" | "employee";
  draft: GoalAiDraft;
  onDraftChange: (draft: GoalAiDraft) => void;
  onApplySuggestion: () => void;
}

function initialSplitText(item: BulkGoalAnalysisItem): string {
  const split = item.allocationSuggestions?.[0]?.split;
  if (!Array.isArray(split) || split.length === 0) return "";
  return split.join("/");
}

export default function GoalAiComparisonCard({
  item,
  index,
  role,
  draft,
  onDraftChange,
  onApplySuggestion,
}: GoalAiComparisonCardProps) {
  const [showOriginal, setShowOriginal] = useState(false);

  const allocationPrimary = useMemo(
    () => (Array.isArray(item.allocationSuggestions) ? item.allocationSuggestions[0] || null : null),
    [item.allocationSuggestions]
  );

  const resolvedDraft = useMemo(
    () => ({
      ...draft,
      allocationSplitText: draft.allocationSplitText || initialSplitText(item),
    }),
    [draft, item]
  );

  return (
    <Card
      title={`Goal ${index + 1}`}
      description="Review AI improved wording, metrics, and apply edits before saving."
      footer={
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setShowOriginal((prev) => !prev)}>
            {showOriginal ? "Show AI Improved" : "Show Original"}
          </Button>
          <Button size="sm" onClick={onApplySuggestion}>
            Apply AI Suggestion
          </Button>
        </div>
      }
    >
      <Grid cols={1} colsMd={2} gap="3">
        <Stack gap="2">
          <Badge variant="default">Original Goal</Badge>
          <p className="body-sm font-medium text-[var(--color-text)]">{item.originalTitle || "Untitled"}</p>
        </Stack>

        <Stack gap="2">
          <Badge variant="success">AI Improved Goal</Badge>
          {showOriginal ? (
            <p className="caption">Toggle back to edit AI-improved version.</p>
          ) : (
            <>
              <Input
                label="Improved title"
                value={resolvedDraft.title}
                onChange={(event) =>
                  onDraftChange({
                    ...resolvedDraft,
                    title: event.target.value,
                  })
                }
              />
              <Textarea
                label="Improved description"
                value={resolvedDraft.description}
                onChange={(event) =>
                  onDraftChange({
                    ...resolvedDraft,
                    description: event.target.value,
                  })
                }
              />
              <Input
                label="Suggested metrics"
                value={resolvedDraft.metrics}
                onChange={(event) =>
                  onDraftChange({
                    ...resolvedDraft,
                    metrics: event.target.value,
                  })
                }
              />
              <Input
                label="Weight"
                type="number"
                min={1}
                max={100}
                value={String(resolvedDraft.weight)}
                onChange={(event) =>
                  onDraftChange({
                    ...resolvedDraft,
                    weight: Number.parseInt(event.target.value || "0", 10) || 0,
                  })
                }
              />
            </>
          )}
        </Stack>
      </Grid>

      {role === "manager" && (
        <div className="mt-3">
          <GoalAllocationSuggestionCard
            suggestion={allocationPrimary}
            splitText={resolvedDraft.allocationSplitText}
            onSplitTextChange={(value) =>
              onDraftChange({
                ...resolvedDraft,
                allocationSplitText: value,
              })
            }
          />
        </div>
      )}
    </Card>
  );
}

"use client";

import { Alert, Button, Card } from "@/src/components/ui";
import { Stack } from "@/src/components/layout";
import type { BulkGoalAnalysisItem } from "@/app/employee/_lib/pmsClient";
import GoalAiComparisonCard, { type GoalAiDraft } from "@/src/components/patterns/GoalAiComparisonCard";

export interface BulkGoalAiReviewPanelProps {
  role: "manager" | "employee";
  items: BulkGoalAnalysisItem[];
  drafts: GoalAiDraft[];
  loading: boolean;
  fallbackUsed: boolean;
  error: string;
  onDraftChange: (index: number, draft: GoalAiDraft) => void;
  onApplySuggestion: (index: number) => void;
  onApplyAll: () => void;
  onDismissError: () => void;
}

export default function BulkGoalAiReviewPanel({
  role,
  items,
  drafts,
  loading,
  fallbackUsed,
  error,
  onDraftChange,
  onApplySuggestion,
  onApplyAll,
  onDismissError,
}: BulkGoalAiReviewPanelProps) {
  return (
    <Card
      title="Bulk Goal AI Review"
      description="Compare original and improved goals before saving or submitting."
      footer={
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onApplyAll} disabled={items.length === 0 || loading}>
            Apply All AI Suggestions
          </Button>
        </div>
      }
    >
      <Stack gap="3">
        {loading && <p className="caption">AI is analyzing goals. Please wait...</p>}
        {fallbackUsed && (
          <Alert
            variant="warning"
            title="AI fallback active"
            description="AI analysis was unavailable for at least one goal. Original goal text was kept so you can continue."
          />
        )}
        {error && (
          <Alert
            variant="error"
            title="AI analysis error"
            description={error}
            onDismiss={onDismissError}
          />
        )}
        {!loading && items.length === 0 && (
          <p className="caption">Upload an Excel file with goals to start AI review.</p>
        )}

        {items.map((item, index) => (
          <GoalAiComparisonCard
            key={`${item.originalTitle}-${index}`}
            item={item}
            index={index}
            role={role}
            draft={drafts[index]}
            onDraftChange={(nextDraft) => onDraftChange(index, nextDraft)}
            onApplySuggestion={() => onApplySuggestion(index)}
          />
        ))}
      </Stack>
    </Card>
  );
}

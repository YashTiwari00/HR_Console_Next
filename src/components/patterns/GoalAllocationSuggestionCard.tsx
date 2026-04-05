"use client";

import { Badge, Card, Input } from "@/src/components/ui";
import { Stack } from "@/src/components/layout";
import type { GoalAllocationSuggestion } from "@/app/employee/_lib/pmsClient";

export interface GoalAllocationSuggestionCardProps {
  suggestion: GoalAllocationSuggestion | null;
  splitText: string;
  onSplitTextChange: (value: string) => void;
}

export default function GoalAllocationSuggestionCard({
  suggestion,
  splitText,
  onSplitTextChange,
}: GoalAllocationSuggestionCardProps) {
  const recommendation =
    suggestion && suggestion.suggestedUsers > 0
      ? `Recommended: ${suggestion.suggestedUsers} people (${suggestion.split.join("% / ")}% )`
      : "No allocation recommendation returned.";

  return (
    <Card title="Allocation Suggestion" description="AI recommendation with manual override.">
      <Stack gap="2">
        <Badge variant="info">Manager Only</Badge>
        <p className="caption">{recommendation}</p>
        <Input
          label="Allocation split override"
          value={splitText}
          onChange={(event) => onSplitTextChange(event.target.value)}
          helperText="Example: 50/50 or 40/30/30"
        />
      </Stack>
    </Card>
  );
}

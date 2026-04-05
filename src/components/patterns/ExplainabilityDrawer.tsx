"use client";

import { Badge, Card, Modal } from "@/src/components/ui";

export interface ExplainabilityPayload {
  source?: string;
  confidence?: string;
  whyFactors?: string[];
  timeWindow?: string;
}

export interface ExplainabilityDrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  payload?: ExplainabilityPayload | null;
}

function confidenceVariant(confidence: string) {
  const normalized = String(confidence || "").trim().toLowerCase();
  if (normalized === "high") return "success" as const;
  if (normalized === "low") return "warning" as const;
  return "info" as const;
}

export default function ExplainabilityDrawer({
  open,
  onClose,
  title = "AI Explainability",
  payload,
}: ExplainabilityDrawerProps) {
  const source = String(payload?.source || "openrouter_llm").trim() || "openrouter_llm";
  const confidence = String(payload?.confidence || "medium").trim() || "medium";
  const timeWindow = String(payload?.timeWindow || "current_cycle").trim() || "current_cycle";
  const whyFactors = Array.isArray(payload?.whyFactors)
    ? payload.whyFactors.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description="Transparent factors behind AI-generated recommendation."
      allowContentOverflow
    >
      <div className="space-y-3">
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default">Source: {source}</Badge>
            <Badge variant={confidenceVariant(confidence)}>Confidence: {confidence}</Badge>
            <Badge variant="info">Window: {timeWindow}</Badge>
          </div>
        </Card>

        <Card title="Why Factors" description="Primary signals used for this recommendation.">
          {whyFactors.length === 0 ? (
            <p className="caption">No specific factors were returned for this response.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 caption">
              {whyFactors.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </Modal>
  );
}
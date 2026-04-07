"use client";

import { Badge, Card, Modal } from "@/src/components/ui";

export interface ExplainabilityPayload {
  source?: string;
  confidence?: string | number;
  confidenceLabel?: string;
  reason?: string;
  based_on?: string[];
  time_window?: string;
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

function normalizeConfidenceLabel(payload: ExplainabilityPayload | null | undefined) {
  const explicit = String(payload?.confidenceLabel || "").trim().toLowerCase();
  if (explicit) return explicit;

  const raw = payload?.confidence;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (raw >= 0.8) return "high";
    if (raw >= 0.6) return "medium";
    return "low";
  }

  const text = String(raw || "").trim().toLowerCase();
  if (text === "high" || text === "medium" || text === "low") return text;
  return "medium";
}

export default function ExplainabilityDrawer({
  open,
  onClose,
  title = "AI Explainability",
  payload,
}: ExplainabilityDrawerProps) {
  const source = String(payload?.source || "openrouter_llm").trim() || "openrouter_llm";
  const confidence = normalizeConfidenceLabel(payload);
  const confidenceValue =
    typeof payload?.confidence === "number" && Number.isFinite(payload.confidence)
      ? payload.confidence.toFixed(2)
      : null;
  const timeWindow = String(payload?.time_window || payload?.timeWindow || "current_cycle").trim() || "current_cycle";
  const reason = String(payload?.reason || "").trim();
  const basedOn = Array.isArray(payload?.based_on)
    ? payload.based_on.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const whyFactors = Array.isArray(payload?.whyFactors)
    ? payload.whyFactors.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const factors = basedOn.length > 0 ? basedOn : whyFactors;

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
            <Badge variant={confidenceVariant(confidence)}>
              Confidence: {confidenceValue ? `${confidence} (${confidenceValue})` : confidence}
            </Badge>
            <Badge variant="info">Window: {timeWindow}</Badge>
          </div>
        </Card>

        <Card title="Reason" description="Why this AI output was generated.">
          <p className="caption">
            {reason || "Output generated from available context and role-aware patterns."}
          </p>
        </Card>

        <Card title="Why Factors" description="Primary signals used for this recommendation.">
          {factors.length === 0 ? (
            <p className="caption">No specific factors were returned for this response.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 caption">
              {factors.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </Modal>
  );
}
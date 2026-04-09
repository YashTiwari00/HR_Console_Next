export function text(value) {
  return String(value || "").trim();
}

export function iso(value) {
  const parsed = new Date(value || "").valueOf();
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

export function isMissingCollectionError(error, collectionId) {
  const message = text(error?.message).toLowerCase();
  const id = text(collectionId).toLowerCase();
  return (
    message.includes("collection") &&
    message.includes("could not be found") &&
    (!id || message.includes(id))
  );
}

function toScoreRank(label) {
  const normalized = text(label).toUpperCase();
  if (normalized === "EE") return 5;
  if (normalized === "DE") return 4;
  if (normalized === "ME") return 3;
  if (normalized === "SME") return 2;
  if (normalized === "NI") return 1;
  return 0;
}

export function mapReadinessBand(band) {
  const normalized = text(band).toLowerCase();
  if (normalized === "low") {
    return { label: "Early Stage", description: "Building foundational skills", color: "muted" };
  }
  if (normalized === "medium") {
    return { label: "Developing", description: "Growing steadily toward next level", color: "info" };
  }
  if (normalized === "high") {
    return { label: "Ready", description: "Demonstrates readiness for next opportunity", color: "success" };
  }
  if (normalized === "exceptional") {
    return {
      label: "Exceeding",
      description: "Consistently outperforming current level expectations",
      color: "primary",
    };
  }
  return null;
}

export function deriveReadinessFromHistory(cycleHistory) {
  const labels = Array.isArray(cycleHistory)
    ? cycleHistory.map((item) => text(item?.scoreLabel).toUpperCase()).filter(Boolean)
    : [];

  if (labels.length >= 2 && ["EE", "DE"].includes(labels[0]) && ["EE", "DE"].includes(labels[1])) {
    return mapReadinessBand("high");
  }

  if (labels.length >= 2 && toScoreRank(labels[0]) > toScoreRank(labels[1])) {
    return mapReadinessBand("medium");
  }

  return mapReadinessBand("low");
}

export function dedupeTnaItems(items, maxItems = 5) {
  const output = [];
  const seen = new Set();

  for (const item of items) {
    const area = text(item?.area);
    const key = area.toLowerCase();
    if (!area || seen.has(key)) continue;

    seen.add(key);
    output.push({
      area,
      signal: text(item?.signal),
      cycleId: text(item?.cycleId),
    });

    if (output.length >= maxItems) break;
  }

  return output;
}

export function buildFallbackPayload() {
  return {
    employeeId: null,
    employeeName: null,
    role: null,
    department: null,
    cycleHistory: null,
    latestReadiness: null,
    tnaItems: null,
    recentGoals: null,
    selfReviewSummary: null,
    dataAvailable: {
      hasCycleHistory: false,
      hasTalentSnapshot: false,
      hasTnaItems: false,
    },
    generatedAt: new Date().toISOString(),
  };
}

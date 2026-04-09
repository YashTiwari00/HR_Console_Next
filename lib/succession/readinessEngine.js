const TREND_LABELS = {
  NEW: "new",
  STABLE: "stable",
  IMPROVING: "improving",
  DECLINING: "declining",
};

const CONFIDENCE_LEVELS = {
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
};

const SUGGESTED_TAGS = {
  READY: "ready",
  NEEDS_DEVELOPMENT: "needs_development",
  WATCH: "watch",
};

function toFiniteNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundToTwo(value) {
  return Number(Number(value || 0).toFixed(2));
}

function normalizeScoreX100(scoreX100) {
  const numeric = toFiniteNumber(scoreX100, 0);
  return clamp(roundToTwo((numeric / 500) * 100), 0, 100);
}

function parseTrendLabel(input) {
  const text = String(input || "").trim().toLowerCase();
  if (Object.values(TREND_LABELS).includes(text)) {
    return text;
  }
  return TREND_LABELS.NEW;
}

function inferTrendFromScores(scores) {
  const rows = Array.isArray(scores) ? scores : [];
  const values = rows
    .slice(0, 3)
    .map((row) => toFiniteNumber(row?.scoreX100, null))
    .filter((value) => Number.isFinite(value));

  if (values.length <= 1) {
    return {
      trendLabel: TREND_LABELS.NEW,
      trendDeltaPercent: 0,
    };
  }

  const first = values[values.length - 1];
  const latest = values[0];
  const baseline = Math.max(Math.abs(first), 1);
  const deltaPercent = roundToTwo(((latest - first) / baseline) * 100);

  if (Math.abs(deltaPercent) <= 3) {
    return {
      trendLabel: TREND_LABELS.STABLE,
      trendDeltaPercent: deltaPercent,
    };
  }

  return {
    trendLabel: deltaPercent > 0 ? TREND_LABELS.IMPROVING : TREND_LABELS.DECLINING,
    trendDeltaPercent: deltaPercent,
  };
}

function normalizeGoalCompletionConsistency(input) {
  if (Array.isArray(input)) {
    const values = input
      .map((item) => {
        const direct = toFiniteNumber(item, null);
        if (Number.isFinite(direct)) return direct;

        const fromPercent = toFiniteNumber(item?.completionPercent ?? item?.completedPercent, null);
        if (Number.isFinite(fromPercent)) return fromPercent;

        const completed = toFiniteNumber(item?.completedGoals, null);
        const total = toFiniteNumber(item?.totalGoals, null);
        if (Number.isFinite(completed) && Number.isFinite(total) && total > 0) {
          return (completed / total) * 100;
        }

        return null;
      })
      .filter((value) => Number.isFinite(value));

    if (values.length === 0) return null;
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    return clamp(roundToTwo(average), 0, 100);
  }

  const numeric = toFiniteNumber(input, null);
  if (!Number.isFinite(numeric)) return null;
  return clamp(roundToTwo(numeric), 0, 100);
}

function parseRatingDropSignal(input) {
  const riskLevel = String(input?.riskLevel || "").trim().toUpperCase();
  const drop = toFiniteNumber(input?.drop ?? input?.ratingDrop, null);

  if (riskLevel === "HIGH RISK" || (Number.isFinite(drop) && drop > 1)) {
    return { severity: "high", penalty: -30 };
  }

  if (riskLevel === "MODERATE" || (Number.isFinite(drop) && drop > 0)) {
    return { severity: "moderate", penalty: -18 };
  }

  return { severity: "none", penalty: 0 };
}

function buildReason(parts) {
  return parts.filter(Boolean).join(" ");
}

function toConfidenceLevel(confidenceScore) {
  if (confidenceScore >= 0.8) return CONFIDENCE_LEVELS.HIGH;
  if (confidenceScore >= 0.6) return CONFIDENCE_LEVELS.MEDIUM;
  return CONFIDENCE_LEVELS.LOW;
}

function buildExplainability({
  basePerformance,
  trendLabel,
  trendDeltaPercent,
  completionConsistency,
  ratingDropSeverity,
  suggestedTag,
}) {
  const factors = [];

  if (basePerformance >= 80) {
    factors.push("Consistent high performance over last cycles");
  } else if (basePerformance >= 60) {
    factors.push("Steady performance over recent cycles");
  } else {
    factors.push("Performance is below succession-ready threshold");
  }

  if (trendLabel === TREND_LABELS.IMPROVING) {
    factors.push("Improving trajectory");
  } else if (trendLabel === TREND_LABELS.STABLE) {
    factors.push("Stable trajectory");
  } else if (trendLabel === TREND_LABELS.DECLINING) {
    factors.push("Declining trajectory");
  } else {
    factors.push("Limited trajectory history");
  }

  if (Number.isFinite(completionConsistency)) {
    if (completionConsistency >= 75) {
      factors.push("Strong goal completion consistency");
    } else if (completionConsistency >= 55) {
      factors.push("Moderate goal completion consistency");
    } else {
      factors.push("Low goal completion consistency");
    }
  } else {
    factors.push("Goal completion consistency data is limited");
  }

  if (ratingDropSeverity === "none") {
    factors.push("No rating drops");
  } else if (ratingDropSeverity === "moderate") {
    factors.push("Recent moderate rating drop risk");
  } else {
    factors.push("Recent high rating drop risk");
  }

  let summary = "Employee is being monitored for readiness progression.";
  if (suggestedTag === SUGGESTED_TAGS.READY) {
    summary = "Employee is ready for next role within 6 months.";
  } else if (suggestedTag === SUGGESTED_TAGS.NEEDS_DEVELOPMENT) {
    summary = "Employee can be ready with focused development in the next 6-12 months.";
  } else if (suggestedTag === SUGGESTED_TAGS.WATCH) {
    summary = "Employee needs sustained improvement before next-role readiness.";
  }

  // Deterministic explainability object for UI and audit trails.
  return {
    factors,
    summary,
    diagnostics: {
      basePerformance: roundToTwo(basePerformance),
      trendLabel,
      trendDeltaPercent: roundToTwo(trendDeltaPercent),
      completionConsistency: Number.isFinite(completionConsistency)
        ? roundToTwo(completionConsistency)
        : null,
      ratingDropSeverity,
    },
  };
}

export function computeReadiness(input = {}) {
  const scoreRows = Array.isArray(input.employeeCycleScores)
    ? input.employeeCycleScores.slice(0, 3)
    : [];

  const latestScoreX100 = toFiniteNumber(scoreRows[0]?.scoreX100, 0);
  const latestPerformance = normalizeScoreX100(latestScoreX100);

  const recentNormalized = scoreRows
    .map((row) => normalizeScoreX100(row?.scoreX100))
    .filter((value) => Number.isFinite(value));

  const averagePerformance =
    recentNormalized.length > 0
      ? recentNormalized.reduce((sum, value) => sum + value, 0) / recentNormalized.length
      : latestPerformance;

  const inferredTrend = inferTrendFromScores(scoreRows);
  const trendLabel = parseTrendLabel(input.trajectoryTrend?.trendLabel ?? input.trajectoryTrend);
  const trendDeltaPercent = toFiniteNumber(
    input.trajectoryTrend?.trendDeltaPercent,
    inferredTrend.trendDeltaPercent
  );
  const resolvedTrend = trendLabel === TREND_LABELS.NEW ? inferredTrend.trendLabel : trendLabel;

  const completionConsistency = normalizeGoalCompletionConsistency(input.goalCompletionConsistency);
  const completionAdjustment = Number.isFinite(completionConsistency)
    ? roundToTwo(((completionConsistency - 60) / 40) * 12)
    : 0;

  const ratingDrop = parseRatingDropSignal(input.ratingDropAnalysis);

  const trendAdjustment =
    resolvedTrend === TREND_LABELS.IMPROVING
      ? 12
      : resolvedTrend === TREND_LABELS.STABLE
      ? 0
      : resolvedTrend === TREND_LABELS.DECLINING
      ? -20
      : -4;

  const basePerformance = roundToTwo(latestPerformance * 0.65 + averagePerformance * 0.35);
  let score = clamp(
    roundToTwo(basePerformance + trendAdjustment + completionAdjustment + ratingDrop.penalty),
    0,
    100
  );

  const negativeSignals =
    resolvedTrend === TREND_LABELS.DECLINING || ratingDrop.severity !== "none";
  const highPerformerImproving =
    basePerformance >= 75 && resolvedTrend === TREND_LABELS.IMPROVING && ratingDrop.severity === "none";

  if (highPerformerImproving) {
    score = clamp(Math.max(score, 80), 80, 100);
  } else if (negativeSignals) {
    score = clamp(Math.min(score, 50), 0, 50);
  } else {
    score = clamp(score, 50, 80);
  }

  let suggestedTag = SUGGESTED_TAGS.WATCH;
  if (score >= 80) {
    suggestedTag = SUGGESTED_TAGS.READY;
  } else if (score >= 50) {
    suggestedTag = SUGGESTED_TAGS.NEEDS_DEVELOPMENT;
  }

  const reasonParts = [];
  reasonParts.push(
    `Recent performance baseline is ${roundToTwo(basePerformance)} out of 100 from the last ${Math.max(
      recentNormalized.length,
      1
    )} cycle(s).`
  );

  if (resolvedTrend === TREND_LABELS.IMPROVING) {
    reasonParts.push(`Trajectory is improving (${roundToTwo(trendDeltaPercent)}% change).`);
  } else if (resolvedTrend === TREND_LABELS.STABLE) {
    reasonParts.push(`Trajectory is stable (${roundToTwo(trendDeltaPercent)}% change).`);
  } else if (resolvedTrend === TREND_LABELS.DECLINING) {
    reasonParts.push(`Trajectory is declining (${roundToTwo(trendDeltaPercent)}% change).`);
  } else {
    reasonParts.push("Limited historical trajectory was available.");
  }

  if (Number.isFinite(completionConsistency)) {
    reasonParts.push(
      `Goal completion consistency is ${roundToTwo(completionConsistency)}%, which ${
        completionConsistency >= 75 ? "supports" : "limits"
      } readiness.`
    );
  } else {
    reasonParts.push("Goal completion consistency data was limited.");
  }

  if (ratingDrop.severity === "high") {
    reasonParts.push("Recent rating-drop analysis indicates HIGH RISK, reducing readiness.");
  } else if (ratingDrop.severity === "moderate") {
    reasonParts.push("Recent rating-drop analysis indicates MODERATE risk, reducing readiness.");
  } else {
    reasonParts.push("No recent rating-drop signal was detected.");
  }

  const dataCoverageScore =
    0.45 +
    (recentNormalized.length >= 2 ? 0.2 : 0) +
    (Number.isFinite(completionConsistency) ? 0.15 : 0) +
    (input.ratingDropAnalysis ? 0.1 : 0) +
    (input.trajectoryTrend ? 0.1 : 0);

  const confidence = clamp(roundToTwo(dataCoverageScore), 0, 1);
  const confidenceLevel = toConfidenceLevel(confidence);

  const explainability = buildExplainability({
    basePerformance,
    trendLabel: resolvedTrend,
    trendDeltaPercent,
    completionConsistency,
    ratingDropSeverity: ratingDrop.severity,
    suggestedTag,
  });

  return {
    readinessScore: Math.round(score),
    suggestedTag,
    reason: explainability.summary,
    explainability,
    reasonText: buildReason(reasonParts),
    confidence,
    confidenceLevel,
    factors: {
      basePerformance: roundToTwo(basePerformance),
      trendLabel: resolvedTrend,
      trendDeltaPercent: roundToTwo(trendDeltaPercent),
      completionConsistency,
      ratingDropSeverity: ratingDrop.severity,
    },
  };
}

export { TREND_LABELS, CONFIDENCE_LEVELS, SUGGESTED_TAGS };

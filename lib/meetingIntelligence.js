function normalizeIds(values) {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
}

export function parseStringList(rawValue) {
  if (Array.isArray(rawValue)) {
    return normalizeIds(rawValue);
  }

  const text = String(rawValue || "").trim();
  if (!text) return [];

  if (text.startsWith("[") || text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return normalizeIds(parsed);
      }
    } catch {
      // Fall back to comma-separated parsing.
    }
  }

  return normalizeIds(text.split(","));
}

export function parseActionItems(rawValue) {
  const text = String(rawValue || "").trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => ({
        owner: String(item?.owner || "").trim(),
        action: String(item?.action || "").trim(),
        dueDate: item?.dueDate ? String(item.dueDate) : null,
      }))
      .filter((item) => item.owner && item.action);
  } catch {
    return [];
  }
}

export function parseGoalInsights(rawValue) {
  const text = String(rawValue || "").trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => ({
        goalId: String(item?.goalId || "").trim(),
        insight: String(item?.insight || "").trim(),
        impact: String(item?.impact || "").trim() || "neutral",
      }))
      .filter((item) => item.goalId && item.insight);
  } catch {
    return [];
  }
}

export function parseMeetingIntelligenceReport(meeting) {
  const transcriptText = String(meeting?.transcriptText || "").trim();
  const summary = String(meeting?.intelligenceSummary || "").trim();

  if (!transcriptText && !summary) {
    return null;
  }

  return {
    transcriptText,
    summary,
    keyTakeaways: parseStringList(meeting?.intelligenceKeyTakeaways),
    actionItems: parseActionItems(meeting?.intelligenceActionItems),
    goalInsights: parseGoalInsights(meeting?.intelligenceGoalInsights),
    generatedAt: String(meeting?.intelligenceGeneratedAt || meeting?.$updatedAt || "").trim(),
  };
}

export function buildMeetingParticipantIds(meeting) {
  const baseIds = [
    String(meeting?.employeeId || "").trim(),
    String(meeting?.managerId || "").trim(),
  ];

  return normalizeIds([...baseIds, ...parseStringList(meeting?.participantIds)]);
}

export function assertMeetingParticipant(profile, meeting) {
  const profileId = String(profile?.$id || "").trim();
  const participantIds = buildMeetingParticipantIds(meeting);

  if (!profileId || !participantIds.includes(profileId)) {
    const error = new Error("Forbidden. You are not a participant in this meeting.");
    error.statusCode = 403;
    throw error;
  }

  return participantIds;
}

export function buildIntelligenceUpdatePayload(report, transcriptSource) {
  const now = new Date().toISOString();
  return {
    transcriptText: String(report?.transcriptText || "").trim(),
    transcriptSource: String(transcriptSource || "manual").trim() || "manual",
    intelligenceGeneratedAt: now,
  };
}

export function parseLinkedGoalIds(meeting) {
  return parseStringList(meeting?.linkedGoalIds);
}

export function toMeetingType(value) {
  return String(value || "").trim().toLowerCase() === "group" ? "group" : "individual";
}

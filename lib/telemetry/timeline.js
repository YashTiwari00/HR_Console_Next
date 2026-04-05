export function emitTimelineTelemetry(eventName, payload = {}) {
  const safeEvent = String(eventName || "timeline.event").trim() || "timeline.event";
  const entry = {
    eventName: safeEvent,
    at: new Date().toISOString(),
    payload,
  };

  try {
    // Server-side structured log for timeline analytics bootstrap.
    console.info("[timeline_telemetry]", JSON.stringify(entry));
  } catch {
    // No-op: telemetry should never break request flow.
  }
}

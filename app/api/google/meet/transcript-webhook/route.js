import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse } from "@/lib/serverAuth";
import { parseStringList } from "@/lib/meetingIntelligence";
import { createAdminServices } from "@/lib/appwriteServer";
import { assertAndTrackAiUsage, trackAiUsageCost } from "@/app/api/ai/_lib/aiUsage";
import { callOpenRouterWithUsage } from "@/lib/openrouter";
import { upsertMeetingIntelligenceReport } from "@/lib/meetingIntelligenceStore";
import { upsertMeetingMetadata } from "@/lib/meetingMetadataStore";
import { buildAiUsageDelta } from "@/lib/ai/costEstimation";
import { buildExplainability } from "@/lib/ai/explainability";

function hasWebhookAccess(request) {
  const configuredSecret = String(process.env.GOOGLE_MEET_TRANSCRIPT_WEBHOOK_SECRET || "").trim();
  if (!configuredSecret) return false;

  const headerSecret = String(request.headers.get("x-meet-webhook-secret") || "").trim();
  return Boolean(headerSecret) && headerSecret === configuredSecret;
}

function safeParseJson(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function normalizeStringList(values, maxItems = 8) {
  if (!Array.isArray(values)) return [];
  return values
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeActionItems(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((item) => ({
      owner: String(item?.owner || "").trim(),
      action: String(item?.action || "").trim(),
      dueDate: item?.dueDate ? String(item.dueDate) : null,
    }))
    .filter((item) => item.owner && item.action)
    .slice(0, 12);
}

function normalizeGoalInsights(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((item) => ({
      goalId: String(item?.goalId || "").trim(),
      insight: String(item?.insight || "").trim(),
      impact: String(item?.impact || "").trim() || "neutral",
    }))
    .filter((item) => item.goalId && item.insight)
    .slice(0, 12);
}

async function listGoals(databases, goalIds) {
  if (!goalIds.length) return [];

  const result = await databases.listDocuments(databaseId, appwriteConfig.goalsCollectionId, [
    Query.equal("$id", goalIds),
    Query.limit(Math.max(50, goalIds.length + 5)),
  ]);

  return result.documents;
}

function buildGoalContext(goals) {
  if (!goals.length) return "No linked goals provided.";

  return goals
    .map((goal) => {
      const title = String(goal?.title || "Untitled goal").trim();
      const status = String(goal?.status || "unknown").trim();
      const progress = Number(goal?.progressPercent ?? goal?.processPercent ?? 0);
      return `- ${goal.$id}: ${title} (status=${status}, progress=${Number.isFinite(progress) ? progress : 0}%)`;
    })
    .join("\n");
}

function resolveCycleId(goals, meetingId) {
  const firstGoalCycleId = String(goals?.[0]?.cycleId || "").trim();
  if (firstGoalCycleId) return firstGoalCycleId;
  return `meeting:${meetingId}`;
}

async function generateIntelligenceFromTranscript({
  databases,
  meeting,
  transcriptText,
  transcriptSource,
}) {
  const linkedGoalIds = parseStringList(meeting?.linkedGoalIds);
  const goals = await listGoals(databases, linkedGoalIds);
  const cycleId = resolveCycleId(goals, meeting.$id);
  const usageUserId = String(meeting?.employeeId || meeting?.managerId || "").trim();
  let usage = null;

  if (usageUserId) {
    usage = await assertAndTrackAiUsage({
      databases,
      userId: usageUserId,
      cycleId,
      featureType: "meeting_intelligence",
      userRole: "employee",
    });
  }

  const messages = [
    {
      role: "system",
      content:
        "You are a performance meeting intelligence assistant. Use only the transcript and linked goals context. Return valid JSON only.",
    },
    {
      role: "user",
      content: `Create structured meeting intelligence for this goal-linked meeting.\n\nLinked goals:\n${buildGoalContext(
        goals
      )}\n\nTranscript:\n${transcriptText}\n\nReturn JSON with this exact schema:\n{"summary":"...","keyTakeaways":["..."],"actionItems":[{"owner":"...","action":"...","dueDate":"optional ISO date"}],"goalInsights":[{"goalId":"...","insight":"...","impact":"positive|neutral|risk"}]}`,
    },
  ];

  const completion = await callOpenRouterWithUsage({
    jsonMode: true,
    maxTokens: 700,
    messages,
  });

  if (usageUserId && usage) {
    const usageDelta = buildAiUsageDelta({
      providerUsage: completion.usage,
      messages,
      completionText: completion.content,
    });

    await trackAiUsageCost({
      databases,
      userId: usageUserId,
      cycleId,
      featureType: "meeting_intelligence",
      usage,
      tokensUsedDelta: usageDelta.tokensUsed,
      estimatedCostDelta: usageDelta.estimatedCost,
    });
  }

  const parsed = safeParseJson(completion.content, {});
  const generatedAt = new Date().toISOString();

  return {
    transcriptText,
    transcriptSource,
    summary: String(parsed?.summary || "").trim() || "Meeting intelligence generated.",
    keyTakeaways: normalizeStringList(parsed?.keyTakeaways, 10),
    actionItems: normalizeActionItems(parsed?.actionItems),
    goalInsights: normalizeGoalInsights(parsed?.goalInsights),
    explainability: buildExplainability({
      source: "openrouter_llm",
      confidence: 0.78,
      reason: "Webhook intelligence generated from transcript and linked goal context.",
      based_on: ["meeting transcript", "linked goals"],
      time_window: cycleId,
    }),
    generatedAt,
  };
}

async function findMeeting(databases, input) {
  const requestId = String(input?.meetingRequestId || "").trim();
  const eventId = String(input?.eventId || "").trim();

  if (requestId) {
    return databases.getDocument(
      databaseId,
      appwriteConfig.googleMeetRequestsCollectionId,
      requestId
    );
  }

  if (!eventId) {
    const error = new Error("meetingRequestId or eventId is required.");
    error.statusCode = 400;
    throw error;
  }

  const result = await databases.listDocuments(
    databaseId,
    appwriteConfig.googleMeetRequestsCollectionId,
    [Query.equal("eventId", eventId), Query.limit(1)]
  );

  const meeting = result.documents[0] || null;
  if (!meeting) {
    const error = new Error("Meeting not found for provided eventId.");
    error.statusCode = 404;
    throw error;
  }

  return meeting;
}

async function updateMeetingWithFallback(databases, meetingId, payload) {
  let nextPayload = { ...payload };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await databases.updateDocument(
        databaseId,
        appwriteConfig.googleMeetRequestsCollectionId,
        meetingId,
        nextPayload
      );
    } catch (error) {
      const message = String(error?.message || "").toLowerCase();
      const missingAttrMatch =
        message.match(/attribute not found in schema:\s*([a-z0-9_]+)/i) ||
        message.match(/unknown attribute:\s*"?([a-z0-9_]+)"?/i);

      if (!missingAttrMatch) {
        throw error;
      }

      const missingAttr = missingAttrMatch[1];
      if (!(missingAttr in nextPayload)) {
        throw error;
      }

      const reducedPayload = { ...nextPayload };
      delete reducedPayload[missingAttr];
      nextPayload = reducedPayload;
    }
  }

  return databases.updateDocument(
    databaseId,
    appwriteConfig.googleMeetRequestsCollectionId,
    meetingId,
    nextPayload
  );
}

export async function POST(request) {
  try {
    if (!hasWebhookAccess(request)) {
      return Response.json({ error: "Unauthorized webhook call." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const transcriptText = String(body?.transcriptText || "").trim();
    const transcriptSource = String(body?.transcriptSource || "google_meet").trim() || "google_meet";
    const shouldGenerateIntelligence =
      body?.generateIntelligence !== false &&
      String(process.env.GOOGLE_MEET_AUTO_INTELLIGENCE || "true").trim().toLowerCase() !== "false";

    if (!transcriptText || transcriptText.length < 10) {
      return Response.json(
        { error: "transcriptText is required and must be at least 10 characters." },
        { status: 400 }
      );
    }

    const { databases } = createAdminServices();
    const meeting = await findMeeting(databases, body);

    const linkedGoalIds = parseStringList(meeting?.linkedGoalIds);
    const basePayload = {
      transcriptText,
      transcriptSource,
      linkedGoalIds: JSON.stringify(linkedGoalIds),
    };

    await upsertMeetingMetadata(databases, meeting.$id, {
      linkedGoalIds,
      participantIds: parseStringList(meeting?.participantIds),
      participantEmails: parseStringList(meeting?.participantEmails),
    });

    const updatedBase = await updateMeetingWithFallback(databases, meeting.$id, basePayload);

    let intelligenceGenerated = false;
    let updated = updatedBase;
    let intelligenceError = "";

    if (shouldGenerateIntelligence) {
      try {
        const intelligencePayload = await generateIntelligenceFromTranscript({
          databases,
          meeting: updatedBase,
          transcriptText,
          transcriptSource,
        });

        const stored = await upsertMeetingIntelligenceReport(databases, updatedBase, intelligencePayload);
        if (!stored.saved) {
          throw new Error(
            stored.error ||
              "Meeting intelligence storage unavailable. Check meeting_intelligence collection schema."
          );
        }

        updated = await updateMeetingWithFallback(databases, meeting.$id, {
          intelligenceGeneratedAt: intelligencePayload.generatedAt,
        });
        intelligenceGenerated = true;
      } catch (error) {
        intelligenceError = String(error?.message || "Unable to generate intelligence.").trim();
      }
    }

    return Response.json({
      data: {
        meetingId: updated.$id,
        eventId: updated.eventId || null,
        transcriptCaptured: true,
        intelligenceGenerated,
        ...(intelligenceError ? { intelligenceError } : {}),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

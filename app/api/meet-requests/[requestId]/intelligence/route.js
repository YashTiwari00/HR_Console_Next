import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { assertAndTrackAiUsage } from "@/app/api/ai/_lib/aiUsage";
import { callOpenRouter } from "@/lib/openrouter";
import {
  assertMeetingParticipant,
  buildIntelligenceUpdatePayload,
  parseLinkedGoalIds,
} from "@/lib/meetingIntelligence";
import {
  fetchMeetingIntelligenceReport,
  upsertMeetingIntelligenceReport,
} from "@/lib/meetingIntelligenceStore";
import { getMeetingWithMetadata } from "@/lib/meetingMetadataStore";
import { errorResponse, requireAuth } from "@/lib/serverAuth";

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

async function updateMeetingWithFallback(databases, meetingId, payload) {
  let nextPayload = { ...payload };

  for (let attempt = 0; attempt < 5; attempt += 1) {
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

export async function GET(request, context) {
  try {
    const { profile, databases } = await requireAuth(request);
    const params = await context.params;
    const meetingId = String(params?.requestId || "").trim();

    if (!meetingId) {
      return Response.json({ error: "requestId is required." }, { status: 400 });
    }

    const meetingRaw = await databases.getDocument(
      databaseId,
      appwriteConfig.googleMeetRequestsCollectionId,
      meetingId
    );
    const meeting = await getMeetingWithMetadata(databases, meetingRaw);

    assertMeetingParticipant(profile, meeting);

    const intelligence = await fetchMeetingIntelligenceReport(databases, meeting);

    return Response.json({
      data: {
        meeting,
        report: intelligence.report,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request, context) {
  try {
    const { profile, databases } = await requireAuth(request);
    const params = await context.params;
    const meetingId = String(params?.requestId || "").trim();

    if (!meetingId) {
      return Response.json({ error: "requestId is required." }, { status: 400 });
    }

    const meetingRaw = await databases.getDocument(
      databaseId,
      appwriteConfig.googleMeetRequestsCollectionId,
      meetingId
    );
    const meeting = await getMeetingWithMetadata(databases, meetingRaw);

    assertMeetingParticipant(profile, meeting);

    const body = await request.json();
    const transcriptText = String(body?.transcriptText || "").trim();
    const transcriptSource = String(body?.transcriptSource || "manual").trim() || "manual";

    if (!transcriptText || transcriptText.length < 30) {
      return Response.json(
        { error: "transcriptText is required and should be at least 30 characters." },
        { status: 400 }
      );
    }

    const linkedGoalIds = parseLinkedGoalIds(meeting);
    const goals = await listGoals(databases, linkedGoalIds);
    const cycleId = resolveCycleId(goals, meetingId);

    const usage = await assertAndTrackAiUsage({
      databases,
      userId: profile.$id,
      cycleId,
      featureType: "meeting_intelligence",
    });

    const raw = await callOpenRouter({
      jsonMode: true,
      maxTokens: 700,
      messages: [
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
      ],
    });

    const parsed = safeParseJson(raw, {});
    const report = {
      transcriptText,
      summary: String(parsed?.summary || "").trim() || "Meeting intelligence generated.",
      keyTakeaways: normalizeStringList(parsed?.keyTakeaways, 10),
      actionItems: normalizeActionItems(parsed?.actionItems),
      goalInsights: normalizeGoalInsights(parsed?.goalInsights),
      generatedAt: new Date().toISOString(),
      usage,
    };

    const updatedMeeting = await updateMeetingWithFallback(
      databases,
      meetingId,
      buildIntelligenceUpdatePayload(report, transcriptSource)
    );

    await upsertMeetingIntelligenceReport(databases, updatedMeeting, {
      transcriptText: report.transcriptText,
      transcriptSource,
      summary: report.summary,
      keyTakeaways: report.keyTakeaways,
      actionItems: report.actionItems,
      goalInsights: report.goalInsights,
      generatedAt: report.generatedAt,
    });

    return Response.json({
      data: {
        meeting: updatedMeeting,
        report: {
          transcriptText: report.transcriptText,
          summary: report.summary,
          keyTakeaways: report.keyTakeaways,
          actionItems: report.actionItems,
          goalInsights: report.goalInsights,
          generatedAt: report.generatedAt,
        },
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

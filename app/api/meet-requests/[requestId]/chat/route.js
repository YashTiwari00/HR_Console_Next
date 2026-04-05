import { appwriteConfig } from "@/lib/appwrite";
import { databaseId } from "@/lib/appwriteServer";
import { assertAndTrackAiUsage } from "@/app/api/ai/_lib/aiUsage";
import { callOpenRouter } from "@/lib/openrouter";
import {
  assertMeetingParticipant,
  parseLinkedGoalIds,
} from "@/lib/meetingIntelligence";
import { fetchMeetingIntelligenceReport } from "@/lib/meetingIntelligenceStore";
import { getMeetingWithMetadata } from "@/lib/meetingMetadataStore";
import { errorResponse, requireAuth } from "@/lib/serverAuth";

function safeParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
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

    const intelligence = await fetchMeetingIntelligenceReport(databases, meeting);
    const report = intelligence.report;
    if (!report?.transcriptText) {
      return Response.json(
        { error: "Transcript is required before asking AI questions." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const question = String(body?.question || "").trim();
    if (!question) {
      return Response.json({ error: "question is required." }, { status: 400 });
    }

    const cycleId = String(parseLinkedGoalIds(meeting)?.[0] || `meeting:${meetingId}`).trim();
    await assertAndTrackAiUsage({
      databases,
      userId: profile.$id,
      cycleId,
      featureType: "meeting_qa",
    });

    const raw = await callOpenRouter({
      jsonMode: true,
      maxTokens: 450,
      messages: [
        {
          role: "system",
          content:
            "You are a meeting Q&A assistant. Answer ONLY from the provided transcript and structured summary context. If uncertain, say so explicitly. Return valid JSON only.",
        },
        {
          role: "user",
          content: `Meeting context:\nSummary: ${report.summary || "n/a"}\nKey takeaways: ${JSON.stringify(
            report.keyTakeaways || []
          )}\nAction items: ${JSON.stringify(report.actionItems || [])}\nGoal insights: ${JSON.stringify(
            report.goalInsights || []
          )}\n\nTranscript:\n${report.transcriptText}\n\nQuestion: ${question}\n\nReturn JSON with schema: {"answer":"...","citations":["short quote or anchor from transcript"]}`,
        },
      ],
    });

    const parsed = safeParse(raw, {});
    const citations = Array.isArray(parsed?.citations)
      ? parsed.citations.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 6)
      : [];

    return Response.json({
      data: {
        answer: String(parsed?.answer || "").trim() || "I could not find enough evidence in this transcript.",
        citations,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

import { appwriteConfig } from "@/lib/appwrite";
import { databaseId } from "@/lib/appwriteServer";
import {
  assertMeetingParticipant,
  parseLinkedGoalIds,
} from "@/lib/meetingIntelligence";
import { fetchMeetingIntelligenceReport } from "@/lib/meetingIntelligenceStore";
import { getMeetingWithMetadata } from "@/lib/meetingMetadataStore";
import { errorResponse, requireAuth } from "@/lib/serverAuth";

function buildReportText(meeting, report) {
  const lines = [];
  const linkedGoalIds = parseLinkedGoalIds(meeting);

  lines.push("Goal-Linked Meeting Report");
  lines.push("==========================");
  lines.push(`Meeting ID: ${String(meeting?.$id || "")}`);
  lines.push(`Title: ${String(meeting?.title || "Untitled Meeting")}`);
  lines.push(`Status: ${String(meeting?.status || "unknown")}`);
  lines.push(`Meeting Type: ${String(meeting?.meetingType || "individual")}`);
  lines.push(`Scheduled Start: ${String(meeting?.scheduledStartTime || meeting?.startTime || "")}`);
  lines.push(`Scheduled End: ${String(meeting?.scheduledEndTime || meeting?.endTime || "")}`);
  lines.push(`Generated At: ${String(report?.generatedAt || new Date().toISOString())}`);
  lines.push(`Linked Goals: ${linkedGoalIds.length ? linkedGoalIds.join(", ") : "none"}`);
  lines.push("");

  lines.push("Summary");
  lines.push("-------");
  lines.push(String(report?.summary || "No summary available."));
  lines.push("");

  lines.push("Key Takeaways");
  lines.push("-------------");
  if (report?.keyTakeaways?.length) {
    for (const item of report.keyTakeaways) {
      lines.push(`- ${item}`);
    }
  } else {
    lines.push("- No key takeaways captured.");
  }
  lines.push("");

  lines.push("Action Items");
  lines.push("------------");
  if (report?.actionItems?.length) {
    for (const item of report.actionItems) {
      const due = item?.dueDate ? ` (Due: ${item.dueDate})` : "";
      lines.push(`- ${item.owner}: ${item.action}${due}`);
    }
  } else {
    lines.push("- No action items captured.");
  }
  lines.push("");

  lines.push("Goal Insights");
  lines.push("-------------");
  if (report?.goalInsights?.length) {
    for (const item of report.goalInsights) {
      lines.push(`- [${item.goalId}] ${item.insight} (${item.impact || "neutral"})`);
    }
  } else {
    lines.push("- No goal insights captured.");
  }
  lines.push("");

  lines.push("Transcript");
  lines.push("----------");
  lines.push(String(report?.transcriptText || "No transcript captured."));
  lines.push("");

  return lines.join("\n");
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
    const report = intelligence.report;
    if (!report) {
      return Response.json(
        { error: "Meeting intelligence report is not available yet." },
        { status: 400 }
      );
    }

    const reportText = buildReportText(meeting, report);
    const filename = `meeting-report-${meetingId}.txt`;

    return new Response(reportText, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"${filename}\"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

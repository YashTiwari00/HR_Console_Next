import { ID, Query, databaseId } from "@/lib/appwriteServer";
import { appwriteConfig } from "@/lib/appwrite";
import { parseActionItems, parseGoalInsights, parseMeetingIntelligenceReport, parseStringList } from "@/lib/meetingIntelligence";

function parseKeyTakeaways(rawValue) {
  return parseStringList(rawValue);
}

function toStoredJson(value) {
  return JSON.stringify(value || []);
}

function isSchemaOrCollectionError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("could not be found") ||
    message.includes("not found") ||
    message.includes("attribute not found in schema") ||
    message.includes("unknown attribute")
  );
}

function normalizeStoredReport(document) {
  if (!document) return null;

  const transcriptText = String(document?.transcriptText || "").trim();
  const summary = String(document?.summary || "").trim();

  if (!transcriptText && !summary) {
    return null;
  }

  return {
    transcriptText,
    summary,
    keyTakeaways: parseKeyTakeaways(document?.keyTakeaways),
    actionItems: parseActionItems(document?.actionItems),
    goalInsights: parseGoalInsights(document?.goalInsights),
    generatedAt: String(document?.generatedAt || document?.$updatedAt || "").trim(),
    transcriptSource: String(document?.transcriptSource || "").trim() || "manual",
  };
}

function parseDetailsSummary(rawValue) {
  const text = String(rawValue || "").trim();
  if (!text) {
    return {
      summary: "",
      keyTakeaways: [],
      actionItems: [],
      goalInsights: [],
    };
  }

  try {
    const parsed = JSON.parse(text);
    return {
      summary: String(parsed?.summary || "").trim(),
      keyTakeaways: parseKeyTakeaways(parsed?.keyTakeaways),
      actionItems: parseActionItems(parsed?.actionItems),
      goalInsights: parseGoalInsights(parsed?.goalInsights),
    };
  } catch {
    return {
      summary: text,
      keyTakeaways: [],
      actionItems: [],
      goalInsights: [],
    };
  }
}

async function findIntelligenceDocument(databases, meetingId) {
  const result = await databases.listDocuments(
    databaseId,
    appwriteConfig.meetingIntelligenceCollectionId,
    [Query.equal("meetingId", meetingId), Query.orderDesc("generatedAt"), Query.limit(1)]
  );

  return result.documents?.[0] || null;
}

async function findIntelligenceDetailsDocument(databases, meetingId) {
  const result = await databases.listDocuments(
    databaseId,
    appwriteConfig.meetingIntelligenceDetailsCollectionId,
    [Query.equal("meetingId", meetingId), Query.orderDesc("generatedAt"), Query.limit(1)]
  );

  return result.documents?.[0] || null;
}

export async function fetchMeetingIntelligenceReport(databases, meeting) {
  const meetingId = String(meeting?.$id || "").trim();

  if (!meetingId) {
    return { report: null, source: "none" };
  }

  try {
    const [document, details] = await Promise.all([
      findIntelligenceDocument(databases, meetingId),
      findIntelligenceDetailsDocument(databases, meetingId),
    ]);

    const detailsPayload = parseDetailsSummary(details?.summary);
    const merged = {
      ...(document || {}),
      summary: detailsPayload.summary,
      keyTakeaways: toStoredJson(detailsPayload.keyTakeaways),
      actionItems: toStoredJson(detailsPayload.actionItems),
      goalInsights: toStoredJson(detailsPayload.goalInsights),
      generatedAt: details?.generatedAt || document?.generatedAt,
      $updatedAt: details?.$updatedAt || document?.$updatedAt,
    };

    const storedReport = normalizeStoredReport(merged);

    if (storedReport) {
      return { report: storedReport, source: "collection", document };
    }
  } catch (error) {
    if (!isSchemaOrCollectionError(error)) {
      throw error;
    }
  }

  return {
    report: parseMeetingIntelligenceReport(meeting),
    source: "meeting",
    document: null,
  };
}

export async function upsertMeetingIntelligenceReport(databases, meeting, reportInput) {
  const meetingId = String(meeting?.$id || "").trim();
  if (!meetingId) {
    return { saved: false, reason: "missing_meeting_id" };
  }

  const generatedAt = String(reportInput?.generatedAt || new Date().toISOString()).trim();
  const linkedGoalIds = parseStringList(meeting?.linkedGoalIds);
  const payload = {
    meetingId,
    employeeId: String(meeting?.employeeId || "").trim(),
    managerId: String(meeting?.managerId || "").trim(),
    linkedGoalIds: toStoredJson(linkedGoalIds),
    transcriptText: String(reportInput?.transcriptText || "").trim(),
    transcriptSource: String(reportInput?.transcriptSource || "manual").trim() || "manual",
    generatedAt,
  };

  const detailsPayload = {
    meetingId,
    summary: JSON.stringify({
      summary: String(reportInput?.summary || "").trim(),
      keyTakeaways: reportInput?.keyTakeaways || [],
      actionItems: reportInput?.actionItems || [],
      goalInsights: reportInput?.goalInsights || [],
    }),
    generatedAt,
  };

  try {
    const [existing, existingDetails] = await Promise.all([
      findIntelligenceDocument(databases, meetingId),
      findIntelligenceDetailsDocument(databases, meetingId),
    ]);

    let document;
    if (existing?.$id) {
      document = await databases.updateDocument(
        databaseId,
        appwriteConfig.meetingIntelligenceCollectionId,
        existing.$id,
        payload
      );
    } else {
      document = await databases.createDocument(
        databaseId,
        appwriteConfig.meetingIntelligenceCollectionId,
        ID.unique(),
        payload
      );
    }

    let detailsDocument;
    if (existingDetails?.$id) {
      detailsDocument = await databases.updateDocument(
        databaseId,
        appwriteConfig.meetingIntelligenceDetailsCollectionId,
        existingDetails.$id,
        detailsPayload
      );
    } else {
      detailsDocument = await databases.createDocument(
        databaseId,
        appwriteConfig.meetingIntelligenceDetailsCollectionId,
        ID.unique(),
        detailsPayload
      );
    }

    return { saved: true, document, detailsDocument };
  } catch (error) {
    if (isSchemaOrCollectionError(error)) {
      return { saved: false, reason: "schema_or_collection_error", error: String(error?.message || error) };
    }

    throw error;
  }
}

export async function listMeetingIntelligenceMap(databases, meetingIds) {
  const uniqueIds = Array.from(
    new Set((meetingIds || []).map((item) => String(item || "").trim()).filter(Boolean))
  );

  const map = new Map();
  if (uniqueIds.length === 0) return map;

  try {
    const detailsByMeetingId = new Map();

    for (let i = 0; i < uniqueIds.length; i += 100) {
      const chunk = uniqueIds.slice(i, i + 100);
      const result = await databases.listDocuments(
        databaseId,
        appwriteConfig.meetingIntelligenceDetailsCollectionId,
        [Query.equal("meetingId", chunk), Query.orderDesc("generatedAt"), Query.limit(100)]
      );

      for (const document of result.documents || []) {
        const meetingId = String(document?.meetingId || "").trim();
        if (!meetingId || detailsByMeetingId.has(meetingId)) continue;
        detailsByMeetingId.set(meetingId, document);
      }
    }

    for (let i = 0; i < uniqueIds.length; i += 100) {
      const chunk = uniqueIds.slice(i, i + 100);
      const result = await databases.listDocuments(
        databaseId,
        appwriteConfig.meetingIntelligenceCollectionId,
        [Query.equal("meetingId", chunk), Query.orderDesc("generatedAt"), Query.limit(100)]
      );

      for (const document of result.documents || []) {
        const meetingId = String(document?.meetingId || "").trim();
        if (!meetingId || map.has(meetingId)) continue;
        const details = detailsByMeetingId.get(meetingId);
        const detailsPayload = parseDetailsSummary(details?.summary);
        const merged = {
          ...document,
          summary: detailsPayload.summary,
          keyTakeaways: toStoredJson(detailsPayload.keyTakeaways),
          actionItems: toStoredJson(detailsPayload.actionItems),
          goalInsights: toStoredJson(detailsPayload.goalInsights),
          generatedAt: details?.generatedAt || document?.generatedAt,
        };
        const report = normalizeStoredReport(merged);
        if (report) {
          map.set(meetingId, report);
        }
      }
    }
  } catch (error) {
    if (!isSchemaOrCollectionError(error)) {
      throw error;
    }
  }

  return map;
}

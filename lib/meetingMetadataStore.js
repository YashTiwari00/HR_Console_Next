import { ID, Query, databaseId } from "@/lib/appwriteServer";
import { appwriteConfig } from "@/lib/appwrite";
import { parseStringList } from "@/lib/meetingIntelligence";

function isSchemaOrCollectionError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("could not be found") ||
    message.includes("not found") ||
    message.includes("attribute not found in schema") ||
    message.includes("unknown attribute")
  );
}

function normalizeList(value, maxItems = 40) {
  return Array.from(
    new Set(
      parseStringList(value)
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  ).slice(0, maxItems);
}

function parseMetadataBlob(rawValue) {
  const text = String(rawValue || "").trim();
  if (!text) {
    return {
      linkedGoalIds: [],
      participantIds: [],
      participantEmails: [],
    };
  }

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return {
        linkedGoalIds: normalizeList(parsed, 30),
        participantIds: [],
        participantEmails: [],
      };
    }

    return {
      linkedGoalIds: normalizeList(parsed?.linkedGoalIds, 30),
      participantIds: normalizeList(parsed?.participantIds, 40),
      participantEmails: normalizeList(parsed?.participantEmails, 50),
    };
  } catch {
    return {
      linkedGoalIds: normalizeList(text, 30),
      participantIds: [],
      participantEmails: [],
    };
  }
}

async function findMetadataDocument(databases, meetingId) {
  const result = await databases.listDocuments(
    databaseId,
    appwriteConfig.meetingMetadataCollectionId,
    [Query.equal("meetingId", meetingId), Query.limit(1)]
  );
  return result.documents?.[0] || null;
}

function applyMetadata(meeting, metadata) {
  if (!meeting) return meeting;

  const blob = parseMetadataBlob(metadata?.linkedGoalIds);

  const linkedGoalIds = normalizeList(
    blob.linkedGoalIds.length > 0 ? blob.linkedGoalIds : meeting?.linkedGoalIds,
    30
  );
  const participantIds = normalizeList(
    blob.participantIds.length > 0 ? blob.participantIds : meeting?.participantIds,
    40
  );
  const participantEmails = normalizeList(
    blob.participantEmails.length > 0 ? blob.participantEmails : meeting?.participantEmails,
    50
  );

  return {
    ...meeting,
    linkedGoalIds,
    participantIds,
    participantEmails,
  };
}

export async function getMeetingWithMetadata(databases, meeting) {
  const meetingId = String(meeting?.$id || "").trim();
  if (!meetingId) return meeting;

  try {
    const metadata = await findMetadataDocument(databases, meetingId);
    return applyMetadata(meeting, metadata);
  } catch (error) {
    if (!isSchemaOrCollectionError(error)) {
      throw error;
    }
    return applyMetadata(meeting, null);
  }
}

export async function listMeetingMetadataMap(databases, meetingIds) {
  const uniqueIds = Array.from(
    new Set((meetingIds || []).map((item) => String(item || "").trim()).filter(Boolean))
  );
  const map = new Map();
  if (uniqueIds.length === 0) return map;

  try {
    for (let i = 0; i < uniqueIds.length; i += 100) {
      const chunk = uniqueIds.slice(i, i + 100);
      const result = await databases.listDocuments(
        databaseId,
        appwriteConfig.meetingMetadataCollectionId,
        [Query.equal("meetingId", chunk), Query.limit(100)]
      );

      for (const document of result.documents || []) {
        const meetingId = String(document?.meetingId || "").trim();
        if (!meetingId || map.has(meetingId)) continue;
        map.set(meetingId, document);
      }
    }
  } catch (error) {
    if (!isSchemaOrCollectionError(error)) {
      throw error;
    }
  }

  return map;
}

export function applyMeetingMetadataMap(meetings, metadataMap) {
  return (meetings || []).map((meeting) => {
    const meetingId = String(meeting?.$id || "").trim();
    const metadata = metadataMap?.get(meetingId) || null;
    return applyMetadata(meeting, metadata);
  });
}

export async function upsertMeetingMetadata(databases, meetingId, input) {
  const normalizedMeetingId = String(meetingId || "").trim();
  if (!normalizedMeetingId) {
    return { saved: false, reason: "missing_meeting_id" };
  }

  const payload = {
    meetingId: normalizedMeetingId,
    linkedGoalIds: JSON.stringify({
      linkedGoalIds: normalizeList(input?.linkedGoalIds, 30),
      participantIds: normalizeList(input?.participantIds, 40),
      participantEmails: normalizeList(input?.participantEmails, 50),
    }),
  };

  try {
    const existing = await findMetadataDocument(databases, normalizedMeetingId);
    if (existing?.$id) {
      const document = await databases.updateDocument(
        databaseId,
        appwriteConfig.meetingMetadataCollectionId,
        existing.$id,
        payload
      );
      return { saved: true, document };
    }

    const document = await databases.createDocument(
      databaseId,
      appwriteConfig.meetingMetadataCollectionId,
      ID.unique(),
      payload
    );
    return { saved: true, document };
  } catch (error) {
    if (isSchemaOrCollectionError(error)) {
      return { saved: false, reason: "schema_or_collection_error", error: String(error?.message || error) };
    }
    throw error;
  }
}

import { appwriteConfig } from "@/lib/appwrite";
import { MEET_REQUEST_SOURCES, MEET_REQUEST_STATUSES } from "@/lib/appwriteSchema";
import {
  createMeetCalendarEvent,
  getOrgDefaultTimezone,
} from "@/lib/googleCalendar";
import { ID, Query, databaseId } from "@/lib/appwriteServer";
import { parseStringList, toMeetingType } from "@/lib/meetingIntelligence";
import { upsertMeetingMetadata } from "@/lib/meetingMetadataStore";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertManagerCanAccessEmployee, listUsersByIds } from "@/lib/teamAccess";

function isValidRange(startTime, endTime) {
  const start = new Date(startTime).valueOf();
  const end = new Date(endTime).valueOf();

  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  if (end <= start) return false;

  return true;
}

async function createMeetingDocument(databases, payload) {
  let nextPayload = { ...payload };

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await databases.createDocument(
        databaseId,
        appwriteConfig.googleMeetRequestsCollectionId,
        ID.unique(),
        nextPayload
      );
    } catch (error) {
      const message = String(error?.message || "").toLowerCase();

      if (
        (message.includes("attribute not found in schema: managernotes") ||
          message.includes('unknown attribute: "managernotes"')) &&
        "managerNotes" in nextPayload
      ) {
        const fallbackPayload = { ...nextPayload };
        delete fallbackPayload.managerNotes;
        nextPayload = fallbackPayload;
        continue;
      }

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

      const fallbackPayload = { ...nextPayload };
      delete fallbackPayload[missingAttr];
      nextPayload = fallbackPayload;
    }
  }

  try {
    return await databases.createDocument(
      databaseId,
      appwriteConfig.googleMeetRequestsCollectionId,
      ID.unique(),
      nextPayload
    );
  } catch (error) {
    const message = String(error?.message || "").toLowerCase();
    if (
      !message.includes("attribute not found in schema: managernotes") &&
      !message.includes('unknown attribute: "managernotes"')
    ) {
      throw error;
    }

    const fallbackPayload = { ...nextPayload };
    delete fallbackPayload.managerNotes;
    return databases.createDocument(
      databaseId,
      appwriteConfig.googleMeetRequestsCollectionId,
      ID.unique(),
      fallbackPayload
    );
  }
}

function normalizeIdList(input, maxItems = 25) {
  return Array.from(
    new Set(
      (Array.isArray(input) ? input : parseStringList(input))
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  ).slice(0, maxItems);
}

async function assertManagerGoalAccess(databases, managerId, employeeId, goalIds) {
  if (!goalIds.length) return null;

  const goals = await databases.listDocuments(
    databaseId,
    appwriteConfig.goalsCollectionId,
    [
      Query.equal("employeeId", employeeId),
      Query.equal("managerId", managerId),
      Query.equal("$id", goalIds),
      Query.limit(Math.max(50, goalIds.length + 5)),
    ]
  );

  const allowed = new Set(goals.documents.map((item) => String(item.$id || "").trim()));
  const invalid = goalIds.filter((id) => !allowed.has(id));
  if (invalid.length > 0) {
    return Response.json(
      { error: "Some selected goals are not accessible for this manager/employee context.", invalidGoalIds: invalid },
      { status: 400 }
    );
  }

  return null;
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["manager"]);

    const body = await request.json();
    const employeeId = String(body?.employeeId || "").trim();
    const startTime = String(body?.startTime || "").trim();
    const endTime = String(body?.endTime || "").trim();
    const title = String(body?.title || "1:1 Meeting").trim() || "1:1 Meeting";
    const description = String(body?.description || "").trim();
    const managerNotes = String(body?.managerNotes || "").trim();
    const timeZone = String(body?.timeZone || getOrgDefaultTimezone()).trim();
    const linkedGoalIds = normalizeIdList(body?.linkedGoalIds, 20);
    const meetingType = toMeetingType(body?.meetingType);
    const requestedParticipantIds = normalizeIdList(body?.participantIds, 30);

    if (!employeeId || !startTime || !endTime) {
      return Response.json(
        { error: "employeeId, startTime, and endTime are required." },
        { status: 400 }
      );
    }

    if (!isValidRange(startTime, endTime)) {
      return Response.json(
        { error: "Invalid schedule range. Ensure startTime/endTime are valid ISO values and endTime is after startTime." },
        { status: 400 }
      );
    }

    await assertManagerCanAccessEmployee(databases, profile.$id, employeeId);

    const goalAccessError = await assertManagerGoalAccess(
      databases,
      profile.$id,
      employeeId,
      linkedGoalIds
    );
    if (goalAccessError) {
      return goalAccessError;
    }

    const participantIds = Array.from(
      new Set([profile.$id, employeeId, ...requestedParticipantIds])
    ).slice(0, 30);

    const users = await listUsersByIds(databases, participantIds);
    const manager = users.find((item) => item.$id === profile.$id);
    const employee = users.find((item) => item.$id === employeeId);

    if (!employee?.email) {
      return Response.json({ error: "Employee profile email is missing." }, { status: 400 });
    }

    if (!manager?.email) {
      return Response.json({ error: "Manager profile email is missing." }, { status: 400 });
    }

    const attendeeEmails = users
      .map((item) => String(item?.email || "").trim())
      .filter(Boolean);
    const attendees = Array.from(new Set([employee.email, manager.email, ...attendeeEmails]));

    const event = await createMeetCalendarEvent(databases, profile.$id, {
      title,
      description,
      startTime,
      endTime,
      timeZone,
      attendees,
    });

    const now = new Date().toISOString();
    const normalizedStartTime = new Date(startTime).toISOString();
    const normalizedEndTime = new Date(endTime).toISOString();

    const meeting = await createMeetingDocument(databases, {
      employeeId,
      managerId: profile.$id,
      status: MEET_REQUEST_STATUSES.SCHEDULED,
      source: MEET_REQUEST_SOURCES.MANAGER_DIRECT,
      requestedAt: now,
      // Compatibility fields used by newer schemas.
      startTime: normalizedStartTime,
      endTime: normalizedEndTime,
      scheduledStartTime: normalizedStartTime,
      scheduledEndTime: normalizedEndTime,
      title,
      description,
      managerNotes,
      meetLink: event.meetLink,
      eventId: event.eventId,
      timezone: timeZone,
      meetingType,
      linkedGoalIds: JSON.stringify(linkedGoalIds),
      participantIds: JSON.stringify(participantIds),
      participantEmails: JSON.stringify(attendees),
    });

    await upsertMeetingMetadata(databases, meeting.$id, {
      linkedGoalIds,
      participantIds,
      participantEmails: attendees,
    });

    const withMetadata = {
      ...meeting,
      linkedGoalIds,
      participantIds,
      participantEmails: attendees,
    };

    return Response.json({
      data: {
        meeting: withMetadata,
        event,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

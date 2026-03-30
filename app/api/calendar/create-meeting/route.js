import { appwriteConfig } from "@/lib/appwrite";
import { MEET_REQUEST_SOURCES, MEET_REQUEST_STATUSES } from "@/lib/appwriteSchema";
import {
  createMeetCalendarEvent,
  getOrgDefaultTimezone,
} from "@/lib/googleCalendar";
import { ID, databaseId } from "@/lib/appwriteServer";
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
        const { managerNotes, ...fallbackPayload } = nextPayload;
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

      const { [missingAttr]: _ignored, ...fallbackPayload } = nextPayload;
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

    const { managerNotes, ...fallbackPayload } = nextPayload;
    return databases.createDocument(
      databaseId,
      appwriteConfig.googleMeetRequestsCollectionId,
      ID.unique(),
      fallbackPayload
    );
  }
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

    const users = await listUsersByIds(databases, [profile.$id, employeeId]);
    const manager = users.find((item) => item.$id === profile.$id);
    const employee = users.find((item) => item.$id === employeeId);

    if (!employee?.email) {
      return Response.json({ error: "Employee profile email is missing." }, { status: 400 });
    }

    if (!manager?.email) {
      return Response.json({ error: "Manager profile email is missing." }, { status: 400 });
    }

    const attendees = [employee.email, manager.email];

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
    });

    return Response.json({
      data: {
        meeting,
        event,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

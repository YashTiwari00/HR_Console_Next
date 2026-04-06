import { appwriteConfig } from "@/lib/appwrite";
import { MEET_REQUEST_STATUSES } from "@/lib/appwriteSchema";
import {
  createMeetCalendarEvent,
  getOrgDefaultTimezone,
} from "@/lib/googleCalendar";
import { Query, databaseId } from "@/lib/appwriteServer";
import { parseStringList, toMeetingType } from "@/lib/meetingIntelligence";
import { getMeetingWithMetadata, upsertMeetingMetadata } from "@/lib/meetingMetadataStore";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { listUsersByIds } from "@/lib/teamAccess";
import { sendInAppAndQueueEmail } from "@/app/api/notifications/_lib/workflows";

function isValidRange(startTime, endTime) {
  const start = new Date(startTime).valueOf();
  const end = new Date(endTime).valueOf();

  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  if (end <= start) return false;

  return true;
}

async function updateMeetingRequestWithFallback(databases, requestId, payload) {
  let nextPayload = { ...payload };

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await databases.updateDocument(
        databaseId,
        appwriteConfig.googleMeetRequestsCollectionId,
        requestId,
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
    return await databases.updateDocument(
      databaseId,
      appwriteConfig.googleMeetRequestsCollectionId,
      requestId,
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
    return databases.updateDocument(
      databaseId,
      appwriteConfig.googleMeetRequestsCollectionId,
      requestId,
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

async function assertGoalAccess(databases, managerId, employeeId, goalIds) {
  if (!goalIds.length) return null;

  const result = await databases.listDocuments(
    databaseId,
    appwriteConfig.goalsCollectionId,
    [
      Query.equal("employeeId", employeeId),
      Query.equal("managerId", managerId),
      Query.equal("$id", goalIds),
      Query.limit(Math.max(50, goalIds.length + 5)),
    ]
  );

  const allowed = new Set(result.documents.map((item) => String(item.$id || "").trim()));
  const invalid = goalIds.filter((id) => !allowed.has(id));
  if (invalid.length > 0) {
    return Response.json(
      { error: "Some selected goals are not accessible for this manager/employee context.", invalidGoalIds: invalid },
      { status: 400 }
    );
  }

  return null;
}

export async function PATCH(request, context) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["manager"]);

    const params = await context.params;
    const requestId = String(params?.requestId || "").trim();

    if (!requestId) {
      return Response.json({ error: "requestId is required." }, { status: 400 });
    }

    const existingRaw = await databases.getDocument(
      databaseId,
      appwriteConfig.googleMeetRequestsCollectionId,
      requestId
    );
    const existing = await getMeetingWithMetadata(databases, existingRaw);

    if (String(existing.managerId || "") !== String(profile.$id || "")) {
      return Response.json({ error: "Forbidden for this meeting request." }, { status: 403 });
    }

    const body = await request.json();
    const action = String(body?.action || "").trim().toLowerCase();

    if (!["schedule", "reject"].includes(action)) {
      return Response.json({ error: "action must be schedule or reject." }, { status: 400 });
    }

    if (action === "reject") {
      const rejected = await updateMeetingRequestWithFallback(databases, requestId, {
        status: MEET_REQUEST_STATUSES.REJECTED,
        managerNotes: String(body?.managerNotes || "").trim(),
      });

      return Response.json({ data: await getMeetingWithMetadata(databases, rejected) });
    }

    const startTime = String(body?.startTime || existing?.proposedStartTime || "").trim();
    const endTime = String(body?.endTime || existing?.proposedEndTime || "").trim();
    const title = String(body?.title || existing?.title || "1:1 Meeting").trim() || "1:1 Meeting";
    const description = String(body?.description || existing?.description || "").trim();
    const managerNotes = String(body?.managerNotes || "").trim();
    const timeZone = String(body?.timeZone || existing?.timezone || getOrgDefaultTimezone()).trim();
    const linkedGoalIds = normalizeIdList(body?.linkedGoalIds || existing?.linkedGoalIds, 20);
    const meetingType = toMeetingType(body?.meetingType || existing?.meetingType);
    const participantIds = normalizeIdList(
      body?.participantIds || existing?.participantIds,
      30
    );

    if (!startTime || !endTime) {
      return Response.json(
        { error: "startTime and endTime are required to schedule a meeting." },
        { status: 400 }
      );
    }

    if (!isValidRange(startTime, endTime)) {
      return Response.json(
        { error: "Invalid schedule range. Ensure startTime/endTime are valid ISO values and endTime is after startTime." },
        { status: 400 }
      );
    }

    const goalAccessError = await assertGoalAccess(
      databases,
      profile.$id,
      existing.employeeId,
      linkedGoalIds
    );
    if (goalAccessError) {
      return goalAccessError;
    }

    const allParticipantIds = Array.from(
      new Set([profile.$id, existing.employeeId, ...participantIds])
    ).slice(0, 30);

    const users = await listUsersByIds(databases, allParticipantIds);
    const manager = users.find((item) => item.$id === profile.$id);
    const employee = users.find((item) => item.$id === existing.employeeId);

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

    const normalizedStartTime = new Date(startTime).toISOString();
    const normalizedEndTime = new Date(endTime).toISOString();

    const scheduled = await updateMeetingRequestWithFallback(databases, requestId, {
      status: MEET_REQUEST_STATUSES.SCHEDULED,
      // Compatibility fields used by newer schemas.
      startTime: normalizedStartTime,
      endTime: normalizedEndTime,
      scheduledStartTime: normalizedStartTime,
      scheduledEndTime: normalizedEndTime,
      title,
      description,
      managerNotes,
      timezone: timeZone,
      meetLink: event.meetLink,
      eventId: event.eventId,
      meetingType,
      linkedGoalIds: JSON.stringify(linkedGoalIds),
      participantIds: JSON.stringify(allParticipantIds),
      participantEmails: JSON.stringify(attendees),
    });

    await upsertMeetingMetadata(databases, requestId, {
      linkedGoalIds,
      participantIds: allParticipantIds,
      participantEmails: attendees,
    });

    const withMetadata = {
      ...scheduled,
      linkedGoalIds,
      participantIds: allParticipantIds,
      participantEmails: attendees,
    };

    const notifyAt = new Date().toISOString().slice(0, 10);
    await Promise.allSettled([
      sendInAppAndQueueEmail(databases, {
        userId: String(existing.employeeId || "").trim(),
        triggerType: "meeting_scheduled",
        title: "Meeting scheduled",
        message: `${title} has been scheduled for ${new Date(normalizedStartTime).toLocaleString()}.`,
        actionUrl: "/employee/meetings",
        dedupeKey: `meeting-scheduled-employee-${requestId}-${notifyAt}`,
        metadata: {
          requestId,
          eventId: event.eventId,
          role: "employee",
        },
      }),
      sendInAppAndQueueEmail(databases, {
        userId: String(profile.$id || "").trim(),
        triggerType: "meeting_scheduled",
        title: "Meeting scheduled",
        message: `${title} has been successfully scheduled.`,
        actionUrl: "/manager/meeting-calendar",
        dedupeKey: `meeting-scheduled-manager-${requestId}-${notifyAt}`,
        metadata: {
          requestId,
          eventId: event.eventId,
          role: "manager",
        },
      }),
    ]);

    return Response.json({ data: { meetingRequest: withMetadata, event } });
  } catch (error) {
    return errorResponse(error);
  }
}

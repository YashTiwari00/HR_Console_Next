import { appwriteConfig } from "@/lib/appwrite";
import { MEET_REQUEST_SOURCES, MEET_REQUEST_STATUSES } from "@/lib/appwriteSchema";
import { getGoogleTokenStatus, getOrgDefaultTimezone } from "@/lib/googleCalendar";
import { ID, Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { parseStringList, toMeetingType } from "@/lib/meetingIntelligence";
import {
  applyMeetingMetadataMap,
  listMeetingMetadataMap,
  upsertMeetingMetadata,
} from "@/lib/meetingMetadataStore";
import { assertManagerCanAccessEmployee, listUsersByIds } from "@/lib/teamAccess";

async function createMeetingRequestWithFallback(databases, payload) {
  let nextPayload = { ...payload };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await databases.createDocument(
        databaseId,
        appwriteConfig.googleMeetRequestsCollectionId,
        ID.unique(),
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

      const rest = { ...nextPayload };
      delete rest[missingAttr];
      nextPayload = rest;
    }
  }

  return databases.createDocument(
    databaseId,
    appwriteConfig.googleMeetRequestsCollectionId,
    ID.unique(),
    nextPayload
  );
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

async function resolveParticipantEmails(databases, participantIds) {
  if (!participantIds.length) return [];
  const users = await listUsersByIds(databases, participantIds);
  return users
    .map((item) => String(item?.email || "").trim())
    .filter(Boolean);
}

async function assertEmployeeGoalAccess(databases, employeeId, goalIds) {
  if (!goalIds.length) return;

  const result = await databases.listDocuments(
    databaseId,
    appwriteConfig.goalsCollectionId,
    [
      Query.equal("employeeId", employeeId),
      Query.equal("$id", goalIds),
      Query.limit(Math.max(50, goalIds.length + 5)),
    ]
  );

  const accessible = new Set(result.documents.map((item) => String(item.$id || "").trim()));
  const invalid = goalIds.filter((goalId) => !accessible.has(goalId));
  if (invalid.length > 0) {
    return Response.json(
      { error: "Some selected goals are not accessible for this employee.", invalidGoalIds: invalid },
      { status: 400 }
    );
  }

  return null;
}

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager"]);

    const { searchParams } = new URL(request.url);
    const employeeIdFilter = String(searchParams.get("employeeId") || "").trim();

    const buildQueries = (sortField) => {
      let queries = [Query.orderDesc(sortField), Query.limit(200)];

      if (profile.role === "employee") {
        queries = [
          Query.equal("employeeId", profile.$id),
          Query.orderDesc(sortField),
          Query.limit(200),
        ];
      }

      if (profile.role === "manager") {
        queries = [
          Query.equal("managerId", profile.$id),
          Query.orderDesc(sortField),
          Query.limit(200),
        ];

        if (employeeIdFilter) {
          queries.unshift(Query.equal("employeeId", employeeIdFilter));
        }
      }

      return queries;
    };

    if (profile.role === "manager" && employeeIdFilter) {
      await assertManagerCanAccessEmployee(databases, profile.$id, employeeIdFilter);
    }

    let response;
    try {
      response = await databases.listDocuments(
        databaseId,
        appwriteConfig.googleMeetRequestsCollectionId,
        buildQueries("requestedAt")
      );
    } catch (listError) {
      const message = String(listError?.message || "").toLowerCase();
      if (!message.includes("attribute not found in schema: requestedat")) {
        throw listError;
      }

      // Backward-compatible fallback for environments where requestedAt has not been added yet.
      response = await databases.listDocuments(
        databaseId,
        appwriteConfig.googleMeetRequestsCollectionId,
        buildQueries("$createdAt")
      );
    }

    const metadataMap = await listMeetingMetadataMap(
      databases,
      response.documents.map((item) => String(item.$id || "").trim())
    );

    return Response.json({ data: applyMeetingMetadataMap(response.documents, metadataMap) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee"]);

    const body = await request.json();
    const title = String(body?.title || "1:1 Meeting Request").trim() || "1:1 Meeting Request";
    const description = String(body?.description || "").trim();
    const proposedStartTime = String(body?.proposedStartTime || "").trim();
    const proposedEndTime = String(body?.proposedEndTime || "").trim();
    const timeZone = String(body?.timeZone || getOrgDefaultTimezone()).trim();
    const managerId = String(profile?.managerId || "").trim();
    const linkedGoalIds = normalizeIdList(body?.linkedGoalIds, 20);
    const meetingType = toMeetingType(body?.meetingType);
    const extraParticipantIds = normalizeIdList(body?.participantIds, 30);

    if (!proposedStartTime || !proposedEndTime) {
      return Response.json(
        { error: "proposedStartTime and proposedEndTime are required." },
        { status: 400 }
      );
    }

    if (!managerId) {
      return Response.json(
        { error: "No manager is assigned to this employee. Contact HR/admin to assign manager first." },
        { status: 400 }
      );
    }

    const tokenStatus = await getGoogleTokenStatus(databases, profile.$id);
    if (!tokenStatus.connected) {
      return Response.json(
        {
          error: "Google Calendar is not connected for this employee. Please connect Google first.",
          code: "google_not_connected",
        },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    const goalAccessError = await assertEmployeeGoalAccess(databases, profile.$id, linkedGoalIds);
    if (goalAccessError) {
      return goalAccessError;
    }

    const participantIds = Array.from(
      new Set([profile.$id, managerId, ...extraParticipantIds])
    ).slice(0, 30);
    const participantEmails = await resolveParticipantEmails(databases, participantIds);

    const normalizedProposedStart = new Date(proposedStartTime).toISOString();
    const normalizedProposedEnd = new Date(proposedEndTime).toISOString();

    const created = await createMeetingRequestWithFallback(databases, {
      employeeId: profile.$id,
      managerId,
      status: MEET_REQUEST_STATUSES.PENDING,
      source: MEET_REQUEST_SOURCES.EMPLOYEE_REQUEST,
      requestedAt: now,
      // Compatibility fields used by newer schemas.
      startTime: normalizedProposedStart,
      endTime: normalizedProposedEnd,
      proposedStartTime: normalizedProposedStart,
      proposedEndTime: normalizedProposedEnd,
      title,
      description,
      timezone: timeZone,
      meetingType,
      linkedGoalIds: JSON.stringify(linkedGoalIds),
      participantIds: JSON.stringify(participantIds),
      participantEmails: JSON.stringify(participantEmails),
    });

    await upsertMeetingMetadata(databases, created.$id, {
      linkedGoalIds,
      participantIds,
      participantEmails,
    });

    const withMetadata = {
      ...created,
      linkedGoalIds,
      participantIds,
      participantEmails,
    };

    return Response.json({ data: withMetadata });
  } catch (error) {
    return errorResponse(error);
  }
}

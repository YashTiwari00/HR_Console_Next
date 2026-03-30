import { appwriteConfig } from "@/lib/appwrite";
import { MEET_REQUEST_SOURCES, MEET_REQUEST_STATUSES } from "@/lib/appwriteSchema";
import { getGoogleTokenStatus, getOrgDefaultTimezone } from "@/lib/googleCalendar";
import { ID, Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertManagerCanAccessEmployee } from "@/lib/teamAccess";

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

      const { [missingAttr]: _ignored, ...rest } = nextPayload;
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

    return Response.json({ data: response.documents });
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
    });

    return Response.json({ data: created });
  } catch (error) {
    return errorResponse(error);
  }
}

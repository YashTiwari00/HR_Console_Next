import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { getOrgDefaultTimezone, listCalendarEvents } from "@/lib/googleCalendar";
import { assertManagerCanAccessEmployee } from "@/lib/teamAccess";

function isValidRange(startDate, endDate) {
  const start = new Date(startDate).valueOf();
  const end = new Date(endDate).valueOf();

  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  if (end <= start) return false;

  return true;
}

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "hr"]);

    const { searchParams } = new URL(request.url);
    const employeeIdInput = String(searchParams.get("employeeId") || "").trim();
    const startDate = String(searchParams.get("startDate") || "").trim();
    const endDate = String(searchParams.get("endDate") || "").trim();
    const timeZone = String(searchParams.get("timeZone") || getOrgDefaultTimezone()).trim();
    const maxResults = Number(searchParams.get("maxResults") || 100);

    if (!startDate || !endDate) {
      return Response.json(
        { error: "startDate and endDate are required." },
        { status: 400 }
      );
    }

    if (!isValidRange(startDate, endDate)) {
      return Response.json(
        {
          error:
            "Invalid date range. Ensure startDate and endDate are valid ISO values and endDate is after startDate.",
        },
        { status: 400 }
      );
    }

    let targetUserId = profile.$id;

    if (profile.role === "employee") {
      if (employeeIdInput && employeeIdInput !== profile.$id) {
        return Response.json({ error: "Forbidden for requested employee." }, { status: 403 });
      }
      targetUserId = profile.$id;
    } else if (profile.role === "manager") {
      targetUserId = employeeIdInput || profile.$id;
      if (targetUserId !== profile.$id) {
        await assertManagerCanAccessEmployee(databases, profile.$id, targetUserId);
      }
    } else {
      // HR defaults to self if employeeId not provided.
      targetUserId = employeeIdInput || profile.$id;
    }

    const data = await listCalendarEvents(databases, targetUserId, {
      startTime: startDate,
      endTime: endDate,
      timeZone,
      maxResults,
    });

    return Response.json({
      data: {
        targetUserId,
        ...data,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

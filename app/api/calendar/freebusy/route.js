import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { getOrgDefaultTimezone, queryFreeBusy } from "@/lib/googleCalendar";
import { assertManagerCanAccessEmployee } from "@/lib/teamAccess";

function isValidRange(startDate, endDate) {
  const start = new Date(startDate).valueOf();
  const end = new Date(endDate).valueOf();

  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  if (end <= start) return false;

  return true;
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["manager", "hr", "employee"]);

    const body = await request.json();
    const requestedEmployeeId = String(body?.employeeId || "").trim();
    const employeeId =
      profile.role === "employee"
        ? String(profile.$id || "").trim()
        : requestedEmployeeId;
    const startDate = String(body?.startDate || "").trim();
    const endDate = String(body?.endDate || "").trim();
    const timeZone = String(body?.timeZone || getOrgDefaultTimezone()).trim();

    if (!employeeId || !startDate || !endDate) {
      return Response.json(
        { error: "employeeId, startDate, and endDate are required." },
        { status: 400 }
      );
    }

    if (!isValidRange(startDate, endDate)) {
      return Response.json(
        { error: "Invalid date range. Ensure startDate and endDate are valid ISO values and endDate is after startDate." },
        { status: 400 }
      );
    }

    if (profile.role === "manager") {
      await assertManagerCanAccessEmployee(databases, profile.$id, employeeId);
    }

    const freebusy = await queryFreeBusy(databases, employeeId, {
      startTime: startDate,
      endTime: endDate,
      timeZone,
      calendarIds: ["primary"],
    });

    return Response.json({ data: freebusy });
  } catch (error) {
    return errorResponse(error);
  }
}

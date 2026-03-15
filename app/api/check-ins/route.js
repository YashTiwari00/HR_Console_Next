import { appwriteConfig } from "@/lib/appwrite";
import { CHECKIN_STATUSES, GOAL_STATUSES } from "@/lib/appwriteSchema";
import { ID, Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";

const VALID_STATUSES = Object.values(CHECKIN_STATUSES);

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "hr"]);

    const { searchParams } = new URL(request.url);
    const goalId = searchParams.get("goalId");

    const queries = [Query.orderDesc("scheduledAt"), Query.limit(100)];

    if (profile.role === "employee") {
      queries.push(Query.equal("employeeId", profile.$id));
    } else if (profile.role === "manager") {
      queries.push(Query.equal("managerId", profile.$id));
    }

    if (goalId) {
      queries.push(Query.equal("goalId", goalId));
    }

    const result = await databases.listDocuments(
      databaseId,
      appwriteConfig.checkInsCollectionId,
      queries
    );

    return Response.json({ data: result.documents });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager"]);

    const body = await request.json();
    const goalId = (body.goalId || "").trim();
    const employeeId = (body.employeeId || profile.$id).trim();
    const managerId = (body.managerId || profile.managerId || "").trim();
    const scheduledAt = body.scheduledAt;
    const status = (body.status || CHECKIN_STATUSES.PLANNED).trim();
    const employeeNotes = body.employeeNotes || "";
    const managerNotes = body.managerNotes || "";
    const transcriptText = body.transcriptText || "";
    const isFinalCheckIn = Boolean(body.isFinalCheckIn);
    const attachmentIds = Array.isArray(body.attachmentIds) ? body.attachmentIds : [];

    if (!goalId || !employeeId || !managerId || !scheduledAt) {
      return Response.json(
        { error: "goalId, employeeId, managerId and scheduledAt are required." },
        { status: 400 }
      );
    }

    if (!VALID_STATUSES.includes(status)) {
      return Response.json({ error: "Invalid check-in status." }, { status: 400 });
    }

    const goal = await databases.getDocument(
      databaseId,
      appwriteConfig.goalsCollectionId,
      goalId
    );

    if (profile.role === "employee" && goal.employeeId !== profile.$id) {
      return Response.json({ error: "Forbidden for this goal." }, { status: 403 });
    }

    if (profile.role === "manager" && goal.managerId !== profile.$id) {
      return Response.json({ error: "Forbidden for this goal." }, { status: 403 });
    }

    if (goal.status !== GOAL_STATUSES.APPROVED) {
      return Response.json(
        { error: "Check-ins can only be created after goal approval." },
        { status: 400 }
      );
    }

    const existingCheckIns = await databases.listDocuments(
      databaseId,
      appwriteConfig.checkInsCollectionId,
      [Query.equal("goalId", goalId), Query.limit(100)]
    );

    if (existingCheckIns.total >= 5) {
      return Response.json(
        { error: "Maximum 5 check-ins allowed for this goal cycle." },
        { status: 400 }
      );
    }

    let checkIn;

    try {
      checkIn = await databases.createDocument(
        databaseId,
        appwriteConfig.checkInsCollectionId,
        ID.unique(),
        {
          goalId,
          employeeId,
          managerId,
          scheduledAt,
          status,
          employeeNotes,
          managerNotes,
          transcriptText,
          isFinalCheckIn,
          ...(attachmentIds.length > 0 ? { attachmentIds } : {}),
        }
      );
    } catch (error) {
      // Backward compatibility: if check_ins schema does not yet have attachmentIds,
      // retry without attachment payload to avoid blocking core check-in creation.
      if (
        attachmentIds.length > 0 &&
        error?.message &&
        String(error.message).toLowerCase().includes("unknown attribute")
      ) {
        checkIn = await databases.createDocument(
          databaseId,
          appwriteConfig.checkInsCollectionId,
          ID.unique(),
          {
            goalId,
            employeeId,
            managerId,
            scheduledAt,
            status,
            employeeNotes,
            managerNotes,
            transcriptText,
            isFinalCheckIn,
          }
        );
      } else {
        throw error;
      }
    }

    return Response.json({ data: checkIn }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

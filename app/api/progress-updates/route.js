import { appwriteConfig, milestoneEventsCollectionId } from "@/lib/appwrite";
import { GOAL_STATUSES, RAG_STATUSES } from "@/lib/appwriteSchema";
import { ID, Query, databaseId } from "@/lib/appwriteServer";
import { checkAndCreateMilestone, MILESTONE_TYPES } from "@/lib/milestones";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertManagerCanAccessEmployee } from "@/lib/teamAccess";

const VALID_RAG = Object.values(RAG_STATUSES);

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function dedupeById(documents) {
  const seen = new Set();
  const merged = [];

  for (const document of documents) {
    if (!seen.has(document.$id)) {
      seen.add(document.$id);
      merged.push(document);
    }
  }

  return merged;
}

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "hr"]);

    const { searchParams } = new URL(request.url);
    const goalId = searchParams.get("goalId");
    const employeeId = (searchParams.get("employeeId") || "").trim();

    const scope = (searchParams.get("scope") || "team").trim();

    let documents = [];

    if (profile.role === "employee") {
      if (employeeId && employeeId !== profile.$id) {
        return Response.json({ error: "Forbidden for requested employee." }, { status: 403 });
      }

      const result = await databases.listDocuments(
        databaseId,
        appwriteConfig.progressUpdatesCollectionId,
        [
          Query.equal("employeeId", profile.$id),
          Query.orderDesc("$createdAt"),
          Query.limit(100),
        ]
      );
      documents = result.documents;
    } else if (profile.role === "manager") {
      await assertManagerCanAccessEmployee(databases, profile.$id, employeeId);

      if (scope === "self") {
        const selfResult = await databases.listDocuments(
          databaseId,
          appwriteConfig.progressUpdatesCollectionId,
          [
            Query.equal("employeeId", profile.$id),
            Query.orderDesc("$createdAt"),
            Query.limit(100),
          ]
        );
        documents = selfResult.documents;
      } else if (scope === "all") {
        const [selfResult, teamGoals] = await Promise.all([
          databases.listDocuments(databaseId, appwriteConfig.progressUpdatesCollectionId, [
            Query.equal("employeeId", profile.$id),
            Query.orderDesc("$createdAt"),
            Query.limit(100),
          ]),
          databases.listDocuments(databaseId, appwriteConfig.goalsCollectionId, [
            Query.equal("managerId", profile.$id),
            Query.limit(200),
          ]),
        ]);

        if (teamGoals.documents.length > 0) {
          const teamResult = await databases.listDocuments(
            databaseId,
            appwriteConfig.progressUpdatesCollectionId,
            [
              Query.equal(
                "goalId",
                teamGoals.documents.map((goal) => goal.$id)
              ),
              Query.orderDesc("$createdAt"),
              Query.limit(100),
            ]
          );

          documents = dedupeById([...selfResult.documents, ...teamResult.documents]);
        } else {
          documents = selfResult.documents;
        }
      } else {
        const teamGoals = await databases.listDocuments(
          databaseId,
          appwriteConfig.goalsCollectionId,
          [Query.equal("managerId", profile.$id), Query.limit(200)]
        );

        if (teamGoals.documents.length > 0) {
          const teamResult = await databases.listDocuments(
            databaseId,
            appwriteConfig.progressUpdatesCollectionId,
            [
              Query.equal(
                "goalId",
                teamGoals.documents.map((goal) => goal.$id)
              ),
              Query.orderDesc("$createdAt"),
              Query.limit(100),
            ]
          );

          documents = teamResult.documents;
        }
      }
    } else {
      const result = await databases.listDocuments(
        databaseId,
        appwriteConfig.progressUpdatesCollectionId,
        [Query.orderDesc("$createdAt"), Query.limit(100)]
      );
      documents = result.documents;
    }

    if (goalId) {
      documents = documents.filter((item) => item.goalId === goalId);
    }

    if (employeeId) {
      documents = documents.filter((item) => item.employeeId === employeeId);
    }

    return Response.json({
      data: documents.map((item) => ({
        ...item,
        createdAt: item.createdAt || item.$createdAt,
      })),
    });
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
    const updateText = (body.updateText || "").trim();
    const ragStatus = (body.ragStatus || "").trim();
    const attachmentIds = Array.isArray(body.attachmentIds) ? body.attachmentIds : [];
    const percentComplete = toInt(body.percentComplete, -1);

    if (!goalId || !updateText || percentComplete < 0 || percentComplete > 100) {
      return Response.json(
        { error: "goalId, updateText and percentComplete (0-100) are required." },
        { status: 400 }
      );
    }

    if (!VALID_RAG.includes(ragStatus)) {
      return Response.json({ error: "Invalid ragStatus." }, { status: 400 });
    }

    const goal = await databases.getDocument(
      databaseId,
      appwriteConfig.goalsCollectionId,
      goalId
    );

    const previousProgressPercent = toInt(goal.progressPercent, 0);

    if (goal.employeeId !== profile.$id) {
      return Response.json({ error: "Forbidden for this goal." }, { status: 403 });
    }

    const progress = await databases.createDocument(
      databaseId,
      appwriteConfig.progressUpdatesCollectionId,
      ID.unique(),
      {
        goalId,
        employeeId: profile.$id,
        percentComplete,
        ragStatus,
        updateText,
        attachmentIds,
      }
    );

    const goalPatch = {
      progressPercent: percentComplete,
    };

    if (percentComplete === 100) {
      goalPatch.status = GOAL_STATUSES.CLOSED;
    }

    const updatedGoal = await databases.updateDocument(
      databaseId,
      appwriteConfig.goalsCollectionId,
      goalId,
      goalPatch
    );

    try {
      if (process.env.NEXT_PUBLIC_ENABLE_GAMIFICATION === "true") {
        const milestonesCollectionId = String(milestoneEventsCollectionId || "").trim();
        const thresholds = [25, 50, 75, 100];
        const previousPct = Number(goal.progressPercent ?? 0);
        const newPct = Number(body.percentComplete);
        const crossed = thresholds.filter((t) => previousPct < t && newPct >= t);

        if (milestonesCollectionId && crossed.length > 0) {
          await Promise.allSettled(
            crossed.map((threshold) =>
              checkAndCreateMilestone({
                db: databases,
                databaseId,
                milestoneEventsCollectionId: milestonesCollectionId,
                ID,
                Query,
                userId: profile.$id,
                milestoneType: MILESTONE_TYPES[`PROGRESS_${threshold}`],
                referenceId: goalId,
                cycleId: goal.cycleId,
              })
            )
          );
        }
      }
    } catch (error) {
      console.warn("[progress-updates.post] milestone side-effect failed:", error?.message || error);
    }

    return Response.json({ data: { progress, goal: updatedGoal } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

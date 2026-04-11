/**
 * GET /api/goals/[goalId]/ratings
 *
 * Returns all per-manager ratings for a goal, enriched with manager name/email,
 * plus the computed final weighted average.
 * Accessible to: the goal's employee, any manager with team access, hr.
 */

import { appwriteConfig } from "@/lib/appwrite";
import { databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertManagerCanAccessEmployee } from "@/lib/teamAccess";
import { getGoalRatings, computeFinalRating } from "@/lib/dualReporting";

export async function GET(request, context) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "leadership", "hr"]);

    const params = await context.params;
    const goalId = params.goalId;

    const goal = await databases.getDocument(
      databaseId,
      appwriteConfig.goalsCollectionId,
      goalId
    );

    const employeeId = String(goal.employeeId || "").trim();

    if (profile.role === "employee" && employeeId !== profile.$id) {
      return Response.json({ error: "Forbidden for this goal." }, { status: 403 });
    }

    if (profile.role === "manager" || profile.role === "leadership") {
      await assertManagerCanAccessEmployee(databases, profile.$id, employeeId);
    }

    const ratings = await getGoalRatings(databases, goalId);

    // Enrich with manager names
    const enriched = await Promise.all(
      ratings.map(async (r) => {
        let managerName = "";
        let managerEmail = "";
        try {
          const mgr = await databases.getDocument(
            databaseId,
            appwriteConfig.usersCollectionId,
            r.managerId
          );
          managerName = mgr.name || "";
          managerEmail = mgr.email || "";
        } catch {
          // ignore
        }
        return { ...r, managerName, managerEmail };
      })
    );

    const computed = computeFinalRating(
      enriched.map((r) => ({ rating: r.rating, weightPercent: r.weightPercent }))
    );

    return Response.json({
      data: {
        ratings: enriched,
        finalRating: computed?.finalRating ?? null,
        finalRatingLabel: computed?.finalRatingLabel ?? null,
        ratingsComplete: enriched.length > 0 && enriched.every((r) => r.rating !== null),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

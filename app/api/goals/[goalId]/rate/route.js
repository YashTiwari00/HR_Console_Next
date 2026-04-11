/**
 * POST /api/goals/[goalId]/rate
 *
 * A manager submits their weighted rating for a goal.
 * After submission the final weighted-average rating is recomputed and written
 * back to the goal document (managerFinalRating / managerFinalRatingLabel).
 *
 * Body: { rating: number (1–5) | ratingLabel: "EE"|"DE"|"ME"|"SME"|"NI", notes?: string }
 */

import { appwriteConfig } from "@/lib/appwrite";
import { databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertManagerCanAccessEmployee } from "@/lib/teamAccess";
import { parseRatingInput } from "@/lib/ratings";
import { submitManagerGoalRating } from "@/lib/dualReporting";

export async function POST(request, context) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["manager", "leadership", "hr"]);

    const params = await context.params;
    const goalId = params.goalId;

    // Load the goal
    const goal = await databases.getDocument(
      databaseId,
      appwriteConfig.goalsCollectionId,
      goalId
    );

    const employeeId = String(goal.employeeId || "").trim();
    const cycleId = String(goal.cycleId || "").trim();

    // Managers can only rate goals for their own team members
    if (profile.role !== "hr") {
      await assertManagerCanAccessEmployee(databases, profile.$id, employeeId);
    }

    const body = await request.json();
    const ratingInput = body.rating ?? body.ratingLabel ?? null;
    const notes = (body.notes || "").trim() || null;

    const parsed = parseRatingInput(ratingInput);
    if (!parsed.value || !parsed.label) {
      return Response.json(
        { error: "Provide rating (1–5) or ratingLabel (EE/DE/ME/SME/NI)." },
        { status: 400 }
      );
    }

    const { goalRatingDoc, finalRating, finalRatingLabel, ratingsComplete } =
      await submitManagerGoalRating(databases, {
        goalId,
        managerId: profile.$id,
        employeeId,
        cycleId,
        rating: parsed.value,
        ratingLabel: parsed.label,
        notes,
      });

    // Write the computed final rating back to the goal document
    const goalPatch = {
      managerFinalRating: finalRating,
      managerFinalRatingLabel: finalRatingLabel,
      managerFinalRatedAt: new Date().toISOString(),
      managerFinalRatedBy: profile.$id,
    };

    try {
      await databases.updateDocument(
        databaseId,
        appwriteConfig.goalsCollectionId,
        goalId,
        goalPatch
      );
    } catch {
      // Non-fatal: goal_ratings record was saved; final write may retry later
    }

    return Response.json({
      data: {
        goalRating: goalRatingDoc,
        finalRating,
        finalRatingLabel,
        ratingsComplete,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

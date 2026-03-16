import { appwriteConfig } from "@/lib/appwrite";
import { GOAL_STATUSES, RATING_VISIBILITY } from "@/lib/appwriteSchema";
import { ID, Query, databaseId } from "@/lib/appwriteServer";
import { scoreX100ToLabel, weightedScoreX100 } from "@/lib/ratings";

function isMissingCollectionOrAttributeError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("unknown attribute") || message.includes("could not be found");
}

export async function getCycleState(databases, cycleId) {
  if (!cycleId) return { state: "active", exists: false };

  try {
    const result = await databases.listDocuments(databaseId, appwriteConfig.goalCyclesCollectionId, [
      Query.equal("name", cycleId),
      Query.limit(1),
    ]);

    const cycle = result.documents[0];
    if (!cycle) {
      return { state: "active", exists: false };
    }

    return { state: String(cycle.state || "active"), exists: true, cycle };
  } catch {
    return { state: "active", exists: false };
  }
}

export async function computeAndPersistEmployeeCycleScore(databases, input) {
  const employeeId = String(input?.employeeId || "").trim();
  const managerId = String(input?.managerId || "").trim();
  const cycleId = String(input?.cycleId || "").trim();
  const visibility = input?.visibility || RATING_VISIBILITY.HIDDEN;

  if (!employeeId || !managerId || !cycleId) return null;

  const goalsResult = await databases.listDocuments(databaseId, appwriteConfig.goalsCollectionId, [
    Query.equal("employeeId", employeeId),
    Query.equal("cycleId", cycleId),
    Query.limit(200),
  ]);

  const eligibleGoals = goalsResult.documents.filter((goal) => {
    const status = String(goal.status || "");
    return status === GOAL_STATUSES.APPROVED || status === GOAL_STATUSES.CLOSED;
  });

  const scoreX100 = weightedScoreX100(
    eligibleGoals.map((goal) => ({
      ratingValue: Number(goal.managerFinalRating),
      weightage: Number(goal.weightage),
    }))
  );

  if (scoreX100 === null) return null;

  const scoreLabel = scoreX100ToLabel(scoreX100);
  const computedAt = new Date().toISOString();

  try {
    const existing = await databases.listDocuments(databaseId, appwriteConfig.employeeCycleScoresCollectionId, [
      Query.equal("employeeId", employeeId),
      Query.equal("managerId", managerId),
      Query.equal("cycleId", cycleId),
      Query.limit(1),
    ]);

    const existingRow = existing.documents[0];
    if (existingRow) {
      return databases.updateDocument(
        databaseId,
        appwriteConfig.employeeCycleScoresCollectionId,
        existingRow.$id,
        {
          scoreX100,
          scoreLabel,
          computedAt,
          visibility,
        }
      );
    }

    return databases.createDocument(
      databaseId,
      appwriteConfig.employeeCycleScoresCollectionId,
      ID.unique(),
      {
        employeeId,
        managerId,
        cycleId,
        scoreX100,
        scoreLabel,
        computedAt,
        visibility,
      }
    );
  } catch (error) {
    if (isMissingCollectionOrAttributeError(error)) {
      return null;
    }

    throw error;
  }
}

export async function setCycleRatingsVisibility(databases, cycleId, visible) {
  const visibility = visible ? RATING_VISIBILITY.VISIBLE : RATING_VISIBILITY.HIDDEN;

  const goals = await databases.listDocuments(databaseId, appwriteConfig.goalsCollectionId, [
    Query.equal("cycleId", cycleId),
    Query.limit(200),
  ]);

  await Promise.all(
    goals.documents.map((goal) =>
      databases
        .updateDocument(databaseId, appwriteConfig.goalsCollectionId, goal.$id, {
          ratingVisibleToEmployee: visible,
        })
        .catch(() => null)
    )
  );

  try {
    const scores = await databases.listDocuments(databaseId, appwriteConfig.employeeCycleScoresCollectionId, [
      Query.equal("cycleId", cycleId),
      Query.limit(200),
    ]);

    await Promise.all(
      scores.documents.map((row) =>
        databases.updateDocument(databaseId, appwriteConfig.employeeCycleScoresCollectionId, row.$id, {
          visibility,
        })
      )
    );
  } catch {
    // employee_cycle_scores collection might not exist in all environments.
  }
}

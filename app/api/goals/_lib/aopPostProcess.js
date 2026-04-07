import { appwriteConfig } from "@/lib/appwrite";
import { databaseId } from "@/lib/appwriteServer";
import { getAOP } from "@/lib/aop/getAOP";
import { matchGoalToAOP } from "@/lib/aop/matchGoalToAOP";

function isUnknownAttributeError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("unknown attribute") || message.includes("attribute not found in schema");
}

export async function postProcessGoalAop(databases, goal) {
  try {
    const goalId = String(goal?.$id || "").trim();
    if (!goalId) return;

    const aopContent = await getAOP(databases);
    if (!aopContent) return;

    const match = matchGoalToAOP({
      title: String(goal?.title || ""),
      description: String(goal?.description || ""),
      aopContent,
    });

    try {
      await databases.updateDocument(databaseId, appwriteConfig.goalsCollectionId, goalId, {
        aopAligned: Boolean(match?.isAligned),
        aopReference: match?.reference ? String(match.reference).slice(0, 512) : null,
      });
    } catch (error) {
      if (isUnknownAttributeError(error)) {
        return;
      }
    }
  } catch {
    // AOP linkage must never block goal creation.
  }
}

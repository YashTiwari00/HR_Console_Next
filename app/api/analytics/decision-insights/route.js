import { analyzeEmployeePerformance } from "@/lib/decision/decisionEngine";
import { buildExplainability } from "@/lib/ai/explainability";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertManagerCanAccessEmployee } from "@/lib/teamAccess";

async function assertDecisionInsightsAccess(databases, profile, employeeId) {
  const role = String(profile?.role || "").trim().toLowerCase();
  const profileId = String(profile?.$id || "").trim();

  if (role === "hr") return;

  if (role === "employee") {
    if (employeeId !== profileId) {
      const error = new Error("Forbidden for requested employee.");
      error.statusCode = 403;
      throw error;
    }
    return;
  }

  if (role === "manager") {
    if (employeeId === profileId) return;
    await assertManagerCanAccessEmployee(databases, profileId, employeeId);
    return;
  }

  const error = new Error("Forbidden for requested employee.");
  error.statusCode = 403;
  throw error;
}

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "hr"]);

    const { searchParams } = new URL(request.url);
    const employeeId = String(searchParams.get("employeeId") || "").trim();
    const cycleId = String(searchParams.get("cycleId") || "").trim();

    if (!employeeId || !cycleId) {
      return Response.json(
        { error: "employeeId and cycleId are required." },
        { status: 400 }
      );
    }

    await assertDecisionInsightsAccess(databases, profile, employeeId);

    const data = await analyzeEmployeePerformance(employeeId, cycleId, {
      databases,
      missedCheckInThreshold: 2,
    });

    let explainability = null;
    try {
      explainability = buildExplainability({
        source: "decision_engine",
        confidence: data.overallRiskLevel === "high" ? 0.86 : data.overallRiskLevel === "medium" ? 0.74 : 0.68,
        reason: "Decision insights generated from goals, progress trends, check-ins, and AOP alignment signals.",
        based_on: ["goals", "progress", "check-ins", "AOP", "history"],
        time_window: cycleId,
      });
    } catch {
      explainability = null;
    }

    return Response.json({ data, explainability });
  } catch (error) {
    return errorResponse(error);
  }
}

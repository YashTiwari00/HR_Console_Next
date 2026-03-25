import { normalizeRole, routeForRole } from "@/lib/auth/roles";
import { errorResponse, requireSessionAuth } from "@/lib/serverAuth";

export async function GET(request) {
  try {
    const { profile } = await requireSessionAuth(request);
    const safeRole = normalizeRole(profile?.role);
    const region = String(profile?.region || "").trim();

    if (safeRole === "region-admin" && !region) {
      return Response.json({
        data: {
          redirectTo: "/onboarding",
          role: safeRole,
          reason: "region-required",
        },
      });
    }

    return Response.json({
      data: {
        redirectTo: routeForRole(safeRole),
        role: safeRole,
        reason: safeRole ? "ok" : "onboarding-required",
      },
    });
  } catch (error) {
    if (error?.statusCode === 401) {
      return Response.json({
        data: {
          redirectTo: "/login",
          role: null,
          reason: "unauthenticated",
        },
      });
    }

    return errorResponse(error);
  }
}

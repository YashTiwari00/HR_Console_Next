import {
  DEFAULT_ENABLED_FRAMEWORKS,
  getFrameworkPolicy,
  upsertDefaultFrameworkPolicy,
} from "@/lib/frameworkPolicies";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";

function isMissingCollectionError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("collection") && message.includes("not found");
}

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "hr", "leadership"]);

    const policy = await getFrameworkPolicy(databases);

    return Response.json({
      data: {
        enabledFrameworks: policy.enabledFrameworks,
        source: policy.source,
        name: policy.name || "Default Framework Policy",
        updatedAt: policy.updatedAt || null,
        updatedBy: policy.updatedBy || null,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    const body = await request.json();
    const nextEnabled = Array.isArray(body?.enabledFrameworks)
      ? body.enabledFrameworks
      : [];

    if (nextEnabled.length === 0) {
      return Response.json(
        {
          error: "enabledFrameworks is required and must contain at least one framework.",
          allowedValues: DEFAULT_ENABLED_FRAMEWORKS,
        },
        { status: 400 }
      );
    }

    let updated;

    try {
      updated = await upsertDefaultFrameworkPolicy(databases, profile.$id, {
        name: body?.name,
        enabledFrameworks: nextEnabled,
      });
    } catch (error) {
      if (isMissingCollectionError(error)) {
        return Response.json(
          {
            error:
              "framework_policies collection is not available. Run schema apply before setting policies.",
          },
          { status: 409 }
        );
      }

      throw error;
    }

    return Response.json({
      data: {
        id: updated.$id,
        enabledFrameworks: updated.enabledFrameworks || [],
        name: updated.name || "Default Framework Policy",
        updatedAt: updated.updatedAt || updated.$updatedAt || null,
        updatedBy: updated.updatedBy || null,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

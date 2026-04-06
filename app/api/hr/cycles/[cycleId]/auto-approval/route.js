import { appwriteConfig } from "@/lib/appwrite";
import { CYCLE_AUTO_APPROVAL_DEFAULTS, PERIOD_TYPES } from "@/lib/appwriteSchema";
import { ID, Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";

function toBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

function toDays(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(1, Math.min(90, parsed));
}

function isUnknownAttributeError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("unknown attribute") || message.includes("attribute not found in schema");
}

function shapeResponse(cycleId, cycle) {
  return {
    cycleId,
    autoApprovalEnabled: toBoolean(
      cycle?.autoApprovalEnabled,
      CYCLE_AUTO_APPROVAL_DEFAULTS.ENABLED
    ),
    autoApprovalDays: toDays(
      cycle?.autoApprovalDays,
      CYCLE_AUTO_APPROVAL_DEFAULTS.DAYS
    ),
  };
}

async function getCycleByName(databases, cycleId) {
  const result = await databases.listDocuments(databaseId, appwriteConfig.goalCyclesCollectionId, [
    Query.equal("name", cycleId),
    Query.limit(1),
  ]);

  return result.documents[0] || null;
}

export async function GET(request, context) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    const params = await context.params;
    const cycleId = String(params?.cycleId || "").trim().toUpperCase();

    if (!cycleId) {
      return Response.json({ error: "cycleId is required." }, { status: 400 });
    }

    const cycle = await getCycleByName(databases, cycleId);

    return Response.json({
      data: shapeResponse(cycleId, cycle),
      meta: {
        configured: Boolean(cycle),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request, context) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    const params = await context.params;
    const cycleId = String(params?.cycleId || "").trim().toUpperCase();

    if (!cycleId) {
      return Response.json({ error: "cycleId is required." }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const autoApprovalEnabled = toBoolean(
      body?.autoApprovalEnabled,
      CYCLE_AUTO_APPROVAL_DEFAULTS.ENABLED
    );
    const autoApprovalDays = toDays(body?.autoApprovalDays, CYCLE_AUTO_APPROVAL_DEFAULTS.DAYS);

    if (autoApprovalEnabled && autoApprovalDays < 1) {
      return Response.json(
        { error: "autoApprovalDays must be at least 1 when autoApprovalEnabled is true." },
        { status: 400 }
      );
    }

    const existing = await getCycleByName(databases, cycleId);
    const payload = {
      autoApprovalEnabled,
      autoApprovalDays,
    };

    let cycle;
    try {
      if (existing) {
        cycle = await databases.updateDocument(
          databaseId,
          appwriteConfig.goalCyclesCollectionId,
          existing.$id,
          payload
        );
      } else {
        const nowIso = new Date().toISOString();
        cycle = await databases.createDocument(
          databaseId,
          appwriteConfig.goalCyclesCollectionId,
          ID.unique(),
          {
            name: cycleId,
            periodType: PERIOD_TYPES.QUARTERLY,
            startDate: nowIso,
            endDate: nowIso,
            state: "active",
            ...payload,
          }
        );
      }
    } catch (error) {
      if (isUnknownAttributeError(error)) {
        return Response.json(
          {
            error:
              "Cycle auto-approval attributes are not available in schema. Run schema sync with --apply.",
          },
          { status: 409 }
        );
      }

      throw error;
    }

    return Response.json({ data: shapeResponse(cycleId, cycle) });
  } catch (error) {
    return errorResponse(error);
  }
}

import { appwriteConfig } from "@/lib/appwrite";
import { databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";

type ApprovePayload = {
  templateId?: unknown;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function isNotFoundError(error: unknown) {
  const message = String((error as Error)?.message || "").toLowerCase();
  return message.includes("not found") || message.includes("could not be found");
}

export async function POST(request: Request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    let body: ApprovePayload;
    try {
      body = (await request.json()) as ApprovePayload;
    } catch {
      return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const templateId = normalizeText(body?.templateId);

    if (!templateId) {
      return Response.json({ error: "templateId is required." }, { status: 400 });
    }

    const dbId = normalizeText(databaseId);
    const collectionId = String(appwriteConfig.goalKpiLibraryCollectionId || "goal_kpi_library").trim();

    if (!dbId) {
      return Response.json({ error: "Database configuration is missing." }, { status: 500 });
    }

    if (!collectionId) {
      return Response.json({ error: "Collection configuration is missing." }, { status: 500 });
    }

    let template: Record<string, unknown>;

    try {
      template = (await databases.getDocument(dbId, collectionId, templateId)) as Record<string, unknown>;
    } catch (error) {
      if (isNotFoundError(error)) {
        return Response.json({ error: "Template not found." }, { status: 404 });
      }
      throw error;
    }

    const sourceType = normalizeText(template.source_type).toLowerCase();
    const approved = Boolean(template.approved);

    if (sourceType !== "manager") {
      return Response.json(
        { error: "Only manager-created templates can be approved from this endpoint." },
        { status: 400 }
      );
    }

    if (approved) {
      return Response.json({
        success: true,
        message: "Template is already approved",
      });
    }

    await databases.updateDocument(dbId, collectionId, templateId, {
      approved: true,
      approved_by: String(profile?.$id || "").trim(),
    });

    return Response.json({
      success: true,
      message: "Template approved successfully",
    });
  } catch (error) {
    return errorResponse(error);
  }
}

import { appwriteConfig } from "@/lib/appwrite";
import { ID, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";

type CreatePayload = {
  title?: unknown;
  description?: unknown;
  department?: unknown;
  role?: unknown;
  domain?: unknown;
  kpi_metrics?: unknown;
  default_weightage?: unknown;
  tags?: unknown;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function toTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeText(item)).filter(Boolean);
}

function normalizeKpiMetrics(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") return JSON.stringify(value);
  return "";
}

export async function POST(request: Request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    let body: CreatePayload;
    try {
      body = (await request.json()) as CreatePayload;
    } catch {
      return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const title = normalizeText(body?.title);
    const description = normalizeText(body?.description);
    const department = normalizeLower(body?.department);
    const role = normalizeLower(body?.role);
    const domain = normalizeLower(body?.domain);
    const kpi_metrics = normalizeKpiMetrics(body?.kpi_metrics);
    const tags = toTags(body?.tags);

    const defaultWeightageRaw = body?.default_weightage;
    const default_weightage =
      defaultWeightageRaw === undefined || defaultWeightageRaw === null || defaultWeightageRaw === ""
        ? undefined
        : Number(defaultWeightageRaw);

    if (!title || !description || !department || !role || !kpi_metrics) {
      return Response.json(
        {
          error: "title, description, department, role and kpi_metrics are required.",
        },
        { status: 400 }
      );
    }

    if (default_weightage !== undefined && !Number.isFinite(default_weightage)) {
      return Response.json(
        { error: "default_weightage must be a valid number when provided." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const actorId = String(profile?.$id || "").trim();
    const dbId = String(databaseId || "").trim();
    const collectionId = String(appwriteConfig.goalKpiLibraryCollectionId || "goal_kpi_library").trim();

    if (!dbId) {
      return Response.json({ error: "Database configuration is missing." }, { status: 500 });
    }

    if (!collectionId) {
      return Response.json({ error: "Collection configuration is missing." }, { status: 500 });
    }

    const createdDocument = await databases.createDocument(
      dbId,
      collectionId,
      ID.unique(),
      {
        title,
        description,
        department,
        role,
        domain: domain || null,
        kpi_metrics,
        default_weightage: default_weightage ?? null,
        tags,
        source_type: "hr",
        approved: true,
        approved_by: actorId,
        created_by: actorId,
        created_at: now,
      }
    );

    return Response.json({
      success: true,
      message: "KPI template created successfully",
      data: createdDocument,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

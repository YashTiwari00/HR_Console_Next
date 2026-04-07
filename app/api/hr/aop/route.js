import { appwriteConfig } from "@/lib/appwrite";
import { ID, Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";

const YEAR_PATTERN = /^\d{4}$/;
const MAX_AOP_CONTENT_LENGTH = 50000;

function sanitizeScalar(value) {
  return String(value ?? "").replace(/\u0000/g, "").trim();
}

function sanitizeAopContent(value) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function normalizeYear(value) {
  const nextYear = sanitizeScalar(value);
  if (!YEAR_PATTERN.test(nextYear)) {
    return null;
  }

  return nextYear;
}

function getOrganizationId() {
  const configuredOrganizationId = sanitizeScalar(
    process.env.AOP_ORGANIZATION_ID || process.env.NEXT_PUBLIC_ORGANIZATION_ID || "default-org"
  );

  return configuredOrganizationId || "default-org";
}

function isMissingCollectionError(error) {
  const message = String(error?.message || "").toLowerCase();
  const collectionId = String(appwriteConfig.aopDocumentsCollectionId || "").toLowerCase();

  return (
    message.includes("collection") &&
    message.includes("could not be found") &&
    (!collectionId || message.includes(collectionId))
  );
}

function pickCanonicalDocument(documents) {
  if (!Array.isArray(documents) || documents.length === 0) {
    return null;
  }

  const sorted = [...documents].sort((a, b) => {
    const aTime = new Date(a.updatedAt || a.$updatedAt || 0).valueOf();
    const bTime = new Date(b.updatedAt || b.$updatedAt || 0).valueOf();
    return bTime - aTime;
  });

  return sorted[0] || null;
}

async function listAopDocumentsByOrgAndYear(databases, organizationId, year) {
  return databases.listDocuments(databaseId, appwriteConfig.aopDocumentsCollectionId, [
    Query.equal("organizationId", organizationId),
    Query.equal("year", year),
    Query.limit(10),
  ]);
}

export async function GET(request) {
  try {
    const { databases } = await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const year = normalizeYear(searchParams.get("year"));

    if (!year) {
      return Response.json({ error: "year must be a valid YYYY value." }, { status: 400 });
    }

    const organizationId = getOrganizationId();

    let result;
    try {
      result = await listAopDocumentsByOrgAndYear(databases, organizationId, year);
    } catch (error) {
      if (isMissingCollectionError(error)) {
        return Response.json({ data: null });
      }

      throw error;
    }

    const canonical = pickCanonicalDocument(result.documents || []);

    if (!canonical) {
      return Response.json({ data: null });
    }

    return Response.json({
      data: {
        id: canonical.$id,
        organizationId: canonical.organizationId,
        year: canonical.year,
        content: canonical.content || "",
        createdBy: canonical.createdBy || null,
        createdAt: canonical.createdAt || canonical.$createdAt || null,
        updatedAt: canonical.updatedAt || canonical.$updatedAt || null,
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

    const body = await request.json().catch(() => ({}));
    const year = normalizeYear(body?.year);
    const content = sanitizeAopContent(body?.content);

    if (!year) {
      return Response.json({ error: "year must be a valid YYYY value." }, { status: 400 });
    }

    if (!content) {
      return Response.json({ error: "content is required." }, { status: 400 });
    }

    if (content.length > MAX_AOP_CONTENT_LENGTH) {
      return Response.json(
        {
          error: `content exceeds max length of ${MAX_AOP_CONTENT_LENGTH} characters.`,
        },
        { status: 400 }
      );
    }

    const organizationId = getOrganizationId();
    const nowIso = new Date().toISOString();

    let existingRows;
    try {
      existingRows = await listAopDocumentsByOrgAndYear(databases, organizationId, year);
    } catch (error) {
      if (isMissingCollectionError(error)) {
        return Response.json(
          {
            error: "aop_documents collection is not available. Run schema apply before using AOP APIs.",
          },
          { status: 409 }
        );
      }

      throw error;
    }

    const matchingDocs = existingRows.documents || [];
    const canonical = pickCanonicalDocument(matchingDocs);

    let saved;

    if (canonical) {
      saved = await databases.updateDocument(
        databaseId,
        appwriteConfig.aopDocumentsCollectionId,
        canonical.$id,
        {
          content,
          updatedAt: nowIso,
        }
      );
    } else {
      saved = await databases.createDocument(
        databaseId,
        appwriteConfig.aopDocumentsCollectionId,
        ID.unique(),
        {
          organizationId,
          year,
          content,
          createdBy: profile.$id,
          createdAt: nowIso,
          updatedAt: nowIso,
        }
      );
    }

    return Response.json({
      data: {
        id: saved.$id,
        organizationId: saved.organizationId,
        year: saved.year,
        content: saved.content || "",
        createdBy: saved.createdBy || null,
        createdAt: saved.createdAt || saved.$createdAt || null,
        updatedAt: saved.updatedAt || saved.$updatedAt || null,
      },
      meta: {
        duplicateMatches: Math.max(0, matchingDocs.length - 1),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

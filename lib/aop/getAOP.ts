import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";

type DatabasesClient = {
  listDocuments: (databaseId: string, collectionId: string, queries?: unknown[]) => Promise<{ documents?: any[] }>;
};

function sanitizeScalar(value: unknown) {
  return String(value ?? "").replace(/\u0000/g, "").trim();
}

function normalizeYear(value?: string | number | null) {
  const raw = sanitizeScalar(value ?? "");
  if (/^\d{4}$/.test(raw)) return raw;
  return String(new Date().getUTCFullYear());
}

function resolveOrganizationId(organizationId?: string | null) {
  const explicit = sanitizeScalar(organizationId || "");
  if (explicit) return explicit;

  const configured = sanitizeScalar(
    process.env.AOP_ORGANIZATION_ID || process.env.NEXT_PUBLIC_ORGANIZATION_ID || "default-org"
  );

  return configured || "default-org";
}

function isMissingCollectionError(error: unknown) {
  const message = String((error as any)?.message || "").toLowerCase();
  const collectionId = String(appwriteConfig.aopDocumentsCollectionId || "aop_documents").toLowerCase();

  return (
    message.includes("collection") &&
    (message.includes("could not be found") || message.includes("not found")) &&
    (!collectionId || message.includes(collectionId))
  );
}

export async function getAOP(
  databases: DatabasesClient,
  options: { organizationId?: string | null; year?: string | number | null } = {}
): Promise<string | null> {
  try {
    const organizationId = resolveOrganizationId(options.organizationId);
    const year = normalizeYear(options.year);
    const dbId = String(databaseId || "");
    const collectionId = String(appwriteConfig.aopDocumentsCollectionId || "aop_documents");

    if (!dbId) return null;

    const result = await databases.listDocuments(
      dbId,
      collectionId,
      [Query.equal("organizationId", organizationId), Query.equal("year", year), Query.limit(1)]
    );

    const doc = (result.documents || [])[0];
    if (!doc) return null;

    const content = sanitizeScalar(doc.content || "");
    return content || null;
  } catch (error) {
    if (isMissingCollectionError(error)) {
      return null;
    }

    return null;
  }
}

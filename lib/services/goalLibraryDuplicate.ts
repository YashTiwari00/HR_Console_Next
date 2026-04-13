import { Query } from "@/lib/appwriteServer";

type DuplicateLookupInput = {
  databases: {
    listDocuments: (
      databaseId: string,
      collectionId: string,
      queries?: unknown[]
    ) => Promise<{ documents?: Array<Record<string, unknown>> }>;
  };
  dbId: string;
  collectionId: string;
  title: string;
  role: string;
  department: string;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeTextLower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function isSchemaAttributeError(error: unknown) {
  const message = String((error as Error)?.message || "").toLowerCase();
  return (
    (message.includes("attribute") && message.includes("not found")) ||
    (message.includes("unknown") && message.includes("attribute"))
  );
}

export async function findDuplicateGoalTemplate(input: DuplicateLookupInput) {
  const { databases, dbId, collectionId, title, role, department } = input;

  try {
    const result = await databases.listDocuments(dbId, collectionId, [
      Query.equal("role", role),
      Query.equal("department", department),
      Query.limit(500),
    ]);

    const normalizedTitle = normalizeTextLower(title);
    return (result.documents || []).find(
      (row) => normalizeTextLower(row.title) === normalizedTitle
    );
  } catch (error) {
    // Keep writes compatible when schema is partially rolled out.
    if (isSchemaAttributeError(error)) {
      return null;
    }

    throw error;
  }
}
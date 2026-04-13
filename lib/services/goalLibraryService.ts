import { appwriteConfig } from "@/lib/appwrite";
import { createAdminServices, databaseId, Query } from "@/lib/appwriteServer";

export type GoalLibraryInput = {
  role: string;
  department: string;
  domain?: string;
  query?: string;
};

export type GoalLibraryTemplate = {
  $id: string;
  title: string;
  description: string;
  department: string;
  role: string;
  domain?: string;
  kpi_metrics: string;
  default_weightage?: number;
  tags: string[];
  source_type: "hr" | "manager" | "leadership" | "system";
  approved: boolean;
  approved_by?: string;
  created_by: string;
  created_at: string;
  [key: string]: unknown;
};

export type GoalLibraryResult = {
  templates: GoalLibraryTemplate[];
  approvedTemplates: GoalLibraryTemplate[];
  unapprovedTemplates: GoalLibraryTemplate[];
};

type ListDocumentsResponse = {
  documents?: Array<Record<string, unknown>>;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeTextLower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeText(item))
      .filter(Boolean);
  }

  return [];
}

function normalizeTemplate(row: Record<string, unknown>): GoalLibraryTemplate {
  const source = normalizeTextLower(row.source_type) as GoalLibraryTemplate["source_type"];
  const safeSource: GoalLibraryTemplate["source_type"] =
    source === "hr" || source === "manager" || source === "leadership" || source === "system"
      ? source
      : "manager";

  return {
    ...row,
    $id: normalizeText(row.$id),
    title: normalizeText(row.title),
    description: normalizeText(row.description),
    department: normalizeText(row.department),
    role: normalizeText(row.role),
    domain: normalizeText(row.domain) || undefined,
    kpi_metrics: normalizeText(row.kpi_metrics),
    default_weightage: Number.isFinite(Number(row.default_weightage))
      ? Number(row.default_weightage)
      : undefined,
    tags: normalizeTags(row.tags),
    source_type: safeSource,
    approved: Boolean(row.approved),
    approved_by: normalizeText(row.approved_by) || undefined,
    created_by: normalizeText(row.created_by),
    created_at: normalizeText(row.created_at),
  };
}

function matchesQuery(template: GoalLibraryTemplate, normalizedQuery: string) {
  if (!normalizedQuery) return true;

  const title = normalizeTextLower(template.title);
  if (title.includes(normalizedQuery)) return true;

  return template.tags.some((tag) => normalizeTextLower(tag).includes(normalizedQuery));
}

function priorityBucket(template: GoalLibraryTemplate) {
  if (template.approved && template.source_type === "hr") return 1;
  if (template.approved && template.source_type === "leadership") return 2;
  if (template.approved && template.source_type === "manager") return 3;
  if (template.approved && template.source_type === "system") return 4;
  return 5;
}

function matchTier(template: GoalLibraryTemplate, role: string, department: string) {
  const roleExact = normalizeTextLower(template.role) === normalizeTextLower(role);
  if (roleExact) return 1;

  const departmentExact =
    normalizeTextLower(template.department) === normalizeTextLower(department);
  if (departmentExact) return 2;

  return 3;
}

function isMissingCollectionError(error: unknown) {
  const message = String((error as Error)?.message || "").toLowerCase();
  return message.includes("collection") && message.includes("not found");
}

export async function getGoalLibraryTemplates(input: GoalLibraryInput): Promise<GoalLibraryResult> {
  const role = normalizeText(input.role);
  const department = normalizeText(input.department);
  const normalizedDomain = normalizeTextLower(input.domain);
  const normalizedQuery = normalizeTextLower(input.query);

  if (!role && !department) {
    return { templates: [], approvedTemplates: [], unapprovedTemplates: [] };
  }

  const dbId = normalizeText(databaseId);
  const collectionId =
    normalizeText(appwriteConfig.goalKpiLibraryCollectionId) || "goal_kpi_library";

  if (!dbId || !collectionId) {
    return { templates: [], approvedTemplates: [], unapprovedTemplates: [] };
  }

  const { databases } = createAdminServices();

  try {
    const roleQuery = role
      ? databases.listDocuments(dbId, collectionId, [Query.equal("role", role), Query.limit(200)])
      : Promise.resolve({ documents: [] } as ListDocumentsResponse);

    const departmentQuery = department
      ? databases.listDocuments(dbId, collectionId, [
          Query.equal("department", department),
          Query.limit(200),
        ])
      : Promise.resolve({ documents: [] } as ListDocumentsResponse);

    const [roleResult, departmentResult] = await Promise.all([roleQuery, departmentQuery]);

    const merged = new Map<string, GoalLibraryTemplate>();

    for (const row of [...(roleResult.documents || []), ...(departmentResult.documents || [])]) {
      const normalized = normalizeTemplate(row as Record<string, unknown>);
      if (!normalized.$id) continue;
      merged.set(normalized.$id, normalized);
    }

    const allTemplates = [...merged.values()].filter((template) => matchesQuery(template, normalizedQuery));

    const ranked = allTemplates.sort((left, right) => {
      const leftBucket = priorityBucket(left);
      const rightBucket = priorityBucket(right);
      if (leftBucket !== rightBucket) return leftBucket - rightBucket;

      const leftMatchTier = matchTier(left, role, department);
      const rightMatchTier = matchTier(right, role, department);
      if (leftMatchTier !== rightMatchTier) return leftMatchTier - rightMatchTier;

      const leftDomainMatch = normalizedDomain && normalizeTextLower(left.domain) === normalizedDomain ? 1 : 0;
      const rightDomainMatch = normalizedDomain && normalizeTextLower(right.domain) === normalizedDomain ? 1 : 0;
      if (leftDomainMatch !== rightDomainMatch) return Number(rightDomainMatch) - Number(leftDomainMatch);

      const leftTitleMatch = normalizedQuery && normalizeTextLower(left.title).includes(normalizedQuery) ? 1 : 0;
      const rightTitleMatch = normalizedQuery && normalizeTextLower(right.title).includes(normalizedQuery) ? 1 : 0;
      if (leftTitleMatch !== rightTitleMatch) return Number(rightTitleMatch) - Number(leftTitleMatch);

      return normalizeTextLower(left.title).localeCompare(normalizeTextLower(right.title));
    });

    const approvedTemplates = ranked.filter((template) => template.approved);
    const unapprovedTemplates = ranked.filter((template) => !template.approved);
    const prioritizedApprovedTemplates = approvedTemplates.filter(
      (template) =>
        template.source_type === "hr" ||
        template.source_type === "leadership" ||
        template.source_type === "manager" ||
        template.source_type === "system"
    );

    return {
      templates: prioritizedApprovedTemplates.slice(0, 5),
      approvedTemplates,
      unapprovedTemplates,
    };
  } catch (error) {
    if (isMissingCollectionError(error)) {
      return { templates: [], approvedTemplates: [], unapprovedTemplates: [] };
    }

    throw error;
  }
}

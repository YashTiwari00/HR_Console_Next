import { errorResponse, requireAuth } from "@/lib/serverAuth";
import {
  getGoalLibraryTemplates,
  type GoalLibraryInput,
} from "@/lib/services/goalLibraryService";

type SearchPayload = {
  role: unknown;
  department: unknown;
  domain?: unknown;
  query?: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validateInput(payload: unknown): { input?: GoalLibraryInput; error?: string } {
  if (!isObject(payload)) {
    return { error: "Request body must be a JSON object." };
  }

  const body = payload as SearchPayload;
  const role = body.role;
  const department = body.department;
  const domain = body.domain;
  const query = body.query;

  if (typeof role !== "string" || !role.trim()) {
    return { error: "role is required and must be a non-empty string." };
  }

  if (typeof department !== "string" || !department.trim()) {
    return { error: "department is required and must be a non-empty string." };
  }

  if (domain !== undefined && typeof domain !== "string") {
    return { error: "domain must be a string when provided." };
  }

  if (query !== undefined && typeof query !== "string") {
    return { error: "query must be a string when provided." };
  }

  return {
    input: {
      role: role.trim(),
      department: department.trim(),
      ...(typeof domain === "string" ? { domain: domain.trim() } : {}),
      ...(typeof query === "string" ? { query: query.trim() } : {}),
    },
  };
}

export async function POST(request: Request) {
  try {
    await requireAuth(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const validated = validateInput(body);
    if (validated.error) {
      return Response.json({ error: validated.error }, { status: 400 });
    }

    const result = await getGoalLibraryTemplates(validated.input as GoalLibraryInput);

    return Response.json({
      success: true,
      data: result.templates,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

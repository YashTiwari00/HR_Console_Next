type GoalDocument = {
  $id: string;
  parentGoalId?: string;
  title?: string;
  employeeId?: string;
  managerId?: string;
  contributionPercent?: number;
  aopReference?: string | null;
  aopAligned?: boolean;
  [key: string]: unknown;
};

type GetGoalById = (goalId: string) => Promise<GoalDocument | null>;

type LineageOptions = {
  goalsById?: Map<string, GoalDocument>;
  getGoalById?: GetGoalById;
};

export type GoalLineageResult = {
  currentGoal: GoalDocument | null;
  parentGoal: GoalDocument | null;
  rootGoal: GoalDocument | null;
  aopReference: string | null;
  chain: GoalDocument[];
};

function normalizeGoal(input: GoalDocument | null | undefined): GoalDocument | null {
  if (!input || !input.$id) return null;
  return {
    ...input,
    $id: String(input.$id || "").trim(),
    parentGoalId: String(input.parentGoalId || "").trim(),
    title: String(input.title || "").trim(),
    employeeId: String(input.employeeId || "").trim(),
    managerId: String(input.managerId || "").trim(),
    aopReference: input.aopReference ? String(input.aopReference) : null,
  };
}

function pickAopReference(chain: GoalDocument[], rootGoal: GoalDocument | null, parentGoal: GoalDocument | null, currentGoal: GoalDocument | null) {
  const ordered = [rootGoal, parentGoal, currentGoal, ...chain.slice().reverse()];

  for (const candidate of ordered) {
    const reference = String(candidate?.aopReference || "").trim();
    if (reference) return reference;
  }

  return null;
}

async function resolveGoal(goalId: string, options: LineageOptions): Promise<GoalDocument | null> {
  const normalizedId = String(goalId || "").trim();
  if (!normalizedId) return null;

  const fromMap = options.goalsById?.get(normalizedId);
  if (fromMap) return normalizeGoal(fromMap);

  if (options.getGoalById) {
    const fetched = await options.getGoalById(normalizedId);
    return normalizeGoal(fetched);
  }

  return null;
}

export async function getGoalLineage(goalId: string, options: LineageOptions = {}): Promise<GoalLineageResult> {
  const visited = new Set<string>();
  const chain: GoalDocument[] = [];

  const currentGoal = await resolveGoal(goalId, options);
  if (!currentGoal) {
    return {
      currentGoal: null,
      parentGoal: null,
      rootGoal: null,
      aopReference: null,
      chain,
    };
  }

  chain.push(currentGoal);
  visited.add(currentGoal.$id);

  let cursorParentId = String(currentGoal.parentGoalId || "").trim();

  while (cursorParentId && !visited.has(cursorParentId)) {
    visited.add(cursorParentId);

    const parentGoal = await resolveGoal(cursorParentId, options);
    if (!parentGoal) break;

    chain.push(parentGoal);
    cursorParentId = String(parentGoal.parentGoalId || "").trim();
  }

  const parentGoal = chain[1] || null;
  const rootGoal = chain[chain.length - 1] || currentGoal;
  const aopReference = pickAopReference(chain, rootGoal, parentGoal, currentGoal);

  return {
    currentGoal,
    parentGoal,
    rootGoal,
    aopReference,
    chain,
  };
}

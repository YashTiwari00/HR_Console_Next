const GOALS_COLLECTION_ID = process.env.NEXT_PUBLIC_GOALS_COLLECTION_ID || "goals";
const USERS_COLLECTION_ID = process.env.NEXT_PUBLIC_USERS_COLLECTION_ID || "users";
const MAX_DEPTH = 4;
const n = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const p = (v) => Math.max(0, Math.min(100, n(v)));
const w = (v) => Math.max(0, n(v));
const r1 = (v) => Number(n(v).toFixed(1));
const role = (v) => (["manager", "leadership"].includes(String(v || "").toLowerCase()) ? String(v).toLowerCase() : "employee");

/** @param {number} contributionPercent @returns {{badge:"High"|"Medium"|"Low",color:string,bgColor:string}} */
export function computeContributionBadge(contributionPercent) {
  if (n(contributionPercent) >= 30) return { badge: "High", color: "var(--color-success)", bgColor: "var(--color-success-subtle)" };
  if (n(contributionPercent) >= 15) return { badge: "Medium", color: "var(--color-warning)", bgColor: "var(--color-warning-subtle)" };
  return { badge: "Low", color: "var(--color-muted)", bgColor: "var(--color-muted-subtle)" };
}

/** @param {Array<{title?:string,contributionPercent?:number,ownerName?:string}>} lineageChain @returns {string} */
export function buildPlainEnglishSummary(lineageChain) {
  const c = Array.isArray(lineageChain) ? lineageChain : [];
  const leaf = c[0] || {}, parent = c[1] || {}, top = c[c.length - 1] || parent;
  if (c.length <= 1) return `Your goal '${leaf.title || "Untitled goal"}' is a standalone goal for this cycle.`;
  const parentOwnerName = String(parent.ownerName || "their manager").trim() || "their manager";
  return `Your goal '${leaf.title || "Untitled goal"}' contributes ${r1(leaf.contributionPercent || 0)}% to ${parentOwnerName}'s target '${parent.title || "parent goal"}', which is part of the ${top.title || "top-level target"}.`;
}

/**
 * Resolves lineageRef chain recursively (max depth 4) and returns lineage API shaped data.
 * @param {string} goalId @param {object} db @param {string} databaseId @param {object} Query
 * @returns {Promise<{goalId:string,lineage:Array,plainEnglishSummary:string,overallContributionBadge:"High"|"Medium"|"Low"}>}
 */
export async function resolveGoalLineage(goalId, db, databaseId, Query) {
  const id = String(goalId || "").trim();
  const empty = { goalId: id, lineage: [], plainEnglishSummary: "Your goal 'Untitled goal' is a standalone goal for this cycle.", overallContributionBadge: "Low" };
  if (!id) return empty;
  const ownerCache = new Map();
  const getOwner = async (employeeId) => {
    const k = String(employeeId || "").trim();
    if (!k) return { ownerName: "Unknown", ownerRole: "employee" };
    if (ownerCache.has(k)) return ownerCache.get(k);
    const u = await db.getDocument(databaseId, USERS_COLLECTION_ID, k).catch(() => null);
    const v = { ownerName: String(u?.name || u?.email || "Unknown").trim() || "Unknown", ownerRole: role(u?.role) };
    ownerCache.set(k, v);
    return v;
  };
  const root = await db.getDocument(databaseId, GOALS_COLLECTION_ID, id).catch(() => null);
  if (!root) return empty;
  const raw = [root], seen = new Set([id]);
  while (raw.length < MAX_DEPTH) {
    const parentId = String(raw[raw.length - 1]?.lineageRef || "").trim();
    if (!parentId || seen.has(parentId)) break;
    const parent = await db.getDocument(databaseId, GOALS_COLLECTION_ID, parentId).catch(() => null);
    if (!parent) break;
    raw.push(parent); seen.add(parentId);
  }
  const cycleId = String(raw[0]?.cycleId || "").trim();
  const cycleGoals = cycleId
    ? ((await db.listDocuments(databaseId, GOALS_COLLECTION_ID, [Query.equal("cycleId", cycleId), Query.limit(500)]).catch(() => ({ documents: [] })))?.documents || [])
    : [];
  const byId = new Map(cycleGoals.map((g) => [String(g?.$id || "").trim(), g])); raw.forEach((g) => byId.set(String(g?.$id || "").trim(), g));
  const children = new Map();
  cycleGoals.forEach((g) => {
    const pid = String(g?.lineageRef || "").trim(); if (!pid) return;
    const list = children.get(pid) || []; list.push(g); children.set(pid, list);
  });
  const leafIds = (start, v = new Set()) => {
    if (!start || v.has(start)) return []; v.add(start);
    const c = children.get(start) || []; if (!c.length) return [start];
    return c.flatMap((g) => leafIds(String(g?.$id || "").trim(), v));
  };
  const chainProgress = (start) => {
    const leaves = leafIds(start).map((x) => byId.get(x)).filter(Boolean); if (!leaves.length) return 0;
    const agg = leaves.reduce((a, g) => ({ tw: a.tw + w(g?.weightage), wp: a.wp + p(g?.progressPercent) * w(g?.weightage), sp: a.sp + p(g?.progressPercent) }), { tw: 0, wp: 0, sp: 0 });
    return r1(agg.tw > 0 ? agg.wp / agg.tw : agg.sp / leaves.length);
  };
  const lineage = await Promise.all(raw.map(async (g, level) => {
    const parent = raw[level + 1] || null;
    const contributionPercent = parent ? (w(parent?.weightage) > 0 ? r1((w(g?.weightage) / w(parent?.weightage)) * 100) : 0) : 100;
    const owner = await getOwner(g?.employeeId);
    return { level, goalId: String(g?.$id || "").trim(), title: String(g?.title || "").trim(), ownerName: owner.ownerName, ownerRole: owner.ownerRole, weightage: w(g?.weightage), progressPercent: r1(p(g?.progressPercent ?? g?.processPercent)), chainProgressPercent: chainProgress(String(g?.$id || "").trim()), status: String(g?.status || "").trim(), contributionPercent, contributionBadge: computeContributionBadge(contributionPercent).badge, isBusinessTarget: level >= 2 && !String(g?.lineageRef || "").trim() };
  }));
  const top = lineage[lineage.length - 1] || null, leaf = lineage[0] || null;
  const overall = top ? (w(top.weightage) > 0 ? r1((w(leaf?.weightage) / w(top.weightage)) * 100) : n(leaf?.contributionPercent, 100)) : 100;
  return { goalId: id, lineage, plainEnglishSummary: buildPlainEnglishSummary(lineage), overallContributionBadge: computeContributionBadge(overall).badge };
}

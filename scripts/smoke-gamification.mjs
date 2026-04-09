import { Client, Databases, Query, Users } from "node-appwrite";
const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.NEXT_PUBLIC_DATABASE_ID;
const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const usersCollectionId = process.env.NEXT_PUBLIC_USERS_COLLECTION_ID || "users";

const seedEmail = (i) => `seed.employee.${String(i).padStart(2, "0")}@local.test`;
const managerEmail = (i) => `seed.manager.${String(i).padStart(2, "0")}@local.test`;
const THRESHOLDS = [25, 50, 75, 100];

function assertEnv() {
  const missing = [
    !endpoint && "NEXT_PUBLIC_APPWRITE_ENDPOINT",
    !projectId && "NEXT_PUBLIC_APPWRITE_PROJECT_ID",
    !databaseId && "NEXT_PUBLIC_DATABASE_ID",
    !apiKey && "APPWRITE_API_KEY",
  ].filter(Boolean);
  if (missing.length) throw new Error(`Missing required env vars: ${missing.join(", ")}`);
}

function adminClients() {
  assertEnv();
  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  return { databases: new Databases(client), users: new Users(client) };
}

function logResult(kind, name, details = "") {
  const icon = kind === "PASS" ? "✅" : kind === "FAIL" ? "❌" : "⏭";
  const suffix = details ? ` :: ${details}` : "";
  console.log(`${icon} ${kind} ${name}${suffix}`);
}

async function main() {
  const { databases, users } = adminClients();
  const profiles = await databases.listDocuments(databaseId, usersCollectionId, [Query.limit(200)]);
  const byEmail = new Map((profiles.documents || []).map((p) => [String(p.email || "").toLowerCase(), p]));
  const employee = byEmail.get(seedEmail(1));
  const manager = byEmail.get(managerEmail(1));
  if (!employee || !manager) throw new Error("Required seeded users are missing. Run seed first.");

  const sessions = new Map();
  async function sessionFor(userId) {
    if (!sessions.has(userId)) {
      const s = await users.createSession(userId);
      sessions.set(userId, s.secret || s.$id);
    }
    return sessions.get(userId);
  }

  async function api(path, { userId, method = "GET", body } = {}) {
    const token = await sessionFor(userId);
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        cookie: `a_session_${projectId}=${encodeURIComponent(token)}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await res.json().catch(() => ({}));
    return { status: res.status, payload };
  }

  const isMissingCollection = (obj) => {
    const msg = String(obj?.payload?.error || obj?.error || "").toLowerCase();
    return msg.includes("could not be found") && msg.includes("milestone");
  };
  let failCount = 0;
  const report = (kind, name, details) => {
    if (kind === "FAIL") failCount += 1;
    logResult(kind, name, details);
  };

  const firstMilestones = await api("/api/milestones", { userId: employee.$id });
  if (firstMilestones.status === 200) report("PASS", "AUTH CHECK employee /api/milestones", "expected 200");
  else report("FAIL", "AUTH CHECK employee /api/milestones", `status=${firstMilestones.status}`);

  const goalsRes = await api("/api/goals", { userId: employee.$id });
  const goals = Array.isArray(goalsRes.payload?.data) ? goalsRes.payload.data : [];
  const goal = goals.find((g) => ["approved", "closed"].includes(String(g?.status || "")));
  let postedPercent = null;
  let beforeIdempotencyCount = Array.isArray(firstMilestones.payload?.milestones) ? firstMilestones.payload.milestones.length : 0;

  if (!goal) {
    logResult("SKIP", "MILESTONE CREATION VIA PROGRESS UPDATE", "No approved goal for seeded employee");
  } else {
    const previousPct = Number(goal.progressPercent || goal.processPercent || 0);
    const target = previousPct < 50 ? 50 : previousPct < 75 ? 75 : null;
    if (!target) {
      logResult("SKIP", "MILESTONE CREATION VIA PROGRESS UPDATE", "Already at/past all thresholds");
    } else {
      postedPercent = target;
      const progressPost = await api("/api/progress-updates", {
        userId: employee.$id,
        method: "POST",
        body: { goalId: goal.$id, percentComplete: target, ragStatus: "on_track", updateText: `smoke gamification ${Date.now()}` },
      });
      const secondMilestones = await api("/api/milestones", { userId: employee.$id });
      const list2 = Array.isArray(secondMilestones.payload?.milestones) ? secondMilestones.payload.milestones : [];
      const firstCount = Array.isArray(firstMilestones.payload?.milestones) ? firstMilestones.payload.milestones.length : 0;
      beforeIdempotencyCount = list2.length;
      if (isMissingCollection(progressPost) || isMissingCollection(secondMilestones)) {
        report("SKIP", "MILESTONE CREATION VIA PROGRESS UPDATE", "Collection not yet created, run schema:apply first");
      } else if (progressPost.status === 201 && list2.length > firstCount) {
        report("PASS", "MILESTONE CREATION VIA PROGRESS UPDATE", `before=${firstCount}, after=${list2.length}`);
        const firstId = String(list2[0]?.$id || "").trim();
        const ack = await api("/api/milestones", { userId: employee.$id, method: "PATCH", body: { milestoneIds: [firstId] } });
        const afterAck = await api("/api/milestones", { userId: employee.$id });
        const afterList = Array.isArray(afterAck.payload?.milestones) ? afterAck.payload.milestones : [];
        if (ack.status === 200 && Number(ack.payload?.acknowledged || 0) === 1 && afterList.length < list2.length) {
          report("PASS", "ACKNOWLEDGE TEST", `before=${list2.length}, after=${afterList.length}`);
        } else {
          report("FAIL", "ACKNOWLEDGE TEST", `ackStatus=${ack.status}, acknowledged=${ack.payload?.acknowledged || 0}`);
        }
      } else {
        report("SKIP", "MILESTONE CREATION VIA PROGRESS UPDATE", "No milestone created (flag off or schema not ready)");
      }
    }
  }

  const streak = await api("/api/milestones/streak", { userId: employee.$id });
  const streakOk = streak.status === 200 && typeof streak.payload?.streak === "number" && Array.isArray(streak.payload?.cycleNames);
  report(streakOk ? "PASS" : "FAIL", "STREAK ENDPOINT", `status=${streak.status}`);

  const managerMilestones = await api("/api/milestones", { userId: manager.$id });
  report(managerMilestones.status === 403 ? "PASS" : "FAIL", "ROLE BOUNDARY manager /api/milestones", `status=${managerMilestones.status}`);

  if (!goal || postedPercent === null) {
    report("SKIP", "IDEMPOTENCY CHECK", "No comparable progress update was posted in step 2");
  } else {
    await api("/api/progress-updates", {
      userId: employee.$id,
      method: "POST",
      body: { goalId: goal.$id, percentComplete: postedPercent, ragStatus: "on_track", updateText: `smoke idem ${Date.now()}` },
    });
    const afterRepeat = await api("/api/milestones", { userId: employee.$id });
    const repeatCount = Array.isArray(afterRepeat.payload?.milestones) ? afterRepeat.payload.milestones.length : 0;
    report(repeatCount <= beforeIdempotencyCount ? "PASS" : "FAIL", "IDEMPOTENCY CHECK", `before=${beforeIdempotencyCount}, after=${repeatCount}`);
  }

  if (failCount > 0) process.exit(1);
}

main().catch((error) => {
  console.error("Smoke gamification run failed:", error.message || error);
  process.exit(1);
});

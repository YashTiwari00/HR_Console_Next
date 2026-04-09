export const MILESTONE_TYPES = {
  PROGRESS_25: "progress_25",
  PROGRESS_50: "progress_50",
  PROGRESS_75: "progress_75",
  PROGRESS_100: "progress_100",
  CHECKIN_COMPLETED: "checkin_completed",
  STREAK_2: "streak_2",
  STREAK_3: "streak_3",
  STREAK_5: "streak_5",
  STREAK_10: "streak_10",
};

export const MILESTONE_MESSAGES = {
  progress_25: { title: "Great start! 🚀", body: "You've hit 25% on '{goalTitle}'. Keep the momentum going!", emoji: "🚀", color: "info" },
  progress_50: { title: "Halfway there! ⚡", body: "You're 50% done with '{goalTitle}'. You're on track!", emoji: "⚡", color: "primary" },
  progress_75: { title: "Almost there! 🔥", body: "75% complete on '{goalTitle}'. The finish line is in sight.", emoji: "🔥", color: "warning" },
  progress_100: { title: "Goal Achieved! 🏆", body: "You've completed '{goalTitle}'. Outstanding work!", emoji: "🏆", color: "success" },
  checkin_completed: { title: "Check-in done! ✅", body: "Great job completing your check-in. Your progress has been logged.", emoji: "✅", color: "success" },
  streak_2: { title: "On a roll! 🎯", body: "You've completed check-ins for 2 quarters in a row. Keep it up!", emoji: "🎯", color: "primary" },
  streak_3: { title: "3-Quarter Streak! 🌟", body: "Check-ins completed for 3 quarters in a row. You're building great habits!", emoji: "🌟", color: "primary" },
  streak_5: { title: "5-Quarter Legend! 🏅", body: "5 consecutive quarters of check-ins. You are a performance champion!", emoji: "🏅", color: "success" },
  streak_10: { title: "10-Quarter Icon! 👑", body: "10 quarters of consistent check-ins. Truly exceptional dedication.", emoji: "👑", color: "success" },
};

async function listAllDocuments({ db, databaseId, collectionId, Query, queries }) {
  const pageSize = 100;
  const rows = [];
  let offset = 0;
  while (true) {
    const response = await db.listDocuments(databaseId, collectionId, [
      ...(queries || []),
      Query.limit(pageSize),
      Query.offset(offset),
    ]);
    const docs = response?.documents || [];
    rows.push(...docs);
    if (docs.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

/**
 * Deduplicates and creates a milestone event record.
 */
export async function checkAndCreateMilestone({ db, databaseId, milestoneEventsCollectionId, ID, Query, userId, milestoneType, referenceId, cycleId, cycleStreak }) {
  try {
    const existingResult = await db.listDocuments(databaseId, milestoneEventsCollectionId, [
      Query.equal("userId", String(userId || "").trim()),
      Query.equal("milestoneType", String(milestoneType || "").trim()),
      Query.equal("referenceId", String(referenceId || "").trim()),
      Query.limit(1),
    ]);
    const existing = existingResult?.documents?.[0] || null;
    if (existing) return { created: false, existing };
    const milestone = await db.createDocument(databaseId, milestoneEventsCollectionId, ID.unique(), {
      userId: String(userId || "").trim(),
      milestoneType: String(milestoneType || "").trim(),
      referenceId: String(referenceId || "").trim(),
      cycleId: String(cycleId || "").trim() || undefined,
      cycleStreak: Number.isInteger(Number(cycleStreak)) ? Number(cycleStreak) : undefined,
      triggeredAt: new Date().toISOString(),
      acknowledged: false,
    });
    return { created: true, milestone };
  } catch (error) {
    console.warn("[milestones] checkAndCreateMilestone failed:", error?.message || error);
    return { created: false, error };
  }
}

/**
 * Returns up to 10 most recent unacknowledged milestones for a user.
 */
export async function getUnacknowledgedMilestones({ db, databaseId, milestoneEventsCollectionId, Query, userId }) {
  try {
    const result = await db.listDocuments(databaseId, milestoneEventsCollectionId, [
      Query.equal("userId", String(userId || "").trim()),
      Query.equal("acknowledged", false),
      Query.orderDesc("triggeredAt"),
      Query.limit(10),
    ]);
    return result?.documents || [];
  } catch (error) {
    console.warn("[milestones] getUnacknowledgedMilestones failed:", error?.message || error);
    return [];
  }
}

/**
 * Marks a milestone as acknowledged.
 */
export async function acknowledgeMilestone({ db, databaseId, milestoneEventsCollectionId, milestoneId }) {
  try {
    await db.updateDocument(databaseId, milestoneEventsCollectionId, String(milestoneId || "").trim(), {
      acknowledged: true,
    });
    return { success: true };
  } catch (error) {
    console.warn("[milestones] acknowledgeMilestone failed:", error?.message || error);
    return { success: false, error };
  }
}

/**
 * Computes consecutive closed-cycle check-in streak for a user.
 */
export async function computeCheckInStreak({ db, databaseId, checkInsCollectionId, cyclesCollectionId, Query, userId }) {
  try {
    const [completedCheckIns, closedCycles] = await Promise.all([
      listAllDocuments({
        db,
        databaseId,
        collectionId: checkInsCollectionId,
        Query,
        queries: [
          Query.equal("employeeId", String(userId || "").trim()),
          Query.equal("status", "completed"),
          Query.orderDesc("createdAt"),
        ],
      }),
      listAllDocuments({
        db,
        databaseId,
        collectionId: cyclesCollectionId,
        Query,
        queries: [Query.equal("state", "closed"), Query.orderDesc("endDate")],
      }),
    ]);
    const checkInDates = (completedCheckIns || [])
      .map((item) => {
        const raw = item?.scheduledAt || item?.createdAt || item?.$createdAt || null;
        const time = new Date(raw || "").getTime();
        return Number.isNaN(time) ? null : time;
      })
      .filter((value) => typeof value === "number");
    const cycleNames = [];
    let streak = 0;
    for (const cycle of closedCycles || []) {
      const start = new Date(cycle?.startDate || "").getTime();
      const end = new Date(cycle?.endDate || "").getTime();
      if (Number.isNaN(start) || Number.isNaN(end)) continue;
      const hasCycleCheckIn = checkInDates.some((ts) => ts >= start && ts <= end);
      if (!hasCycleCheckIn) break;
      streak += 1;
      cycleNames.push(String(cycle?.name || cycle?.$id || "").trim());
    }
    const cappedStreak = Math.min(streak, 10);
    return { streak: cappedStreak, cycleNames: cycleNames.slice(0, cappedStreak) };
  } catch (error) {
    console.warn("[milestones] computeCheckInStreak failed:", error?.message || error);
    return { streak: 0, cycleNames: [] };
  }
}

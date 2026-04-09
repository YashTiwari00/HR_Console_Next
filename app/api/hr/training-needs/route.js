import { NextResponse } from "next/server";

import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { requireAuth } from "@/lib/serverAuth";

const PAGE_SIZE = 200;

function deriveRatingLabel(goal) {
  const existing = String(goal?.managerFinalRatingLabel || "").trim();
  if (existing) return existing;

  const numeric = Number(goal?.managerFinalRating);
  if (numeric === 1) return "NI";
  if (numeric === 2) return "SME";
  return "";
}

async function fetchWeakGoals(databases, { cycleId, managerId }) {
  const goals = [];
  let offset = 0;

  while (true) {
    const queries = [
      Query.or([
        Query.equal("managerFinalRating", 1),
        Query.equal("managerFinalRating", 2),
      ]),
      Query.equal("ratingVisibleToEmployee", true),
      Query.limit(PAGE_SIZE),
      Query.offset(offset),
    ];

    if (cycleId) {
      queries.push(Query.equal("cycleId", cycleId));
    }

    if (managerId) {
      queries.push(Query.equal("managerId", managerId));
    }

    const result = await databases.listDocuments(
      databaseId,
      appwriteConfig.goalsCollectionId,
      queries
    );

    const rows = Array.isArray(result?.documents) ? result.documents : [];
    goals.push(...rows);

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return goals;
}

async function fetchEmployeeSummary(databases, employeeId) {
  try {
    const user = await databases.getDocument(
      databaseId,
      appwriteConfig.usersCollectionId,
      employeeId
    );

    const employeeName = String(user?.name || "").trim() || "Unknown";
    const department = String(user?.department || "").trim() || "—";

    return { employeeName, department };
  } catch {
    return { employeeName: "Unknown", department: "—" };
  }
}

export async function GET(request) {
  const authContext = await requireAuth(request);
  const { profile } = authContext;
  if (profile.role !== "hr") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { databases } = authContext;

  const { searchParams } = new URL(request.url);
  const cycleId = String(searchParams.get("cycleId") || "").trim();
  const managerId = String(searchParams.get("managerId") || "").trim();

  let goals = [];

  try {
    goals = await fetchWeakGoals(databases, {
      cycleId,
      managerId,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch training needs goals." },
      { status: 500 }
    );
  }

  const grouped = new Map();
  let totalWeakGoals = 0;

  for (const goal of goals) {
    const employeeId = String(goal?.employeeId || "").trim();
    if (!employeeId) continue;

    if (!grouped.has(employeeId)) {
      grouped.set(employeeId, {
        employeeId,
        employeeName: "Unknown",
        department: "—",
        weakGoals: [],
      });
    }

    grouped.get(employeeId).weakGoals.push({
      goalId: goal?.$id || "",
      title: String(goal?.title || ""),
      frameworkType: String(goal?.frameworkType || ""),
      managerFinalRatingLabel: deriveRatingLabel(goal),
      cycleId: String(goal?.cycleId || ""),
    });

    totalWeakGoals += 1;
  }

  const data = Array.from(grouped.values());

  await Promise.all(
    data.map(async (employee) => {
      const summary = await fetchEmployeeSummary(databases, employee.employeeId);
      employee.employeeName = summary.employeeName;
      employee.department = summary.department;
    })
  );

  return NextResponse.json({
    data,
    meta: {
      totalEmployees: data.length,
      totalWeakGoals,
      cycleId: cycleId || null,
    },
  });
}
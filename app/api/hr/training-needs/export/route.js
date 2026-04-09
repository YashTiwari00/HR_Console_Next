import { NextResponse } from "next/server";

import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { requireAuth, requireRole } from "@/lib/serverAuth";

const PAGE_SIZE = 200;

const TRAINING_CATEGORY_MAP = {
  communication: "Communication & Presentation Skills",
  leadership: "Leadership & People Management",
  data: "Data Analysis & Reporting",
  technical: "Technical Skills Development",
  process: "Process Improvement & Lean",
  customer: "Customer Success & CX",
  sales: "Sales & Negotiation",
  finance: "Financial Acumen",
  product: "Product Thinking & Agile",
  default: "Professional Development (General)",
};

function normalizeText(value) {
  return String(value || "").trim();
}

function deriveRatingLabel(goal) {
  const existing = normalizeText(goal?.managerFinalRatingLabel);
  if (existing) return existing;

  const numeric = Number(goal?.managerFinalRating);
  if (numeric === 1) return "NI";
  if (numeric === 2) return "SME";
  return "";
}

function deriveTrainingCategory(title) {
  const normalized = normalizeText(title).toLowerCase();

  for (const keyword of Object.keys(TRAINING_CATEGORY_MAP)) {
    if (keyword === "default") continue;
    if (normalized.includes(keyword)) {
      return TRAINING_CATEGORY_MAP[keyword];
    }
  }

  return TRAINING_CATEGORY_MAP.default;
}

function csvEscape(value) {
  const text = String(value ?? "");
  const escaped = text.replace(/"/g, '""');
  return `"${escaped}"`;
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

    return {
      employeeName: normalizeText(user?.name) || "Unknown",
      department: normalizeText(user?.department) || "-",
    };
  } catch {
    return {
      employeeName: "Unknown",
      department: "-",
    };
  }
}

export async function GET(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    const { searchParams } = new URL(request.url);
    const cycleId = normalizeText(searchParams.get("cycleId"));
    const managerId = normalizeText(searchParams.get("managerId"));

    const goals = await fetchWeakGoals(databases, { cycleId, managerId });

    const employeeIds = Array.from(
      new Set(
        goals
          .map((goal) => normalizeText(goal?.employeeId))
          .filter(Boolean)
      )
    );

    const employeeMap = new Map();
    await Promise.all(
      employeeIds.map(async (employeeId) => {
        const summary = await fetchEmployeeSummary(databases, employeeId);
        employeeMap.set(employeeId, summary);
      })
    );

    const lines = [];
    lines.push(
      [
        "Employee Name",
        "Department",
        "Cycle",
        "Weak Goal Title",
        "Rating",
        "Suggested Training Area",
      ]
        .map(csvEscape)
        .join(",")
    );

    for (const goal of goals) {
      const employeeId = normalizeText(goal?.employeeId);
      const summary = employeeMap.get(employeeId) || {
        employeeName: "Unknown",
        department: "-",
      };

      const title = normalizeText(goal?.title);
      const rating = deriveRatingLabel(goal);
      const rowCycleId = normalizeText(goal?.cycleId) || cycleId;

      lines.push(
        [
          summary.employeeName,
          summary.department,
          rowCycleId,
          title,
          rating,
          deriveTrainingCategory(title),
        ]
          .map(csvEscape)
          .join(",")
      );
    }

    const csv = `${lines.join("\n")}\n`;
    const datePart = new Date().toISOString().slice(0, 10);
    const cyclePart = cycleId || "all";
    const fileName = `training-needs-${cyclePart}-${datePart}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    const status = error?.statusCode || 500;
    const message = error?.message || "Unexpected server error.";
    return NextResponse.json({ error: message }, { status });
  }
}

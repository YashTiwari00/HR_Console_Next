/**
 * Migration: backfill manager_assignments from existing users.managerId
 *
 * Run: node scripts/migrate-dual-reporting.mjs --apply
 * Dry run (no writes): node scripts/migrate-dual-reporting.mjs
 */

import { Client, Databases, ID, Query } from "node-appwrite";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const apply = process.argv.includes("--apply");

const client = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const databaseId = process.env.NEXT_PUBLIC_DATABASE_ID;
const usersCollectionId = process.env.NEXT_PUBLIC_USERS_COLLECTION_ID || "users";
const managerAssignmentsCollectionId =
  process.env.NEXT_PUBLIC_MANAGER_ASSIGNMENTS_COLLECTION_ID || "manager_assignments";

async function fetchAllEmployees() {
  const all = [];
  let cursor = null;

  while (true) {
    const queries = [
      Query.equal("role", "employee"),
      Query.limit(100),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    const result = await databases.listDocuments(databaseId, usersCollectionId, queries);
    all.push(...result.documents);

    if (result.documents.length < 100) break;
    cursor = result.documents[result.documents.length - 1].$id;
  }

  return all;
}

async function getExistingAssignment(employeeId, managerId) {
  try {
    const result = await databases.listDocuments(
      databaseId,
      managerAssignmentsCollectionId,
      [
        Query.equal("employeeId", employeeId),
        Query.equal("managerId", managerId),
        Query.limit(1),
      ]
    );
    return result.documents[0] || null;
  } catch {
    return null;
  }
}

async function main() {
  console.log(`Mode: ${apply ? "APPLY (writes enabled)" : "DRY RUN (no writes)"}`);
  console.log("Fetching all employees...");

  const employees = await fetchAllEmployees();
  console.log(`Found ${employees.length} employee(s).`);

  let skipped = 0;
  let created = 0;
  let noManager = 0;

  for (const emp of employees) {
    const managerId = String(emp.managerId || "").trim();

    if (!managerId) {
      noManager++;
      console.log(`  [SKIP] ${emp.name || emp.$id} — no managerId set`);
      continue;
    }

    const existing = await getExistingAssignment(emp.$id, managerId);
    if (existing) {
      skipped++;
      console.log(`  [SKIP] ${emp.name || emp.$id} — assignment already exists`);
      continue;
    }

    const doc = {
      employeeId: emp.$id,
      managerId,
      weightPercent: 100,
      isPrimary: true,
      assignedAt: emp.managerAssignedAt || new Date().toISOString(),
      assignedBy: emp.managerAssignedBy || "migration",
      effectiveFrom: null,
      notes: "Backfilled from users.managerId",
    };

    if (apply) {
      await databases.createDocument(
        databaseId,
        managerAssignmentsCollectionId,
        ID.unique(),
        doc
      );
      console.log(`  [CREATE] ${emp.name || emp.$id} → manager ${managerId} (100%)`);
    } else {
      console.log(`  [DRY] Would create: ${emp.name || emp.$id} → manager ${managerId} (100%)`);
    }

    created++;
  }

  console.log("\n--- Summary ---");
  console.log(`Total employees: ${employees.length}`);
  console.log(`No manager set:  ${noManager}`);
  console.log(`Already exists:  ${skipped}`);
  console.log(`${apply ? "Created" : "Would create"}: ${created}`);
  if (!apply) {
    console.log("\nRe-run with --apply to write changes.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

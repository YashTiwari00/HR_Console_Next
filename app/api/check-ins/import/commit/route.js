import { NextResponse } from "next/server";
import { IMPORT_JOB_STATUSES } from "@/lib/appwriteSchema";
import { requireAuth, requireRole } from "@/lib/serverAuth";
import {
  commitImportRows,
  createImportJob,
  findCommittedImportByIdempotency,
  previewImportRows,
} from "../_lib/service";

function normalizedIdempotencyKey(request, body) {
  const fromHeader = String(request.headers.get("x-idempotency-key") || "").trim();
  const fromBody = String(body?.idempotencyKey || "").trim();
  return fromHeader || fromBody;
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee"]);
    const body = await request.json().catch(() => ({}));

    const rows = Array.isArray(body?.rows) ? body.rows : [];
    const idempotencyKey = normalizedIdempotencyKey(request, body);

    if (!idempotencyKey) {
      return NextResponse.json(
        { error: "x-idempotency-key header (or idempotencyKey body field) is required" },
        { status: 400 }
      );
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: "rows payload is required" }, { status: 400 });
    }

    const existing = await findCommittedImportByIdempotency(databases, profile.$id, idempotencyKey);
    if (existing) {
      let parsedReport = null;
      try {
        parsedReport = existing.reportJson ? JSON.parse(existing.reportJson) : null;
      } catch {
        parsedReport = null;
      }

      return NextResponse.json(
        {
          ok: true,
          replayed: true,
          importJobId: existing.$id,
          status: existing.status,
          summary: parsedReport?.commit || null,
        },
        { status: 200 }
      );
    }

    const preview = await previewImportRows({ databases, profile, rows });
    const commitResult = await commitImportRows({ databases, profile, previewResult: preview });

    const status =
      commitResult.failedRows === 0
        ? IMPORT_JOB_STATUSES.COMMITTED
        : commitResult.successRows > 0
        ? IMPORT_JOB_STATUSES.PREVIEWED
        : IMPORT_JOB_STATUSES.FAILED;

    const importJob = await createImportJob({
      databases,
      profile,
      idempotencyKey,
      status,
      templateVersion: String(body?.templateVersion || "checkin-v1"),
      previewResult: preview,
      commitResult,
    });

    return NextResponse.json(
      {
        ok: true,
        replayed: false,
        importJobId: importJob.$id,
        status,
        summary: commitResult,
      },
      { status: status === IMPORT_JOB_STATUSES.FAILED ? 422 : 200 }
    );
  } catch (error) {
    const status = Number(error?.status || 500);
    const message = String(error?.message || "Commit failed");
    return NextResponse.json({ error: message }, { status });
  }
}

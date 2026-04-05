import { NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/serverAuth";
import { previewImportRows } from "../_lib/service";

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee"]);
    const body = await request.json().catch(() => ({}));

    const rows = Array.isArray(body?.rows) ? body.rows : [];

    if (rows.length === 0) {
      return NextResponse.json({ error: "rows payload is required" }, { status: 400 });
    }

    const preview = await previewImportRows({
      databases,
      profile,
      rows,
    });

    return NextResponse.json(
      {
        ok: true,
        role: profile.role,
        totalRows: preview.totalRows,
        validRows: preview.validRows,
        invalidRows: preview.invalidRows,
        rows: preview.previewRows,
      },
      { status: 200 }
    );
  } catch (error) {
    const status = Number(error?.status || 500);
    const message = String(error?.message || "Preview failed");
    return NextResponse.json({ error: message }, { status });
  }
}

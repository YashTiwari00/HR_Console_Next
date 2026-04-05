import { NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/serverAuth";
import { getImportTemplateCsv, getTemplateColumns } from "../_lib/service";

export async function GET(request) {
  try {
    const { profile } = await requireAuth(request);
    requireRole(profile, ["employee"]);

    const csv = getImportTemplateCsv();
    const filename = `checkin-import-template-${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename=${filename}`,
        "x-template-columns": JSON.stringify(getTemplateColumns()),
      },
    });
  } catch (error) {
    const status = Number(error?.status || 500);
    const message = String(error?.message || "Template generation failed");
    return NextResponse.json({ error: message }, { status });
  }
}

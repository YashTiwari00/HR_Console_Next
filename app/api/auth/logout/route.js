import { clearSessionCookie } from "@/lib/auth/session";
import { createSessionAccount } from "@/lib/appwriteServer";
import { NextResponse } from "next/server";

export async function POST(request) {
  const response = NextResponse.json({ data: { ok: true } });

  try {
    const session = request.cookies.get("appwrite_session")?.value;
    if (session) {
      const account = createSessionAccount(session);
      await account.deleteSession("current");
    }
  } catch {
    // Ignore revoke errors and clear local session cookie regardless.
  }

  clearSessionCookie(response);
  return response;
}

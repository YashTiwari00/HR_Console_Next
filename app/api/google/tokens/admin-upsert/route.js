import { upsertGoogleToken } from "@/lib/googleTokens";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";
import { assertManagerCanAccessEmployee } from "@/lib/teamAccess";

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["manager", "hr"]);

    const body = await request.json().catch(() => ({}));
    const targetUserId = String(body?.targetUserId || "").trim();

    if (!targetUserId) {
      return Response.json({ error: "targetUserId is required." }, { status: 400 });
    }

    if (profile.role === "manager" && targetUserId !== profile.$id) {
      await assertManagerCanAccessEmployee(databases, profile.$id, targetUserId);
    }

    const saved = await upsertGoogleToken(databases, {
      userId: targetUserId,
      email: String(body?.email || "").trim(),
      accessToken: body?.accessToken,
      refreshToken: body?.refreshToken,
      expiry: body?.expiry,
      scope: body?.scope,
      provider: "google",
    });

    return Response.json({
      data: {
        $id: saved.$id,
        userId: saved.userId,
        email: saved.email,
        expiry: saved.expiry,
        provider: saved.provider,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

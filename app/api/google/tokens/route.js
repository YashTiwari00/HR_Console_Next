import { upsertGoogleToken } from "@/lib/googleTokens";
import { errorResponse, requireAuth } from "@/lib/serverAuth";

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    const body = await request.json().catch(() => ({}));

    const saved = await upsertGoogleToken(databases, {
      userId: profile.$id,
      email: String(body?.email || profile?.email || "").trim(),
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

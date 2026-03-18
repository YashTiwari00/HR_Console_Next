import { appwriteConfig } from "@/lib/appwrite";
import { normalizeRole } from "@/lib/auth/roles";
import { databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";

export async function PATCH(request, context) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["hr"]);

    const params = await context.params;
    const userId = String(params?.userId || "").trim();

    if (!userId) {
      return Response.json({ error: "userId is required." }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const nextRole = normalizeRole(body?.role);

    if (!nextRole) {
      return Response.json({ error: "A valid role is required." }, { status: 400 });
    }

    const currentProfile = await databases
      .getDocument(databaseId, appwriteConfig.usersCollectionId, userId)
      .catch(() => null);

    if (!currentProfile) {
      return Response.json({ error: "User profile was not found." }, { status: 404 });
    }

    const previousRole = normalizeRole(currentProfile.role);

    if (previousRole === nextRole) {
      return Response.json({
        data: {
          userId,
          previousRole,
          role: nextRole,
          changed: false,
        },
      });
    }

    const updated = await databases.updateDocument(
      databaseId,
      appwriteConfig.usersCollectionId,
      userId,
      {
        role: nextRole,
      }
    );

    return Response.json({
      data: {
        userId,
        previousRole,
        role: normalizeRole(updated.role),
        changed: true,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
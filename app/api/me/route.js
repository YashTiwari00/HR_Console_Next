import { errorResponse, requireAuth } from "@/lib/serverAuth";

export async function GET(request) {
  try {
    const { user, profile } = await requireAuth(request);

    return Response.json({
      data: {
        user: {
          $id: user.$id,
          name: user.name,
          email: user.email,
        },
        profile,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

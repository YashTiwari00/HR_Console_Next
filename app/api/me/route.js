import { errorResponse, requireSessionAuth } from "@/lib/serverAuth";

export async function GET(request) {
  try {
    const { user, profile } = await requireSessionAuth(request);

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

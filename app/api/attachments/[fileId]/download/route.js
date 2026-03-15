import { appwriteConfig } from "@/lib/appwrite";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";

export async function GET(request, context) {
  try {
    const { storage, profile } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "hr"]);

    const params = await context.params;
    const fileId = params.fileId;

    const fileMeta = await storage.getFile(appwriteConfig.attachmentsBucketId, fileId);
    const fileData = await storage.getFileDownload(appwriteConfig.attachmentsBucketId, fileId);

    const bytes =
      fileData instanceof ArrayBuffer
        ? new Uint8Array(fileData)
        : fileData instanceof Uint8Array
        ? fileData
        : new Uint8Array(Buffer.from(fileData));

    return new Response(bytes, {
      headers: {
        "Content-Type": fileMeta.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename=\"${fileMeta.name || fileId}\"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

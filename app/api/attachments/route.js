import { appwriteConfig } from "@/lib/appwrite";
import { ID, InputFile } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "application/pdf",
  "message/rfc822",
];

export async function POST(request) {
  try {
    const { profile, storage } = await requireAuth(request);
    requireRole(profile, ["employee", "manager", "hr"]);

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return Response.json({ error: "File is required." }, { status: 400 });
    }

    if (typeof file.arrayBuffer !== "function") {
      return Response.json({ error: "Invalid file payload." }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return Response.json(
        { error: "Unsupported file type. Allowed: png, jpg, pdf, email." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return Response.json({ error: "File exceeds 10MB size limit." }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const inputFile = InputFile.fromBuffer(bytes, file.name);

    const stored = await storage.createFile(
      appwriteConfig.attachmentsBucketId,
      ID.unique(),
      inputFile
    );

    return Response.json(
      {
        data: {
          fileId: stored.$id,
          bucketId: stored.bucketId,
          name: stored.name,
          mimeType: stored.mimeType,
          sizeOriginal: stored.sizeOriginal,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

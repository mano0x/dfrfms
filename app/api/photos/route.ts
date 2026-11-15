import { ID } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { adminServices } from "@/lib/appwrite/server";
import { PHOTO_BUCKET_ID } from "@/lib/appwrite/config";
import { MAX_UPLOAD_BYTES, detectImageType, photoFileName, validateUpload } from "@/lib/image-rules";
import { HttpError, handle, ok } from "@/lib/server/http";
import { requireCaller } from "@/lib/server/session";

/**
 * Upload a fault photo. Residents only. The file is checked by its content
 * (not its name), stored in the private bucket with no browser access, and
 * named after its uploader so it can only be attached to that resident's
 * own report. Returns the file ID to send with the report.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const guard = await requireCaller(request, ["student"]);
    if (guard.response) return guard.response;

    // Refuse oversized bodies before reading them into memory.
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_UPLOAD_BYTES + 64 * 1024) throw new HttpError(413, "The photo is too large. It must be 4 MB or smaller after resizing.");

    let file: FormDataEntryValue | null;
    try {
      file = (await request.formData()).get("photo");
    } catch {
      throw new HttpError(400, "Send the photo as a form upload.");
    }
    if (!file || typeof file === "string") throw new HttpError(400, "No photo was sent.");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const problem = validateUpload(bytes);
    if (problem) throw new HttpError(bytes.length > MAX_UPLOAD_BYTES ? 413 : 400, problem);

    const type = detectImageType(bytes)!;
    const fileId = ID.unique();
    await adminServices().storage.createFile({
      bucketId: PHOTO_BUCKET_ID,
      fileId,
      file: InputFile.fromBuffer(bytes, photoFileName(guard.caller.id, type.extension)),
      permissions: [], // no direct access for anyone; photos are served by /api/photos/[id]
    });
    return ok({ photoFileId: fileId }, 201);
  });
}

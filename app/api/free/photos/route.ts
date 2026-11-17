import { ID } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { adminServices } from "@/lib/appwrite/server";
import { FREE_PHOTO_BUCKET_ID } from "@/lib/appwrite/config";
import { MAX_UPLOAD_BYTES, detectImageType, photoFileName, validateUpload } from "@/lib/image-rules";
import { HttpError, handle, ok } from "@/lib/server/http";
import { requireCaller } from "@/lib/server/session";

/**
 * Upload a photo of a free item. Residents only. The same checks as for
 * fault photos: the type is decided from the content, the size is limited,
 * and the file is stored in a private bucket under a name that records its
 * uploader, so it can only be attached to that resident's own listing.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const guard = await requireCaller(request, ["student"]);
    if (guard.response) return guard.response;

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

    const fileId = ID.unique();
    await adminServices().storage.createFile({
      bucketId: FREE_PHOTO_BUCKET_ID,
      fileId,
      file: InputFile.fromBuffer(bytes, photoFileName(guard.caller.id, detectImageType(bytes)!.extension)),
      permissions: [], // served only through /api/free/photos/[id]
    });
    return ok({ photoFileId: fileId }, 201);
  });
}

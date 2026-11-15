import { adminServices } from "@/lib/appwrite/server";
import { PHOTO_BUCKET_ID } from "@/lib/appwrite/config";
import { detectImageType } from "@/lib/image-rules";
import { HttpError, handle } from "@/lib/server/http";
import { requireCaller } from "@/lib/server/session";
import { reportForPhoto } from "@/lib/server/reports";

/**
 * Show a fault photo. A photo is visible exactly to those who may see the
 * report it is attached to: the resident who reported it and staff.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const guard = await requireCaller(request, ["student", "technician", "admin"]);
    if (guard.response) return guard.response;
    const { id } = await params;

    await reportForPhoto(guard.caller, id); // throws "not found" when the caller may not see it

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await adminServices().storage.getFileView({ bucketId: PHOTO_BUCKET_ID, fileId: id }));
    } catch {
      throw new HttpError(404, "Photo not found.");
    }
    const type = detectImageType(bytes);
    if (!type) throw new HttpError(404, "Photo not found.");

    return new Response(bytes as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": type.mime,
        "Content-Length": String(bytes.length),
        // Private: only this user's browser may keep a copy. nosniff: the
        // browser must treat the content as the declared image type.
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      },
    });
  });
}

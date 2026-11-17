import { adminServices } from "@/lib/appwrite/server";
import { FREE_PHOTO_BUCKET_ID } from "@/lib/appwrite/config";
import { detectImageType } from "@/lib/image-rules";
import { HttpError, handle } from "@/lib/server/http";
import { requireCaller } from "@/lib/server/session";
import { authorisePhoto } from "@/lib/server/sharing";

/** Show a free item's photo to those who may see the listing it belongs to. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const guard = await requireCaller(request, ["student", "admin"]);
    if (guard.response) return guard.response;
    const { id } = await params;
    if (!/^[A-Za-z0-9._-]{1,36}$/.test(id)) throw new HttpError(404, "Photo not found.");

    await authorisePhoto(guard.caller, id); // "not found" when the caller may not see the listing

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await adminServices().storage.getFileView({ bucketId: FREE_PHOTO_BUCKET_ID, fileId: id }));
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
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      },
    });
  });
}

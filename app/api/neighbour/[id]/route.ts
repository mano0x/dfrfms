import { HttpError, handle, ok, readJson } from "@/lib/server/http";
import { requireCaller } from "@/lib/server/session";
import { moderateNotice } from "@/lib/server/neighbour";

type Context = { params: Promise<{ id: string }> };

/**
 * Moderate a notice. Administrators only. The body names one action:
 *   { action: "status", status } | { action: "publish" } | { action: "unpublish" }
 *   { action: "remove", reason } | { action: "respond", response }
 */
export async function PATCH(request: Request, { params }: Context) {
  return handle(async () => {
    const guard = await requireCaller(request, ["admin"]);
    if (guard.response) return guard.response;
    const body = (await readJson(request)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") throw new HttpError(400, "Invalid request.");
    return ok({ notice: await moderateNotice(guard.caller, (await params).id, body) });
  });
}

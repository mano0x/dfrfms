import { handle, ok } from "@/lib/server/http";
import { requireCaller } from "@/lib/server/session";
import { listModeration } from "@/lib/server/neighbour";

type Context = { params: Promise<{ id: string }> };

/** The moderation log of a notice. Administrators only. */
export async function GET(request: Request, { params }: Context) {
  return handle(async () => {
    const guard = await requireCaller(request, ["admin"]);
    if (guard.response) return guard.response;
    return ok({ actions: await listModeration(guard.caller, (await params).id) });
  });
}

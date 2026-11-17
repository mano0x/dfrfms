import { handle, ok, readJson } from "@/lib/server/http";
import { requireCaller } from "@/lib/server/session";
import { revealSender } from "@/lib/server/neighbour";

type Context = { params: Promise<{ id: string }> };

/**
 * Show who sent a notice. Administrators only; a reason is required and the
 * request is recorded in the moderation log. POST, because it writes a record.
 */
export async function POST(request: Request, { params }: Context) {
  return handle(async () => {
    const guard = await requireCaller(request, ["admin"]);
    if (guard.response) return guard.response;
    const body = (await readJson(request)) as Record<string, unknown> | null;
    return ok({ sender: await revealSender(guard.caller, (await params).id, body) });
  });
}

import { handle, ok } from "@/lib/server/http";
import { requireCaller } from "@/lib/server/session";
import { listHistory } from "@/lib/server/reports";

/** The history of one report, oldest first. Same visibility as the report itself. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const guard = await requireCaller(request, ["student", "technician", "admin"]);
    if (guard.response) return guard.response;
    return ok({ history: await listHistory(guard.caller, (await params).id) });
  });
}

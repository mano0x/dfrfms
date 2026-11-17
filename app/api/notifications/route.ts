import { HttpError, handle, ok, readJson } from "@/lib/server/http";
import { requireCaller } from "@/lib/server/session";
import { listNotifications, markAllRead, markRead } from "@/lib/server/notifications";

const EVERYONE = ["student", "technician", "admin"] as const;

/** The caller's own notifications and the number that are unread. */
export async function GET(request: Request) {
  return handle(async () => {
    const guard = await requireCaller(request, EVERYONE);
    if (guard.response) return guard.response;
    return ok(await listNotifications(guard.caller));
  });
}

/** Mark as read: { id } for one notification, or { all: true }. Only the caller's own. */
export async function PATCH(request: Request) {
  return handle(async () => {
    const guard = await requireCaller(request, EVERYONE);
    if (guard.response) return guard.response;
    const body = (await readJson(request)) as Record<string, unknown> | null;
    if (body?.all === true) await markAllRead(guard.caller);
    else if (typeof body?.id === "string" && /^[A-Za-z0-9._-]{1,36}$/.test(body.id)) await markRead(guard.caller, body.id);
    else throw new HttpError(400, "Invalid request.");
    return ok(await listNotifications(guard.caller));
  });
}

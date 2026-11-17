import { HttpError, handle, ok, readJson } from "@/lib/server/http";
import { requireCaller } from "@/lib/server/session";
import {
  cancelReservation, confirmHandover, dismissReports, editListing, removeListing, reportListing, reserveListing, withdrawListing,
} from "@/lib/server/sharing";

type Context = { params: Promise<{ id: string }> };

/**
 * Act on a free item. The body names one action; each has its own rule in
 * lib/sharing.ts, checked here on the server:
 *   { action: "edit", ...fields }       owner, while nobody holds the item
 *   { action: "withdraw" }              owner, until the item is collected
 *   { action: "reserve" }               another resident of the same dormitory
 *   { action: "cancel" }                the reserver, or the owner
 *   { action: "handover" }              owner, while the item is reserved
 *   { action: "report", reason }        another resident
 *   { action: "remove", reason }        administrator
 *   { action: "dismiss-reports" }       administrator
 */
export async function PATCH(request: Request, { params }: Context) {
  return handle(async () => {
    const guard = await requireCaller(request, ["student", "admin"]);
    if (guard.response) return guard.response;
    const { caller } = guard;
    const { id } = await params;
    const body = (await readJson(request)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") throw new HttpError(400, "Invalid request.");

    switch (body.action) {
      case "edit":
        return ok({ listing: await editListing(caller, id, body) });
      case "withdraw":
        return ok({ listing: await withdrawListing(caller, id) });
      case "reserve":
        return ok({ listing: await reserveListing(caller, id) });
      case "cancel":
        return ok({ listing: await cancelReservation(caller, id) });
      case "handover":
        return ok({ listing: await confirmHandover(caller, id) });
      case "report":
        await reportListing(caller, id, body.reason);
        return ok();
      case "remove":
        return ok({ listing: await removeListing(caller, id, body.reason) });
      case "dismiss-reports":
        return ok({ listing: await dismissReports(caller, id) });
      default:
        throw new HttpError(400, "Unknown action.");
    }
  });
}

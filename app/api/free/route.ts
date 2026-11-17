import { handle, ok, readJson } from "@/lib/server/http";
import { requireCaller } from "@/lib/server/session";
import { createListing, listListings } from "@/lib/server/sharing";

/**
 * Free items the caller may see: for a resident, the items of their own
 * dormitory plus their own listings and reservations; for an administrator,
 * everything with open reports and totals. Technicians have no access.
 */
export async function GET(request: Request) {
  return handle(async () => {
    const guard = await requireCaller(request, ["student", "admin"]);
    if (guard.response) return guard.response;
    return ok(await listListings(guard.caller));
  });
}

/** Publish a free item. Residents only. */
export async function POST(request: Request) {
  return handle(async () => {
    const guard = await requireCaller(request, ["student"]);
    if (guard.response) return guard.response;
    return ok({ listing: await createListing(guard.caller, await readJson(request)) }, 201);
  });
}

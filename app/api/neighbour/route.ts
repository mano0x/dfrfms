import { handle, ok, readJson } from "@/lib/server/http";
import { requireCaller } from "@/lib/server/session";
import { createNotice, listNotices } from "@/lib/server/neighbour";

/**
 * Neighbour notices the caller may see: all of them for an administrator;
 * for a resident, their own and the published ones of their dormitory.
 * Technicians have no access. No response contains the sender's identity.
 */
export async function GET(request: Request) {
  return handle(async () => {
    const guard = await requireCaller(request, ["student", "admin"]);
    if (guard.response) return guard.response;
    return ok({ notices: await listNotices(guard.caller) });
  });
}

/** Send a confidential notice. Residents only. */
export async function POST(request: Request) {
  return handle(async () => {
    const guard = await requireCaller(request, ["student"]);
    if (guard.response) return guard.response;
    return ok({ notice: await createNotice(guard.caller, await readJson(request)) }, 201);
  });
}

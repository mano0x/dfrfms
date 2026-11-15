import { ok } from "@/lib/server/http";
import { getCaller } from "@/lib/server/session";
import { getProfile } from "@/lib/server/profiles";

/** The signed-in user, or `{ user: null }` when there is no valid session. */
export async function GET() {
  const caller = await getCaller();
  if (!caller) return ok({ user: null });
  const profile = await getProfile(caller.id);
  return ok({
    user: {
      uid: caller.id,
      email: caller.email,
      name: profile?.name || caller.name,
      role: caller.role,
      dormitory: profile?.dormitory ?? null,
      roomNumber: profile?.roomNumber ?? null,
      specialization: profile?.specialization ?? null,
    },
  });
}

import { cookies } from "next/headers";
import { sessionServices } from "@/lib/appwrite/server";
import { fail, isSameOrigin, ok } from "@/lib/server/http";
import { SESSION_COOKIE, clearSessionCookie } from "@/lib/server/session";

/** Sign out: revoke the session in Appwrite and remove the cookie. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail(403, "Request blocked: it did not come from this site.");
  const secret = (await cookies()).get(SESSION_COOKIE)?.value;
  if (secret) {
    // Revoking on the server means a copied cookie stops working too.
    await sessionServices(secret).account.deleteSession({ sessionId: "current" }).catch(() => {});
  }
  await clearSessionCookie();
  return ok();
}

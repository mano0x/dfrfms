import { adminServices, guestServices } from "@/lib/appwrite/server";
import { firstError } from "@/lib/maintenance";
import { recoveryConfirmSchema, recoveryRequestSchema } from "@/lib/auth-rules";
import { fail, isSameOrigin, ok, readJson, siteOrigin } from "@/lib/server/http";

/**
 * Request a password-reset email. The answer is always the same, whether or
 * not the address has an account, so it cannot be used to find out who is
 * registered.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail(403, "Request blocked: it did not come from this site.");
  const parsed = recoveryRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail(400, firstError(parsed));

  try {
    await guestServices().account.createRecovery({
      email: parsed.data.email,
      url: `${siteOrigin(request)}/reset-password`,
    });
  } catch (err) {
    // Unknown address, rate limit or mail problem: log it, tell the visitor nothing.
    console.error("Password recovery request failed:", (err as { type?: string })?.type ?? err);
  }
  return ok({ message: "If that address has an account, a reset link has been sent to it." });
}

/** Set a new password using the link from the reset email. */
export async function PUT(request: Request) {
  if (!isSameOrigin(request)) return fail(403, "Request blocked: it did not come from this site.");
  const parsed = recoveryConfirmSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail(400, firstError(parsed));
  const { userId, secret, password } = parsed.data;

  try {
    await guestServices().account.updateRecovery({ userId, secret, password });
  } catch {
    return fail(400, "This reset link is invalid or has expired. Request a new one.");
  }
  // Sign the account out everywhere: anyone who knew the old password loses access.
  await adminServices().users.deleteSessions({ userId }).catch(() => {});
  return ok({ message: "Your password has been changed. You can now sign in." });
}

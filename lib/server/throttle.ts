/**
 * Brute-force protection for sign-in. Failed attempts are counted per email
 * address in the `auth_attempts` table (the policy itself is in
 * lib/auth-rules.ts). The row ID is a hash of the address, so the table holds
 * no email addresses and works for addresses that have no account.
 */
import { createHash } from "node:crypto";
import { adminServices } from "../appwrite/server";
import { DATABASE_ID, TABLES } from "../appwrite/config";
import { afterFailedAttempt, type AttemptState } from "../auth-rules";

const rowIdFor = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32);

const target = (email: string) => ({ databaseId: DATABASE_ID, tableId: TABLES.loginAttempts, rowId: rowIdFor(email) });

export async function getAttemptState(email: string): Promise<AttemptState | null> {
  try {
    const row = await adminServices().tablesDB.getRow(target(email));
    return {
      failedCount: Number(row.failedCount) || 0,
      windowStart: new Date(row.windowStart),
      lockedUntil: row.lockedUntil ? new Date(row.lockedUntil) : null,
    };
  } catch {
    return null; // no failed attempts recorded
  }
}

/** Record one failed sign-in and return the new counter. */
export async function recordFailedAttempt(email: string, previous: AttemptState | null): Promise<AttemptState> {
  const next = afterFailedAttempt(previous);
  await adminServices().tablesDB.upsertRow({
    ...target(email),
    data: {
      failedCount: next.failedCount,
      windowStart: next.windowStart.toISOString(),
      lockedUntil: next.lockedUntil ? next.lockedUntil.toISOString() : null,
    },
    permissions: [],
  });
  return next;
}

/** Forget failed attempts after a successful sign-in. */
export async function clearAttempts(email: string) {
  await adminServices().tablesDB.deleteRow(target(email)).catch(() => {});
}

/**
 * Authentication rules: input validation and the brute-force lockout policy.
 * Pure (no Appwrite, no Next.js) so it can be unit tested.
 */
import { z } from "zod";
import { ROLES } from "./maintenance";

export const passwordSchema = z
  .string()
  .min(8, "The password must be at least 8 characters.")
  .max(128, "The password is too long.");

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(320),
  // Only the length is checked at sign-in, so that the error never reveals the password rules.
  password: z.string().min(1, "Enter your password.").max(128),
  role: z.enum(ROLES, { message: "Choose a role first." }),
});

export const recoveryRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(320),
});

export const recoveryConfirmSchema = z.object({
  userId: z.string().min(1).max(36),
  secret: z.string().min(1).max(512),
  password: passwordSchema,
});

/* ------------------------------------------------------------------ */
/* Brute-force lockout                                                 */
/* ------------------------------------------------------------------ */

/** After this many failed sign-ins inside the window, the account is locked. */
export const MAX_FAILED_ATTEMPTS = 5;
export const ATTEMPT_WINDOW_MINUTES = 15;
export const LOCKOUT_MINUTES = 15;

const MINUTE_MS = 60 * 1000;

export type AttemptState = { failedCount: number; windowStart: Date; lockedUntil: Date | null };

/** True while a lockout is in force. */
export function isLockedOut(state: AttemptState | null, now: Date = new Date()): boolean {
  return !!state?.lockedUntil && now.getTime() < state.lockedUntil.getTime();
}

/** Whole minutes until the lockout ends (at least 1 while locked). */
export function lockoutMinutesLeft(state: AttemptState | null, now: Date = new Date()): number {
  if (!isLockedOut(state, now)) return 0;
  return Math.max(1, Math.ceil((state!.lockedUntil!.getTime() - now.getTime()) / MINUTE_MS));
}

/**
 * The counter after one more failed sign-in. Failures are counted inside a
 * fixed window; an old window (or an expired lockout) starts a new count.
 */
export function afterFailedAttempt(state: AttemptState | null, now: Date = new Date()): AttemptState {
  const windowExpired = !state || now.getTime() - state.windowStart.getTime() > ATTEMPT_WINDOW_MINUTES * MINUTE_MS;
  const lockExpired = !!state?.lockedUntil && now.getTime() >= state.lockedUntil.getTime();
  if (windowExpired || lockExpired) {
    return { failedCount: 1, windowStart: now, lockedUntil: null };
  }
  const failedCount = state!.failedCount + 1;
  return {
    failedCount,
    windowStart: state!.windowStart,
    lockedUntil: failedCount >= MAX_FAILED_ATTEMPTS ? new Date(now.getTime() + LOCKOUT_MINUTES * MINUTE_MS) : null,
  };
}

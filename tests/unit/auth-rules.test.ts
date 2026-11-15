import { describe, expect, it } from "vitest";
import {
  ATTEMPT_WINDOW_MINUTES, LOCKOUT_MINUTES, MAX_FAILED_ATTEMPTS, afterFailedAttempt, isLockedOut,
  lockoutMinutesLeft, loginSchema, passwordSchema, recoveryConfirmSchema, recoveryRequestSchema,
  type AttemptState,
} from "../../lib/auth-rules";

const start = new Date("2026-11-16T10:00:00Z");
const after = (minutes: number) => new Date(start.getTime() + minutes * 60 * 1000);

/** Apply n failed attempts, one per minute, starting at `start`. */
function fail(times: number, from: AttemptState | null = null, firstAt = 0): AttemptState {
  let state = from;
  for (let i = 0; i < times; i++) state = afterFailedAttempt(state, after(firstAt + i));
  return state!;
}

describe("brute-force lockout policy", () => {
  it("uses 5 attempts in 15 minutes and a 15 minute lockout", () => {
    expect([MAX_FAILED_ATTEMPTS, ATTEMPT_WINDOW_MINUTES, LOCKOUT_MINUTES]).toEqual([5, 15, 15]);
  });
  it("starts counting at the first failure", () => {
    const s = afterFailedAttempt(null, start);
    expect(s).toEqual({ failedCount: 1, windowStart: start, lockedUntil: null });
    expect(isLockedOut(s, start)).toBe(false);
  });
  it("does not lock before the fifth failure", () => {
    const s = fail(4);
    expect(s.failedCount).toBe(4);
    expect(isLockedOut(s, after(4))).toBe(false);
  });
  it("locks on the fifth failure for 15 minutes", () => {
    const s = fail(5); // failures at minutes 0..4
    expect(s.failedCount).toBe(5);
    expect(s.lockedUntil).toEqual(after(4 + 15));
    expect(isLockedOut(s, after(5))).toBe(true);
    expect(isLockedOut(s, after(18.9))).toBe(true);
    expect(isLockedOut(s, after(19))).toBe(false);
  });
  it("reports the minutes left, never less than 1 while locked", () => {
    const s = fail(5);
    expect(lockoutMinutesLeft(s, after(4))).toBe(15);
    expect(lockoutMinutesLeft(s, after(18.5))).toBe(1);
    expect(lockoutMinutesLeft(s, after(19))).toBe(0);
    expect(lockoutMinutesLeft(null, start)).toBe(0);
  });
  it("starts a new count when the window has passed", () => {
    const s = afterFailedAttempt(fail(4), after(16)); // first failure was at minute 0
    expect(s).toEqual({ failedCount: 1, windowStart: after(16), lockedUntil: null });
  });
  it("starts a new count after a lockout has ended", () => {
    const s = afterFailedAttempt(fail(5), after(19));
    expect(s.failedCount).toBe(1);
    expect(s.lockedUntil).toBeNull();
  });
  it("treats no recorded attempts as not locked", () => {
    expect(isLockedOut(null, start)).toBe(false);
  });
});

describe("authentication input validation", () => {
  it("normalises the sign-in email and requires a known role", () => {
    const r = loginSchema.safeParse({ email: "  Jonas@Example.com ", password: "x", role: "student" });
    expect(r.success).toBe(true);
    expect(r.data?.email).toBe("jonas@example.com");
    expect(loginSchema.safeParse({ email: "jonas@example.com", password: "x", role: "owner" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "jonas@example.com", password: "x" }).success).toBe(false);
  });
  it("rejects malformed sign-in input", () => {
    expect(loginSchema.safeParse({ email: "not-an-email", password: "x", role: "student" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "jonas@example.com", password: "", role: "student" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "jonas@example.com", password: "x".repeat(129), role: "student" }).success).toBe(false);
    expect(loginSchema.safeParse(null).success).toBe(false);
    expect(loginSchema.safeParse({ email: { $ne: "" }, password: "x", role: "student" }).success).toBe(false);
  });
  it("requires new passwords to be 8 to 128 characters", () => {
    expect(passwordSchema.safeParse("1234567").success).toBe(false);
    expect(passwordSchema.safeParse("12345678").success).toBe(true);
    expect(passwordSchema.safeParse("x".repeat(129)).success).toBe(false);
  });
  it("validates password recovery input", () => {
    expect(recoveryRequestSchema.safeParse({ email: "jonas@example.com" }).success).toBe(true);
    expect(recoveryRequestSchema.safeParse({ email: "jonas" }).success).toBe(false);
    expect(recoveryConfirmSchema.safeParse({ userId: "u1", secret: "s", password: "longenough" }).success).toBe(true);
    expect(recoveryConfirmSchema.safeParse({ userId: "u1", secret: "s", password: "short" }).success).toBe(false);
    expect(recoveryConfirmSchema.safeParse({ userId: "", secret: "s", password: "longenough" }).success).toBe(false);
  });
});

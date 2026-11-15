import { describe, expect, it } from "vitest";
import {
  MAX_PHOTO_BYTES, TARGET_HOURS, allowedNextStatuses, isAssignedTo, canChangeStatus, dueDate, firstError,
  isOverdue, newUserSchema, priorityForClassification, priorityOverrideSchema,
  reportInputSchema, resolutionNoteSchema, targetLabel, validatePhoto,
} from "../lib/maintenance";

const HOUR = 60 * 60 * 1000;
const created = new Date("2026-11-10T08:00:00Z");
const after = (hours: number) => new Date(created.getTime() + hours * HOUR);

describe("priorityForClassification", () => {
  it("maps Routine Maintenance to low", () => expect(priorityForClassification("normal")).toBe("low"));
  it("maps Priority Maintenance to high", () => expect(priorityForClassification("urgent")).toBe("high"));
  it("maps Emergency Maintenance to critical", () => expect(priorityForClassification("emergency")).toBe("critical"));
  it("falls back to low for unknown values", () => expect(priorityForClassification("whatever")).toBe("low"));
});

describe("status workflow", () => {
  it("lets a technician start, resolve and resume work", () => {
    expect(canChangeStatus("technician", "open", "in-progress")).toBe(true);
    expect(canChangeStatus("technician", "in-progress", "resolved")).toBe(true);
    expect(canChangeStatus("technician", "resolved", "in-progress")).toBe(true);
  });
  it("does not let a technician close or reopen a report", () => {
    expect(canChangeStatus("technician", "resolved", "closed")).toBe(false);
    expect(canChangeStatus("technician", "closed", "open")).toBe(false);
    expect(allowedNextStatuses("technician", "closed")).toEqual([]);
  });
  it("does not let a technician skip straight from open to resolved", () => {
    expect(canChangeStatus("technician", "open", "resolved")).toBe(false);
  });
  it("lets an administrator close and reopen reports", () => {
    expect(canChangeStatus("admin", "resolved", "closed")).toBe(true);
    expect(canChangeStatus("admin", "open", "closed")).toBe(true);
    expect(canChangeStatus("admin", "closed", "open")).toBe(true);
  });
  it("gives students and unknown roles no status changes", () => {
    expect(allowedNextStatuses("student", "open")).toEqual([]);
    expect(allowedNextStatuses(null, "open")).toEqual([]);
  });
  it("never allows a change to the same status", () => {
    for (const role of ["technician", "admin"] as const)
      for (const s of ["open", "in-progress", "resolved", "closed"])
        expect(canChangeStatus(role, s, s)).toBe(false);
  });
  it("returns no options for an unknown current status", () => {
    expect(allowedNextStatuses("admin", "archived")).toEqual([]);
  });
});

describe("assignment", () => {
  it("matches by account ID when the report has one", () => {
    expect(isAssignedTo({ assignedToId: "u1", assignedTo: "Tomas" }, { uid: "u1", name: "Tomas" })).toBe(true);
    expect(isAssignedTo({ assignedToId: "u1", assignedTo: "Tomas" }, { uid: "u2", name: "Tomas" })).toBe(false);
  });
  it("falls back to the name for reports without an account ID", () => {
    expect(isAssignedTo({ assignedTo: "Tomas" }, { uid: "u2", name: "Tomas" })).toBe(true);
    expect(isAssignedTo({ assignedTo: "Tomas" }, { uid: "u2", name: "Rasa" })).toBe(false);
  });
  it("is false for unassigned reports", () => {
    expect(isAssignedTo({ assignedTo: null, assignedToId: null }, { uid: "u1", name: "Tomas" })).toBe(false);
    expect(isAssignedTo({ assignedTo: "" }, { uid: "u1", name: "" })).toBe(false);
  });
});

describe("target resolution times", () => {
  it("uses 4 h / 24 h / 72 h / 168 h targets", () => {
    expect(TARGET_HOURS).toEqual({ critical: 4, high: 24, medium: 72, low: 168 });
  });
  it("computes the due date from the submission time", () => {
    expect(dueDate(created, "critical").toISOString()).toBe("2026-11-10T12:00:00.000Z");
    expect(dueDate(created, "low").toISOString()).toBe("2026-11-17T08:00:00.000Z");
  });
  it("is not overdue before the target and is overdue after it", () => {
    expect(isOverdue(created, "high", "open", after(23))).toBe(false);
    expect(isOverdue(created, "high", "open", after(25))).toBe(true);
    expect(isOverdue(created, "high", "in-progress", after(25))).toBe(true);
  });
  it("is not overdue exactly at the target time", () => {
    expect(isOverdue(created, "critical", "open", after(4))).toBe(false);
  });
  it("is never overdue once resolved or closed", () => {
    expect(isOverdue(created, "critical", "resolved", after(100))).toBe(false);
    expect(isOverdue(created, "critical", "closed", after(100))).toBe(false);
  });
  it("is not overdue when the submission time is missing", () => {
    expect(isOverdue(null, "critical", "open", after(100))).toBe(false);
  });
  it("treats an unknown priority as low", () => {
    expect(isOverdue(created, "unknown", "open", after(167))).toBe(false);
    expect(isOverdue(created, "unknown", "open", after(169))).toBe(true);
  });
  it("labels the remaining or exceeded time", () => {
    expect(targetLabel(created, "high", "open", after(21))).toBe("3 h left");
    expect(targetLabel(created, "low", "open", after(24))).toBe("6 d left");
    expect(targetLabel(created, "critical", "open", after(4.5))).toBe("under 1 h overdue");
    expect(targetLabel(created, "high", "open", after(24 + 72))).toBe("3 d overdue");
    expect(targetLabel(created, "high", "resolved", after(100))).toBe("");
  });
});

describe("report input validation", () => {
  const valid = { title: "Broken light switch", category: "electrical", urgency: "urgent", description: "The switch in the bathroom sparks." };
  it("accepts a valid report and trims text", () => {
    const r = reportInputSchema.safeParse({ ...valid, title: "  Broken light switch  " });
    expect(r.success).toBe(true);
    expect(r.data?.title).toBe("Broken light switch");
  });
  it("rejects a title that is too short or only spaces", () => {
    expect(reportInputSchema.safeParse({ ...valid, title: "abc" }).success).toBe(false);
    expect(reportInputSchema.safeParse({ ...valid, title: "        " }).success).toBe(false);
  });
  it("rejects an over-long title and description", () => {
    expect(reportInputSchema.safeParse({ ...valid, title: "x".repeat(121) }).success).toBe(false);
    expect(reportInputSchema.safeParse({ ...valid, description: "x".repeat(2001) }).success).toBe(false);
  });
  it("rejects a short description", () => {
    const r = reportInputSchema.safeParse({ ...valid, description: "broken" });
    expect(r.success).toBe(false);
    expect(firstError(r)).toMatch(/at least 10 characters/);
  });
  it("rejects categories and classifications outside the allowed lists", () => {
    expect(reportInputSchema.safeParse({ ...valid, category: "garden" }).success).toBe(false);
    expect(reportInputSchema.safeParse({ ...valid, urgency: "critical" }).success).toBe(false);
  });
});

describe("other validation", () => {
  it("validates resolution notes", () => {
    expect(resolutionNoteSchema.safeParse("Replaced the switch.").success).toBe(true);
    expect(resolutionNoteSchema.safeParse("  ").success).toBe(false);
    expect(resolutionNoteSchema.safeParse("x".repeat(1001)).success).toBe(false);
  });
  it("requires a reason for a priority override", () => {
    expect(priorityOverrideSchema.safeParse({ priority: "medium", reason: "Not a safety risk" }).success).toBe(true);
    expect(priorityOverrideSchema.safeParse({ priority: "medium", reason: "" }).success).toBe(false);
    expect(priorityOverrideSchema.safeParse({ priority: "urgent", reason: "Not a safety risk" }).success).toBe(false);
  });
  it("validates new users and normalises the email", () => {
    const r = newUserSchema.safeParse({ name: "Jonas Petraitis", email: "  Jonas@Example.com ", password: "longenough", role: "student" });
    expect(r.success).toBe(true);
    expect(r.data?.email).toBe("jonas@example.com");
    expect(newUserSchema.safeParse({ name: "J", email: "jonas@example.com", password: "longenough", role: "student" }).success).toBe(false);
    expect(newUserSchema.safeParse({ name: "Jonas", email: "not-an-email", password: "longenough", role: "student" }).success).toBe(false);
    expect(newUserSchema.safeParse({ name: "Jonas", email: "jonas@example.com", password: "short", role: "student" }).success).toBe(false);
    expect(newUserSchema.safeParse({ name: "Jonas", email: "jonas@example.com", password: "longenough", role: "owner" }).success).toBe(false);
  });
  it("validates photos by type and size", () => {
    expect(validatePhoto(null)).toBeNull();
    expect(validatePhoto({ type: "image/jpeg", size: 1000 })).toBeNull();
    expect(validatePhoto({ type: "image/png", size: MAX_PHOTO_BYTES })).toBeNull();
    expect(validatePhoto({ type: "image/png", size: MAX_PHOTO_BYTES + 1 })).toMatch(/5 MB/);
    expect(validatePhoto({ type: "application/pdf", size: 1000 })).toMatch(/JPG, PNG or WebP/);
    expect(validatePhoto({ type: "image/svg+xml", size: 1000 })).toMatch(/JPG, PNG or WebP/);
  });
});

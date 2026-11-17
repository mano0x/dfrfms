import { describe, expect, it } from "vitest";
import { withCurrentName, withCurrentNames } from "../../lib/names";

const report = { id: "r1", studentId: "s1", studentName: "Old Student", assignedToId: "t1", assignedTo: "Old Technician", title: "x" };
const names = new Map([["s1", "New Student"], ["t1", "New Technician"]]);

describe("current names on reports", () => {
  it("replaces the stored reporter and technician names with the accounts' current names", () => {
    expect(withCurrentNames(report, names)).toMatchObject({ studentName: "New Student", assignedTo: "New Technician" });
  });
  it("keeps every other field and does not change the stored object", () => {
    const result = withCurrentNames(report, names);
    expect(result).toMatchObject({ id: "r1", studentId: "s1", assignedToId: "t1", title: "x" });
    expect(report.studentName).toBe("Old Student");
  });
  it("keeps the stored name when the account is unknown or has no name", () => {
    expect(withCurrentNames(report, new Map())).toBe(report);
    expect(withCurrentNames(report, new Map([["s1", ""]])).studentName).toBe("Old Student");
  });
  it("leaves an unassigned report unassigned", () => {
    const open = { ...report, assignedToId: null, assignedTo: null };
    expect(withCurrentNames(open, names).assignedTo).toBeNull();
  });
  it("keeps the stored technician name for older reports assigned by name only", () => {
    const legacy = { ...report, assignedToId: null, assignedTo: "Tomas" };
    expect(withCurrentNames(legacy, names).assignedTo).toBe("Tomas");
  });
  it("never takes a name from a different account", () => {
    expect(withCurrentNames(report, new Map([["s2", "Somebody Else"]])).studentName).toBe("Old Student");
  });
});

describe("current names on profiles", () => {
  it("uses the account's current name", () => {
    expect(withCurrentName({ id: "s1", name: "Old Student", role: "student" }, names)).toEqual({ id: "s1", name: "New Student", role: "student" });
  });
  it("keeps the stored name when the account is unknown", () => {
    const profile = { id: "x9", name: "Stored Name" };
    expect(withCurrentName(profile, names)).toBe(profile);
  });
});

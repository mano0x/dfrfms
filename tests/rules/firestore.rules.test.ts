/**
 * Security rule tests for Firestore. They run against the local Firebase
 * emulator (never the live project):  npm run test:rules
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where,
  writeBatch, Timestamp,
} from "firebase/firestore";

let env: RulesTestEnvironment;

const ADMIN = "admin1";
const TECH1 = "tech1"; // Tomas
const TECH2 = "tech2"; // Rasa
const STU1 = "stu1";
const STU2 = "stu2";
const STRANGER = "nobody"; // signed in, but has no profile

const db = (uid: string) => env.authenticatedContext(uid, { email: `${uid}@example.com` }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

const past = Timestamp.fromDate(new Date("2026-11-01T08:00:00Z"));

const report = (over: Record<string, unknown> = {}) => ({
  title: "Broken light switch",
  category: "electrical",
  urgency: "normal",
  priority: "low",
  description: "The switch in the bathroom does not work.",
  photoURL: "",
  status: "open",
  studentId: STU1,
  studentName: "Jonas",
  dormitory: "A",
  roomNumber: "204",
  assignedTo: null,
  assignedToId: null,
  createdAt: past,
  updatedAt: past,
  ...over,
});

/** A new report exactly as the application submits it. */
const newReport = (over: Record<string, unknown> = {}) =>
  report({ createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...over });

const logEntry = (over: Record<string, unknown> = {}) => ({
  reportId: "r1",
  reportOwnerId: STU1,
  type: "status",
  from: "open",
  to: "in-progress",
  note: "",
  actorId: ADMIN,
  actorName: "Admin",
  actorRole: "admin",
  timestamp: serverTimestamp(),
  ...over,
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-dfrmms",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await setDoc(doc(d, "users", ADMIN), { name: "Admin", email: "admin1@example.com", role: "admin" });
    await setDoc(doc(d, "users", TECH1), { name: "Tomas", email: "tech1@example.com", role: "technician" });
    await setDoc(doc(d, "users", TECH2), { name: "Rasa", email: "tech2@example.com", role: "technician" });
    await setDoc(doc(d, "users", STU1), { name: "Jonas", email: "stu1@example.com", role: "student" });
    await setDoc(doc(d, "users", STU2), { name: "Ieva", email: "stu2@example.com", role: "student" });

    // r1: open, unassigned (STU1)          r2: in progress, assigned to TECH1 by ID (STU1)
    // r3: open, unassigned (STU2)          r4: open, assigned to "Tomas" by name only (legacy)
    // r5: open, triaged by admin (STU1)    r6: closed (STU1)
    await setDoc(doc(d, "fault_reports", "r1"), report());
    await setDoc(doc(d, "fault_reports", "r2"), report({ status: "in-progress", assignedTo: "Tomas", assignedToId: TECH1 }));
    await setDoc(doc(d, "fault_reports", "r3"), report({ studentId: STU2, studentName: "Ieva" }));
    const legacy = report({ assignedTo: "Tomas" }) as Record<string, unknown>;
    delete legacy.assignedToId;
    await setDoc(doc(d, "fault_reports", "r4"), legacy);
    await setDoc(doc(d, "fault_reports", "r5"), report({ priority: "medium", priorityOverridden: true, priorityReason: "Not urgent" }));
    await setDoc(doc(d, "fault_reports", "r6"), report({ status: "closed" }));

    await setDoc(doc(d, "status_log", "l1"), { ...logEntry(), timestamp: past });
    await setDoc(doc(d, "status_log", "l3"), { ...logEntry({ reportId: "r3", reportOwnerId: STU2 }), timestamp: past });
  });
});

describe("user profiles", () => {
  it("denies everything to visitors who are not signed in", async () => {
    await assertFails(getDoc(doc(anon(), "users", STU1)));
    await assertFails(getDocs(collection(anon(), "fault_reports")));
    await assertFails(getDocs(collection(anon(), "status_log")));
  });
  it("lets a user read their own profile but not someone else's", async () => {
    await assertSucceeds(getDoc(doc(db(STU1), "users", STU1)));
    await assertFails(getDoc(doc(db(STU1), "users", STU2)));
    await assertFails(getDoc(doc(db(TECH1), "users", STU1)));
  });
  it("lets a user find their own profile by email but not list all profiles", async () => {
    await assertSucceeds(getDocs(query(collection(db(STU1), "users"), where("email", "==", "stu1@example.com"))));
    await assertFails(getDocs(query(collection(db(STU1), "users"), where("email", "==", "stu2@example.com"))));
    await assertFails(getDocs(collection(db(STU1), "users")));
  });
  it("lets an administrator read all profiles", async () => {
    await assertSucceeds(getDocs(collection(db(ADMIN), "users")));
    await assertSucceeds(getDoc(doc(db(ADMIN), "users", STU1)));
  });
  it("prevents privilege escalation: nobody but an administrator writes profiles", async () => {
    await assertFails(updateDoc(doc(db(STU1), "users", STU1), { role: "admin" }));
    await assertFails(updateDoc(doc(db(TECH1), "users", TECH1), { role: "admin" }));
    await assertFails(setDoc(doc(db(TECH1), "users", "new1"), { name: "New User", email: "n@example.com", role: "student" }));
    await assertFails(setDoc(doc(db(STRANGER), "users", STRANGER), { name: "Nobody", email: "nobody@example.com", role: "admin" }));
  });
  it("lets an administrator create valid profiles only", async () => {
    await assertSucceeds(setDoc(doc(db(ADMIN), "users", "new1"), { name: "New User", email: "n@example.com", role: "student" }));
    await assertFails(setDoc(doc(db(ADMIN), "users", "new2"), { name: "New User", email: "n@example.com", role: "owner" }));
    await assertFails(setDoc(doc(db(ADMIN), "users", "new3"), { name: "X", email: "n@example.com", role: "student" }));
  });
  it("lets an administrator delete other profiles but not their own", async () => {
    await assertSucceeds(deleteDoc(doc(db(ADMIN), "users", STU2)));
    await assertFails(deleteDoc(doc(db(ADMIN), "users", ADMIN)));
    await assertFails(deleteDoc(doc(db(STU1), "users", STU1)));
  });
});

describe("reading fault reports", () => {
  it("lets a resident read only their own reports", async () => {
    await assertSucceeds(getDocs(query(collection(db(STU1), "fault_reports"), where("studentId", "==", STU1))));
    await assertSucceeds(getDoc(doc(db(STU1), "fault_reports", "r1")));
    await assertFails(getDoc(doc(db(STU1), "fault_reports", "r3")));
    await assertFails(getDocs(collection(db(STU1), "fault_reports")));
    await assertFails(getDocs(query(collection(db(STU1), "fault_reports"), where("studentId", "==", STU2))));
  });
  it("lets technicians and administrators read all reports", async () => {
    await assertSucceeds(getDocs(collection(db(TECH1), "fault_reports")));
    await assertSucceeds(getDocs(collection(db(ADMIN), "fault_reports")));
  });
  it("denies a signed-in account that has no profile", async () => {
    await assertFails(getDocs(collection(db(STRANGER), "fault_reports")));
    await assertFails(getDoc(doc(db(STRANGER), "fault_reports", "r1")));
  });
});

describe("creating fault reports", () => {
  it("lets a resident submit a valid report", async () => {
    await assertSucceeds(setDoc(doc(db(STU1), "fault_reports", "n1"), newReport()));
    await assertSucceeds(setDoc(doc(db(STU1), "fault_reports", "n2"), newReport({ urgency: "emergency", priority: "critical" })));
  });
  it("rejects a report submitted in another resident's name", async () => {
    await assertFails(setDoc(doc(db(STU1), "fault_reports", "n1"), newReport({ studentId: STU2 })));
  });
  it("rejects a priority that does not match the classification", async () => {
    await assertFails(setDoc(doc(db(STU1), "fault_reports", "n1"), newReport({ urgency: "normal", priority: "critical" })));
    await assertFails(setDoc(doc(db(STU1), "fault_reports", "n2"), newReport({ urgency: "urgent", priority: "medium" })));
  });
  it("rejects a report that is not open and unassigned", async () => {
    await assertFails(setDoc(doc(db(STU1), "fault_reports", "n1"), newReport({ status: "resolved" })));
    await assertFails(setDoc(doc(db(STU1), "fault_reports", "n2"), newReport({ assignedTo: "Tomas", assignedToId: TECH1 })));
  });
  it("rejects invalid content", async () => {
    await assertFails(setDoc(doc(db(STU1), "fault_reports", "n1"), newReport({ title: "abc" })));
    await assertFails(setDoc(doc(db(STU1), "fault_reports", "n2"), newReport({ description: "short" })));
    await assertFails(setDoc(doc(db(STU1), "fault_reports", "n3"), newReport({ category: "garden" })));
    await assertFails(setDoc(doc(db(STU1), "fault_reports", "n4"), newReport({ title: "x".repeat(121) })));
  });
  it("rejects extra fields such as a self-set triage flag", async () => {
    await assertFails(setDoc(doc(db(STU1), "fault_reports", "n1"), newReport({ priorityOverridden: true })));
  });
  it("rejects a back-dated submission time", async () => {
    await assertFails(setDoc(doc(db(STU1), "fault_reports", "n1"), newReport({ createdAt: past })));
  });
  it("does not let technicians or administrators submit reports as residents", async () => {
    await assertFails(setDoc(doc(db(TECH1), "fault_reports", "n1"), newReport({ studentId: TECH1 })));
    await assertFails(setDoc(doc(db(ADMIN), "fault_reports", "n2"), newReport({ studentId: ADMIN })));
  });
});

describe("resident edits", () => {
  const edit = { title: "Broken light switch (updated)", urgency: "urgent", priority: "high", updatedAt: serverTimestamp() };
  it("lets a resident edit their own open, unassigned report", async () => {
    await assertSucceeds(updateDoc(doc(db(STU1), "fault_reports", "r1"), edit));
  });
  it("rejects an edit with a priority that does not match the classification", async () => {
    await assertFails(updateDoc(doc(db(STU1), "fault_reports", "r1"), { ...edit, priority: "critical" }));
  });
  it("does not let a resident change status, assignment or ownership", async () => {
    await assertFails(updateDoc(doc(db(STU1), "fault_reports", "r1"), { status: "closed" }));
    await assertFails(updateDoc(doc(db(STU1), "fault_reports", "r1"), { assignedTo: "Tomas", assignedToId: TECH1 }));
    await assertFails(updateDoc(doc(db(STU1), "fault_reports", "r1"), { studentId: STU2 }));
  });
  it("does not let a resident edit once the report is assigned, triaged or closed", async () => {
    await assertFails(updateDoc(doc(db(STU1), "fault_reports", "r2"), edit));
    await assertFails(updateDoc(doc(db(STU1), "fault_reports", "r5"), edit));
    await assertFails(updateDoc(doc(db(STU1), "fault_reports", "r6"), edit));
  });
  it("does not let a resident edit or delete another resident's report", async () => {
    await assertFails(updateDoc(doc(db(STU1), "fault_reports", "r3"), edit));
    await assertFails(deleteDoc(doc(db(STU1), "fault_reports", "r1")));
  });
});

describe("technician updates", () => {
  it("lets the assigned technician follow the workflow and add a note", async () => {
    await assertSucceeds(updateDoc(doc(db(TECH1), "fault_reports", "r2"), { status: "resolved", updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(db(TECH1), "fault_reports", "r2"), { resolutionNote: "Replaced the switch.", updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(db(TECH1), "fault_reports", "r2"), { status: "in-progress", updatedAt: serverTimestamp() }));
  });
  it("does not let a technician update reports assigned to someone else or to nobody", async () => {
    await assertFails(updateDoc(doc(db(TECH2), "fault_reports", "r2"), { status: "resolved" }));
    await assertFails(updateDoc(doc(db(TECH1), "fault_reports", "r1"), { status: "in-progress" }));
  });
  it("does not let a technician close a report or skip a step", async () => {
    await assertFails(updateDoc(doc(db(TECH1), "fault_reports", "r2"), { status: "closed" }));
    await assertFails(updateDoc(doc(db(TECH1), "fault_reports", "r4"), { status: "resolved" }));
  });
  it("does not let a technician change priority, assignment or content", async () => {
    await assertFails(updateDoc(doc(db(TECH1), "fault_reports", "r2"), { priority: "critical" }));
    await assertFails(updateDoc(doc(db(TECH1), "fault_reports", "r1"), { assignedTo: "Tomas", assignedToId: TECH1 }));
    await assertFails(updateDoc(doc(db(TECH1), "fault_reports", "r2"), { title: "Changed by technician" }));
    await assertFails(deleteDoc(doc(db(TECH1), "fault_reports", "r2")));
  });
  it("rejects an over-long resolution note", async () => {
    await assertFails(updateDoc(doc(db(TECH1), "fault_reports", "r2"), { resolutionNote: "x".repeat(1001) }));
  });
  it("recognises older reports assigned by technician name", async () => {
    await assertSucceeds(updateDoc(doc(db(TECH1), "fault_reports", "r4"), { status: "in-progress", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db(TECH2), "fault_reports", "r4"), { status: "in-progress" }));
  });
});

describe("administrator updates", () => {
  it("lets an administrator assign, triage and close reports", async () => {
    const d = db(ADMIN);
    await assertSucceeds(updateDoc(doc(d, "fault_reports", "r1"), { assignedTo: "Rasa", assignedToId: TECH2, status: "in-progress", updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(d, "fault_reports", "r3"), { priority: "high", priorityOverridden: true, priorityReason: "Water damage risk" }));
    await assertSucceeds(updateDoc(doc(d, "fault_reports", "r2"), { status: "closed" }));
    await assertSucceeds(updateDoc(doc(d, "fault_reports", "r6"), { status: "open" }));
  });
  it("rejects status changes outside the workflow", async () => {
    await assertFails(updateDoc(doc(db(ADMIN), "fault_reports", "r6"), { status: "resolved" }));
    await assertFails(updateDoc(doc(db(ADMIN), "fault_reports", "r1"), { status: "resolved" }));
    await assertFails(updateDoc(doc(db(ADMIN), "fault_reports", "r1"), { status: "archived" }));
  });
  it("rejects an invalid priority and changes to who reported the fault or when", async () => {
    await assertFails(updateDoc(doc(db(ADMIN), "fault_reports", "r1"), { priority: "urgent" }));
    await assertFails(updateDoc(doc(db(ADMIN), "fault_reports", "r1"), { studentId: STU2 }));
    await assertFails(updateDoc(doc(db(ADMIN), "fault_reports", "r1"), { createdAt: serverTimestamp() }));
  });
  it("lets only an administrator delete a report", async () => {
    await assertSucceeds(deleteDoc(doc(db(ADMIN), "fault_reports", "r6")));
  });
});

describe("history (audit trail)", () => {
  it("lets a resident read the history of their own reports only", async () => {
    const own = query(collection(db(STU1), "status_log"), where("reportId", "==", "r1"), where("reportOwnerId", "==", STU1));
    await assertSucceeds(getDocs(own));
    await assertFails(getDocs(query(collection(db(STU1), "status_log"), where("reportId", "==", "r3"))));
    await assertFails(getDocs(query(collection(db(STU1), "status_log"), where("reportOwnerId", "==", STU2))));
    await assertFails(getDoc(doc(db(STU1), "status_log", "l3")));
    await assertFails(getDocs(collection(db(STU1), "status_log")));
  });
  it("lets staff read the history of any report", async () => {
    await assertSucceeds(getDocs(query(collection(db(TECH1), "status_log"), where("reportId", "==", "r3"))));
    await assertSucceeds(getDocs(collection(db(ADMIN), "status_log")));
  });
  it("lets an administrator record a change", async () => {
    await assertSucceeds(setDoc(doc(db(ADMIN), "status_log", "n1"), logEntry()));
  });
  it("rejects entries written under a false identity or role", async () => {
    await assertFails(setDoc(doc(db(TECH1), "status_log", "n1"), logEntry({ reportId: "r2" }))); // claims to be the admin
    await assertFails(setDoc(doc(db(TECH1), "status_log", "n2"), logEntry({ reportId: "r2", actorId: TECH1, actorRole: "admin" })));
    await assertFails(setDoc(doc(db(STRANGER), "status_log", "n3"), logEntry({ actorId: STRANGER })));
  });
  it("rejects a client-chosen time and a wrong report owner", async () => {
    await assertFails(setDoc(doc(db(ADMIN), "status_log", "n1"), logEntry({ timestamp: past })));
    await assertFails(setDoc(doc(db(ADMIN), "status_log", "n2"), logEntry({ reportOwnerId: STU2 })));
    await assertFails(setDoc(doc(db(ADMIN), "status_log", "n3"), logEntry({ reportId: "missing" })));
  });
  it("lets a technician record status changes and notes on assigned reports only", async () => {
    const mine = { reportId: "r2", actorId: TECH1, actorName: "Tomas", actorRole: "technician" };
    await assertSucceeds(setDoc(doc(db(TECH1), "status_log", "n1"), logEntry({ ...mine, type: "status" })));
    await assertSucceeds(setDoc(doc(db(TECH1), "status_log", "n2"), logEntry({ ...mine, type: "note", note: "Replaced the switch." })));
    await assertFails(setDoc(doc(db(TECH1), "status_log", "n3"), logEntry({ ...mine, type: "priority" })));
    await assertFails(setDoc(doc(db(TECH1), "status_log", "n4"), logEntry({ ...mine, reportId: "r1" })));
    await assertFails(setDoc(doc(db(TECH2), "status_log", "n5"), logEntry({ ...mine, actorId: TECH2, actorName: "Rasa" })));
  });
  it("lets a resident record only the creation and edits of their own reports", async () => {
    const mine = { actorId: STU1, actorName: "Jonas", actorRole: "student", from: null, to: null };
    await assertSucceeds(setDoc(doc(db(STU1), "status_log", "n1"), logEntry({ ...mine, type: "created" })));
    await assertSucceeds(setDoc(doc(db(STU1), "status_log", "n2"), logEntry({ ...mine, type: "edited" })));
    await assertFails(setDoc(doc(db(STU1), "status_log", "n3"), logEntry({ ...mine, type: "status" })));
    await assertFails(setDoc(doc(db(STU1), "status_log", "n4"), logEntry({ ...mine, type: "created", reportId: "r3", reportOwnerId: STU2 })));
  });
  it("is append-only: nobody can change or delete an entry", async () => {
    await assertFails(updateDoc(doc(db(ADMIN), "status_log", "l1"), { note: "edited" }));
    await assertFails(deleteDoc(doc(db(ADMIN), "status_log", "l1")));
    await assertFails(deleteDoc(doc(db(TECH1), "status_log", "l1")));
  });
  it("accepts the application's atomic write: report change plus history entry", async () => {
    const d = db(TECH1);
    const batch = writeBatch(d);
    batch.update(doc(d, "fault_reports", "r2"), { status: "resolved", updatedAt: serverTimestamp() });
    batch.set(doc(d, "status_log", "n1"), logEntry({ reportId: "r2", type: "status", from: "in-progress", to: "resolved", actorId: TECH1, actorName: "Tomas", actorRole: "technician" }));
    await assertSucceeds(batch.commit());
  });
  it("rejects the whole atomic write when the report change is not allowed", async () => {
    const d = db(TECH1);
    const batch = writeBatch(d);
    batch.update(doc(d, "fault_reports", "r2"), { status: "closed", updatedAt: serverTimestamp() });
    batch.set(doc(d, "status_log", "n1"), logEntry({ reportId: "r2", type: "status", from: "in-progress", to: "closed", actorId: TECH1, actorName: "Tomas", actorRole: "technician" }));
    await assertFails(batch.commit());
  });
});

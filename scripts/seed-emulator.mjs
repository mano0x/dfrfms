// Fills the LOCAL Firebase emulators with test accounts and sample reports.
// It can only reach the emulators on this machine: the emulator hosts are set
// below before Firebase Admin starts, and the project ID is a "demo-" project,
// which Firebase never connects to a real backend.
//
// Usage:  npm run emulators      (in one terminal)
//         npm run seed:emulator  (in another)
//
// The accounts and the password below exist only inside the local emulator.
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";

const { initializeApp } = await import("firebase-admin/app");
const { getAuth } = await import("firebase-admin/auth");
const { getFirestore, Timestamp } = await import("firebase-admin/firestore");

initializeApp({ projectId: "demo-dfrmms" });
const auth = getAuth();
const db = getFirestore();

export const TEST_PASSWORD = "Emulator-Test-2026";

const users = [
  { uid: "admin1", email: "admin@test.local", name: "Asta Adminaite", role: "admin" },
  { uid: "tech1", email: "tomas@test.local", name: "Tomas Technikas", role: "technician", specialization: "Electrical" },
  { uid: "tech2", email: "rasa@test.local", name: "Rasa Remontaite", role: "technician", specialization: "Plumbing" },
  { uid: "stu1", email: "jonas@test.local", name: "Jonas Petraitis", role: "student", dormitory: "Dormitory A", roomNumber: "204" },
  { uid: "stu2", email: "ieva@test.local", name: "Ieva Kazlauskaite", role: "student", dormitory: "Dormitory B", roomNumber: "117" },
];

for (const u of users) {
  await auth.deleteUser(u.uid).catch(() => {});
  await auth.createUser({ uid: u.uid, email: u.email, password: TEST_PASSWORD, displayName: u.name });
  const { uid, ...profile } = u;
  await db.collection("users").doc(uid).set({
    dormitory: null, roomNumber: null, specialization: null, ...profile, createdAt: Timestamp.now(),
  });
}

const hoursAgo = (h) => Timestamp.fromMillis(Date.now() - h * 60 * 60 * 1000);
const base = { photoURL: "", studentId: "stu1", studentName: "Jonas Petraitis", dormitory: "Dormitory A", roomNumber: "204", assignedTo: null, assignedToId: null };

const reports = [
  { id: "seed-open", title: "Wardrobe door hinge is loose", category: "furniture", urgency: "normal", priority: "low", description: "The left wardrobe door hangs off its top hinge.", status: "open", createdAt: hoursAgo(5) },
  { id: "seed-emergency", title: "Water leaking under the sink", category: "plumbing", urgency: "emergency", priority: "critical", description: "Water is pooling on the bathroom floor from the pipe under the sink.", status: "open", createdAt: hoursAgo(6) },
  { id: "seed-assigned", title: "Bathroom light switch sparks", category: "electrical", urgency: "urgent", priority: "high", description: "The switch sparks when it is turned on.", status: "in-progress", assignedTo: "Tomas Technikas", assignedToId: "tech1", createdAt: hoursAgo(30) },
  { id: "seed-other", title: "Radiator stays cold", category: "hvac", urgency: "urgent", priority: "high", description: "The radiator in the room does not heat up at all.", status: "open", studentId: "stu2", studentName: "Ieva Kazlauskaite", dormitory: "Dormitory B", roomNumber: "117", createdAt: hoursAgo(2) },
];

for (const r of reports) {
  const { id, ...data } = r;
  await db.collection("fault_reports").doc(id).set({ ...base, ...data, updatedAt: data.createdAt });
  await db.collection("status_log").add({
    reportId: id, reportOwnerId: data.studentId ?? base.studentId, type: "created", from: null, to: "open", note: "",
    actorId: data.studentId ?? base.studentId, actorName: data.studentName ?? base.studentName, actorRole: "student",
    timestamp: data.createdAt,
  });
}

console.log(`Seeded ${users.length} test accounts and ${reports.length} reports into the local emulator.`);
console.log("Sign in with any of these emails and the TEST_PASSWORD defined in scripts/seed-emulator.mjs:");
for (const u of users) console.log(`  ${u.role.padEnd(10)} ${u.email}`);
process.exit(0);

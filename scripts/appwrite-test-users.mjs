// Creates (or removes) the test accounts used for manual and automated
// testing of the Appwrite version. They are ordinary accounts in the Appwrite
// project, clearly named as tests, and must be removed before real use.
//
// Usage:  npm run appwrite:test-users            create or refresh them
//         npm run appwrite:test-users -- --remove   delete them
//
// The password comes from TEST_USER_PASSWORD in .env.local. It is never
// written in this file, because this repository is public.
import { Client, TablesDB, Users } from "node-appwrite";

const { NEXT_PUBLIC_APPWRITE_ENDPOINT: endpoint, NEXT_PUBLIC_APPWRITE_PROJECT_ID: projectId, APPWRITE_API_KEY: apiKey, TEST_USER_PASSWORD: password } = process.env;
if (!endpoint || !projectId || !apiKey || !password) {
  console.error("Missing settings in .env.local (Appwrite settings and TEST_USER_PASSWORD).");
  process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const users = new Users(client);
const tablesDB = new TablesDB(client);
const DATABASE_ID = "dfrmms";

export const TEST_USERS = [
  { id: "test-admin", email: "dfrmms.test.admin@example.com", name: "Test Administrator", role: "admin" },
  { id: "test-tech1", email: "dfrmms.test.tech1@example.com", name: "Test Technician One", role: "technician", specialization: "Electrical" },
  { id: "test-tech2", email: "dfrmms.test.tech2@example.com", name: "Test Technician Two", role: "technician", specialization: "Plumbing" },
  { id: "test-student1", email: "dfrmms.test.student1@example.com", name: "Test Student One", role: "student", dormitory: "Dormitory A", roomNumber: "204" },
  { id: "test-student2", email: "dfrmms.test.student2@example.com", name: "Test Student Two", role: "student", dormitory: "Dormitory B", roomNumber: "117" },
  // Used only by the lockout test, so the other accounts are never locked.
  { id: "test-lockout", email: "dfrmms.test.lockout@example.com", name: "Test Lockout", role: "student", dormitory: "Dormitory A", roomNumber: "001" },
];

const remove = process.argv.includes("--remove");

for (const u of TEST_USERS) {
  await tablesDB.deleteRow({ databaseId: DATABASE_ID, tableId: "users", rowId: u.id }).catch(() => {});
  await users.delete({ userId: u.id }).catch(() => {});
  if (remove) continue;

  await users.create({ userId: u.id, email: u.email, password, name: u.name });
  await users.updateLabels({ userId: u.id, labels: [u.role] });
  await tablesDB.createRow({
    databaseId: DATABASE_ID,
    tableId: "users",
    rowId: u.id,
    permissions: [],
    data: {
      name: u.name,
      email: u.email,
      role: u.role,
      dormitory: u.dormitory ?? null,
      roomNumber: u.roomNumber ?? null,
      specialization: u.specialization ?? null,
      createdAt: new Date().toISOString(),
    },
  });
}

console.log(remove ? `Removed ${TEST_USERS.length} test accounts.` : `Created ${TEST_USERS.length} test accounts:`);
if (!remove) for (const u of TEST_USERS) console.log(`  ${u.role.padEnd(10)} ${u.email}`);

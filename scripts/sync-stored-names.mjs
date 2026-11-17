// Brings the stored copies of people's names in line with their sign-in
// accounts. The application already shows the account's current name (see
// lib/names.ts); this only tidies the copies kept in the database:
//   - `name` on the account's row in the `users` table
//   - `studentName` on reports the account submitted
//   - `assignedTo` on reports assigned to the account (by account ID)
// History entries are not touched: they record the name used at the time.
//
//   npm run names:sync-dry    list what differs; change nothing
//   npm run names:sync-run    save the old values, update, read back
//
// Only the name fields are written. Account IDs, emails, passwords, roles,
// report content, status, timestamps and history stay exactly as they are.
import { mkdirSync, writeFileSync } from "node:fs";
import { Client, Query, TablesDB, Users } from "node-appwrite";

const RUN = process.argv.includes("--run");
const DATABASE_ID = "dfrmms";

const { NEXT_PUBLIC_APPWRITE_ENDPOINT: endpoint, NEXT_PUBLIC_APPWRITE_PROJECT_ID: projectId, APPWRITE_API_KEY: apiKey } = process.env;
if (!endpoint || !projectId || !apiKey) {
  console.error("Missing Appwrite settings in .env.local");
  process.exit(1);
}
const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const users = new Users(client);
const tablesDB = new TablesDB(client);
const rows = async (tableId) => (await tablesDB.listRows({ databaseId: DATABASE_ID, tableId, queries: [Query.limit(500)] })).rows;

const accounts = (await users.list({ queries: [Query.limit(500)] })).users;
const names = new Map(accounts.filter((a) => a.name).map((a) => [a.$id, a.name]));
const [profiles, reports] = [await rows("users"), await rows("fault_reports")];

// ---- Plan: every stored copy that differs from the account's name ----
const changes = [];
for (const p of profiles) {
  const current = names.get(p.$id);
  if (current && p.name !== current) changes.push({ tableId: "users", rowId: p.$id, field: "name", from: p.name, to: current });
}
for (const r of reports) {
  const reporter = names.get(r.studentId);
  if (reporter && r.studentName !== reporter) changes.push({ tableId: "fault_reports", rowId: r.$id, field: "studentName", from: r.studentName, to: reporter });
  const technician = r.assignedToId ? names.get(r.assignedToId) : null;
  if (technician && r.assignedTo !== technician) changes.push({ tableId: "fault_reports", rowId: r.$id, field: "assignedTo", from: r.assignedTo, to: technician });
}

console.log(`\n${RUN ? "SYNC" : "DRY RUN - nothing will be changed"}  ->  Appwrite project ${projectId}`);
console.log(`checked ${profiles.length} profiles and ${reports.length} reports against ${accounts.length} accounts`);
console.log(`stored names that differ from the account: ${changes.length}`);
for (const c of changes) console.log(`  ${c.tableId.padEnd(13)} ${c.rowId.padEnd(29)} ${c.field.padEnd(11)} "${c.from}" -> "${c.to}"`);

if (!changes.length) { console.log("\nEverything is already in step."); process.exit(0); }
if (!RUN) { console.log("\nNothing was changed. To apply: npm run names:sync-run"); process.exit(0); }

// ---- Save the old values, then apply ----
mkdirSync("migration-data", { recursive: true });
const backupFile = `migration-data/name-sync-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
writeFileSync(backupFile, JSON.stringify({ takenAt: new Date().toISOString(), changes }, null, 2));
console.log(`\nold values saved to ${backupFile}`);

let failed = 0;
for (const c of changes) {
  try {
    await tablesDB.updateRow({ databaseId: DATABASE_ID, tableId: c.tableId, rowId: c.rowId, data: { [c.field]: c.to } });
    const row = await tablesDB.getRow({ databaseId: DATABASE_ID, tableId: c.tableId, rowId: c.rowId });
    if (row[c.field] !== c.to) throw new Error("read-back shows a different value");
    console.log(`  PASS  ${c.tableId} ${c.rowId} ${c.field}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${c.tableId} ${c.rowId} ${c.field}: ${err?.message ?? err}`);
  }
}

// ---- Confirm nothing else moved ----
const [profilesAfter, reportsAfter] = [await rows("users"), await rows("fault_reports")];
const touched = new Set(changes.map((c) => `${c.tableId}/${c.rowId}/${c.field}`));
const drift = [];
const compare = (tableId, before, after) => {
  if (before.length !== after.length) drift.push(`${tableId}: row count changed`);
  for (const b of before) {
    const a = after.find((x) => x.$id === b.$id);
    if (!a) { drift.push(`${tableId} ${b.$id}: missing`); continue; }
    for (const key of Object.keys(b)) {
      if (key.startsWith("$") && key !== "$id") continue; // Appwrite's own bookkeeping
      if (touched.has(`${tableId}/${b.$id}/${key}`)) continue;
      if (JSON.stringify(b[key]) !== JSON.stringify(a[key])) drift.push(`${tableId} ${b.$id}.${key} changed unexpectedly`);
    }
  }
};
compare("users", profiles, profilesAfter);
compare("fault_reports", reports, reportsAfter);
console.log(`\nupdated ${changes.length - failed} of ${changes.length}; every other field unchanged: ${drift.length === 0}`);
for (const d of drift) console.log(`  ! ${d}`);
process.exit(failed || drift.length ? 1 : 0);

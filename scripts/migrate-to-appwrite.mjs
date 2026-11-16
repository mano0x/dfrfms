// Copies the exported Firestore data (migration-data/*.json, created by
// `npm run migrate:export`) into Appwrite.
//
//   npm run migrate:dry    show exactly what would be copied; change nothing
//   npm run migrate:run    copy, then read everything back and compare
//
// Properties:
//   - Repeatable: rows keep their Firestore IDs and are written with
//     "upsert", so running it again updates the same rows instead of
//     duplicating them. Existing sign-in accounts are left untouched.
//   - Non-destructive: nothing is deleted in Appwrite and Firebase is not
//     contacted at all (the script only reads the exported files).
//   - Verified: after copying, each row is read back and compared field by
//     field, and record counts are reported.
//
// Decisions (see the report printed at the end):
//   - Sign-in accounts keep their Firebase user IDs, so reports still point
//     to the right people. Passwords cannot be copied; each migrated account
//     gets a new random temporary password, saved in
//     migration-data/new-passwords.json (local only, ignored by git).
//   - Profiles without a sign-in account (created by the old, faulty
//     "Create user" form) cannot be used to sign in and are not copied.
//   - Reports assigned by technician name only also get the technician's
//     account ID when exactly one technician has that name.
//   - History entries written before entry types existed are resolution
//     notes and are copied as type "note".
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Client, TablesDB, Users } from "node-appwrite";

const DRY = !process.argv.includes("--run");
const DIR = new URL("../migration-data/", import.meta.url);
const DATABASE_ID = "dfrmms";

const { NEXT_PUBLIC_APPWRITE_ENDPOINT: endpoint, NEXT_PUBLIC_APPWRITE_PROJECT_ID: projectId, APPWRITE_API_KEY: apiKey } = process.env;
if (!endpoint || !projectId || !apiKey) {
  console.error("Missing Appwrite settings in .env.local");
  process.exit(1);
}
const read = (name) => {
  const file = new URL(name, DIR);
  if (!existsSync(file)) { console.error(`Missing ${name}. Run: npm run migrate:export`); process.exit(1); }
  return JSON.parse(readFileSync(file, "utf8"));
};

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const users = new Users(client);
const tablesDB = new TablesDB(client);

const ROLES = ["student", "technician", "admin"];
const CATEGORIES = ["electrical", "plumbing", "hvac", "structural", "internet", "furniture", "other"];
const CLASSIFICATIONS = ["normal", "urgent", "emergency"];
const PRIORITIES = ["critical", "high", "medium", "low"];
const STATUSES = ["open", "in-progress", "resolved", "closed"];

const src = {
  users: read("users.json"),
  reports: read("fault_reports.json"),
  logs: read("status_log.json"),
  accounts: read("auth-accounts.json"), // [{ uid, email }] - no passwords
};

const log = { notes: [], errors: [], skipped: [] };
const text = (v, max) => (v === null || v === undefined || v === "" ? null : String(v).slice(0, max));
const iso = (v, fallback) => {
  const d = new Date(v ?? fallback);
  return Number.isNaN(d.getTime()) ? new Date(fallback).toISOString() : d.toISOString();
};

/* ------------------------------------------------------------------ */
/* Plan                                                                */
/* ------------------------------------------------------------------ */

const accountIds = new Set(src.accounts.map((a) => a.uid));

// Users: only profiles that belong to a sign-in account.
const planUsers = [];
for (const u of src.users) {
  const account = src.accounts.find((a) => a.uid === u.id);
  if (!account) {
    log.skipped.push(`profile ${u.id} (${u.data.role}): no sign-in account has this ID, so nobody can sign in with it`);
    continue;
  }
  if (!ROLES.includes(u.data.role)) { log.errors.push(`profile ${u.id}: unknown role "${u.data.role}"`); continue; }
  planUsers.push({
    id: u.id,
    email: String(account.email).toLowerCase(),
    name: text(u.data.name, 80) ?? account.email,
    role: u.data.role,
    row: {
      name: text(u.data.name, 80) ?? account.email,
      email: String(account.email).toLowerCase(),
      role: u.data.role,
      dormitory: u.data.role === "student" ? text(u.data.dormitory, 60) : null,
      roomNumber: u.data.role === "student" ? text(u.data.roomNumber, 20) : null,
      specialization: u.data.role === "technician" ? text(u.data.specialization, 80) : null,
      createdAt: iso(u.data.createdAt, u.createTime),
    },
  });
}
for (const a of src.accounts) {
  if (!src.users.some((u) => u.id === a.uid)) log.skipped.push(`sign-in account ${a.uid}: it has no profile, so it has no role`);
}

const technicians = planUsers.filter((u) => u.role === "technician");
const technicianIdFor = (name) => {
  const matches = technicians.filter((t) => t.name === name);
  return matches.length === 1 ? matches[0].id : null;
};

// Reports
const planReports = [];
for (const r of src.reports) {
  const d = r.data;
  const problems = [];
  if (!CATEGORIES.includes(d.category)) problems.push(`category "${d.category}"`);
  if (!CLASSIFICATIONS.includes(d.urgency)) problems.push(`classification "${d.urgency}"`);
  if (!PRIORITIES.includes(d.priority)) problems.push(`priority "${d.priority}"`);
  if (!STATUSES.includes(d.status)) problems.push(`status "${d.status}"`);
  if (!d.title || !d.description || !d.studentId) problems.push("missing title, description or reporter");
  if (problems.length) { log.errors.push(`report ${r.id}: ${problems.join(", ")}`); continue; }

  if (!planUsers.some((u) => u.id === d.studentId)) {
    log.notes.push(`report ${r.id}: its reporter (${accountIds.has(d.studentId) ? "account without profile" : "a profile without a sign-in account"}) is not migrated; the report is copied and stays visible to staff`);
  }
  let assignedToId = text(d.assignedToId, 36);
  const assignedTo = text(d.assignedTo, 80);
  if (assignedTo && !assignedToId) {
    assignedToId = technicianIdFor(assignedTo);
    log.notes.push(assignedToId
      ? `report ${r.id}: assigned by name "${assignedTo}" -> linked to that technician's account`
      : `report ${r.id}: assigned to "${assignedTo}", but no single technician account has that name; the name is kept without a link`);
  }
  if (d.photoURL) log.notes.push(`report ${r.id}: had a Firebase photo link, which is not copied (Firebase Storage was never set up)`);

  planReports.push({
    id: r.id,
    row: {
      title: text(d.title, 120),
      category: d.category,
      urgency: d.urgency,
      priority: d.priority,
      priorityOverridden: d.priorityOverridden === true,
      priorityReason: text(d.priorityReason, 300),
      description: text(d.description, 2000),
      photoFileId: null,
      status: d.status,
      studentId: String(d.studentId),
      studentName: text(d.studentName, 320),
      dormitory: text(d.dormitory, 60),
      roomNumber: text(d.roomNumber, 20),
      assignedTo,
      assignedToId,
      resolutionNote: text(d.resolutionNote, 1000),
      createdAt: iso(d.createdAt, r.createTime),
      updatedAt: iso(d.updatedAt, d.createdAt ?? r.updateTime),
    },
  });
}

// History
const planLogs = [];
for (const l of src.logs) {
  const d = l.data;
  const report = planReports.find((r) => r.id === d.reportId);
  if (!report) { log.skipped.push(`history entry ${l.id}: its report (${d.reportId}) is not being migrated`); continue; }
  const legacy = !d.type;
  const actorName = text(d.actorName ?? d.technicianName, 320);
  planLogs.push({
    id: l.id,
    row: {
      reportId: d.reportId,
      reportOwnerId: text(d.reportOwnerId, 36) ?? report.row.studentId,
      type: d.type ?? "note",
      from: text(d.from, 80),
      to: text(d.to, 80),
      note: text(d.note, 1000),
      actorId: text(d.actorId, 36) ?? (legacy ? technicianIdFor(actorName) : null),
      actorName,
      actorRole: ROLES.includes(d.actorRole) ? d.actorRole : legacy ? "technician" : null,
      timestamp: iso(d.timestamp, l.createTime),
    },
  });
}

/* ------------------------------------------------------------------ */
/* Report the plan                                                     */
/* ------------------------------------------------------------------ */

const line = (label, source, planned) => console.log(`  ${label.padEnd(16)} in Firestore: ${String(source).padStart(3)}   to copy: ${String(planned).padStart(3)}`);
console.log(`\n${DRY ? "DRY RUN - nothing will be changed" : "MIGRATION"}  ->  Appwrite project ${projectId}`);
line("sign-in accounts", src.accounts.length, planUsers.length);
line("user profiles", src.users.length, planUsers.length);
line("fault reports", src.reports.length, planReports.length);
line("history entries", src.logs.length, planLogs.length);
const section = (title, items) => { if (items.length) { console.log(`\n${title}`); for (const i of items) console.log(`  - ${i}`); } };
section("Not copied:", log.skipped);
section("Notes:", log.notes);
section("ERRORS in the source data (these records are not copied):", log.errors);

if (DRY) {
  console.log("\nNothing was changed. To copy the data: npm run migrate:run");
  process.exit(log.errors.length ? 1 : 0);
}

/* ------------------------------------------------------------------ */
/* Copy                                                                */
/* ------------------------------------------------------------------ */

const result = { accountsCreated: 0, accountsExisting: 0, rows: 0, failures: [] };
const passwordFile = new URL("new-passwords.json", DIR);
const passwords = existsSync(passwordFile) ? JSON.parse(readFileSync(passwordFile, "utf8")) : {};

for (const u of planUsers) {
  try {
    let exists = true;
    try { await users.get({ userId: u.id }); } catch (err) { if (err?.code === 404) exists = false; else throw err; }
    if (exists) {
      result.accountsExisting++;
    } else {
      const password = "Temp-" + randomBytes(12).toString("base64url");
      await users.create({ userId: u.id, email: u.email, password, name: u.name });
      passwords[u.email] = password;
      writeFileSync(passwordFile, JSON.stringify(passwords, null, 2)); // saved at once, so it is never lost
      result.accountsCreated++;
    }
    await users.updateLabels({ userId: u.id, labels: [u.role] });
    await tablesDB.upsertRow({ databaseId: DATABASE_ID, tableId: "users", rowId: u.id, data: u.row, permissions: [] });
    result.rows++;
  } catch (err) {
    result.failures.push(`user ${u.id}: ${err?.message ?? err}`);
  }
}
for (const [tableId, plan] of [["fault_reports", planReports], ["status_log", planLogs]]) {
  for (const item of plan) {
    try {
      await tablesDB.upsertRow({ databaseId: DATABASE_ID, tableId, rowId: item.id, data: item.row, permissions: [] });
      result.rows++;
    } catch (err) {
      result.failures.push(`${tableId} ${item.id}: ${err?.message ?? err}`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Verify: read back and compare                                       */
/* ------------------------------------------------------------------ */

const same = (a, b) => {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (typeof a === "string" && /^\d{4}-\d{2}-\d{2}T/.test(a)) return new Date(a).getTime() === new Date(b).getTime();
  return a === b;
};
const verify = { checked: 0, mismatches: [] };
for (const [tableId, plan] of [["users", planUsers], ["fault_reports", planReports], ["status_log", planLogs]]) {
  for (const item of plan) {
    try {
      const row = await tablesDB.getRow({ databaseId: DATABASE_ID, tableId, rowId: item.id });
      for (const [key, expected] of Object.entries(item.row)) {
        if (!same(expected, row[key])) verify.mismatches.push(`${tableId} ${item.id}.${key}: expected ${JSON.stringify(expected)}, found ${JSON.stringify(row[key])}`);
      }
      verify.checked++;
    } catch (err) {
      verify.mismatches.push(`${tableId} ${item.id}: could not be read back (${err?.message ?? err})`);
    }
  }
}
for (const u of planUsers) {
  const account = await users.get({ userId: u.id }).catch(() => null);
  if (!account) verify.mismatches.push(`account ${u.id}: missing`);
  else if (account.email !== u.email || !account.labels.includes(u.role) || account.labels.length !== 1) {
    verify.mismatches.push(`account ${u.id}: email or role label differs`);
  }
}

const expectedRows = planUsers.length + planReports.length + planLogs.length;
console.log(`\nCopied:`);
console.log(`  sign-in accounts: ${result.accountsCreated} created, ${result.accountsExisting} already present`);
console.log(`  rows written:     ${result.rows} of ${expectedRows}`);
console.log(`Verified by reading back: ${verify.checked} of ${expectedRows} rows, ${verify.mismatches.length} differences`);
section("FAILURES while copying:", result.failures);
section("DIFFERENCES found when reading back:", verify.mismatches);
if (result.accountsCreated) console.log(`\nTemporary passwords for the ${result.accountsCreated} new account(s) are in migration-data/new-passwords.json (local only).`);
const okAll = !result.failures.length && !verify.mismatches.length && !log.errors.length && verify.checked === expectedRows;
console.log(okAll ? "\nMigration completed and verified." : "\nMigration finished WITH PROBLEMS - see above.");
process.exit(okAll ? 0 : 1);

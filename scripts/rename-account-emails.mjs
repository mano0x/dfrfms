// Renames the sign-in email of the three real accounts in place.
// The account ID, password, role, reports, assignments and history are not
// touched: only the address changes, in two places that must agree -
// the Appwrite Auth account and the account's row in the `users` table.
//
//   npm run accounts:rename-dry        show what would change; change nothing
//   npm run accounts:rename-run        rename, one account at a time, verifying each
//   npm run accounts:rename-rollback   put the previous addresses back
//
// Safe to run again: an account that already has its target address is
// skipped, and a half-finished account (Auth renamed, profile not) is completed.
// It never creates or deletes an account. It stops at the first failure.
import { Client, Query, TablesDB, Users } from "node-appwrite";

const RUN = process.argv.includes("--run");
const ROLLBACK = process.argv.includes("--rollback");
const DRY = !RUN && !ROLLBACK;
const DATABASE_ID = "dfrmms";

// The exact mapping approved for the migration. No other account is changed.
const MAPPING = [
  { role: "admin", from: "admin@dfrfms.com", to: "admin@dfrmms.space" },
  { role: "technician", from: "tech@dfrfms.com", to: "technician@dfrmms.space" },
  { role: "student", from: "student@dfrfms.com", to: "student@dfrmms.space" },
].map((m) => (ROLLBACK ? { role: m.role, from: m.to, to: m.from } : m));

const { NEXT_PUBLIC_APPWRITE_ENDPOINT: endpoint, NEXT_PUBLIC_APPWRITE_PROJECT_ID: projectId, APPWRITE_API_KEY: apiKey } = process.env;
if (!endpoint || !projectId || !apiKey) {
  console.error("Missing Appwrite settings in .env.local");
  process.exit(1);
}
const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const users = new Users(client);
const tablesDB = new TablesDB(client);

const listAccounts = async () => (await users.list({ queries: [Query.limit(100)] })).users;
const rows = async (tableId) => (await tablesDB.listRows({ databaseId: DATABASE_ID, tableId, queries: [Query.limit(500)] })).rows;

/** Everything that must be identical before and after, keyed by account ID. */
async function snapshot() {
  const [accounts, profiles, reports, logs] = [await listAccounts(), await rows("users"), await rows("fault_reports"), await rows("status_log")];
  const perAccount = {};
  for (const a of accounts) {
    perAccount[a.$id] = {
      labels: a.labels.join(","),
      status: a.status,
      reportsOwned: reports.filter((r) => r.studentId === a.$id).map((r) => r.$id).sort().join(","),
      reportsAssigned: reports.filter((r) => r.assignedToId === a.$id).map((r) => r.$id).sort().join(","),
      history: logs.filter((l) => l.actorId === a.$id || l.reportOwnerId === a.$id).map((l) => l.$id).sort().join(","),
      profileRole: profiles.find((p) => p.$id === a.$id)?.role ?? null,
    };
  }
  return { accounts, profiles, perAccount, totals: { accounts: accounts.length, profiles: profiles.length, reports: reports.length, history: logs.length } };
}

const before = await snapshot();
const mode = DRY ? "DRY RUN - nothing will be changed" : ROLLBACK ? "ROLLBACK" : "RENAME";
console.log(`\n${mode}  ->  Appwrite project ${projectId}\n`);

// ---- Plan and preflight ----
const plan = [];
let blocked = false;
for (const m of MAPPING) {
  const atFrom = before.accounts.filter((a) => a.email === m.from);
  const atTo = before.accounts.filter((a) => a.email === m.to);
  const account = atFrom[0] ?? atTo[0];
  const profile = account ? before.profiles.find((p) => p.$id === account.$id) : null;
  const problems = [];
  if (atFrom.length + atTo.length !== 1) problems.push(`expected exactly one account at the old or new address, found ${atFrom.length + atTo.length}`);
  if (account && (account.labels.length !== 1 || account.labels[0] !== m.role)) problems.push(`role label is [${account.labels.join(",")}], expected ${m.role}`);
  if (account && !account.status) problems.push("account is blocked");
  if (account && !profile) problems.push("no profile row");
  if (account && before.profiles.some((p) => p.email === m.to && p.$id !== account.$id)) problems.push("another profile already uses the target address");
  const authDone = account?.email === m.to;
  const profileDone = profile?.email === m.to;
  const state = problems.length ? "BLOCKED" : authDone && profileDone ? "already done" : authDone ? "finish profile" : "rename";
  if (problems.length) blocked = true;
  plan.push({ ...m, account, profile, state, problems });
  console.log(`  ${m.role.padEnd(11)} ${(account?.$id ?? "-").padEnd(29)} ${m.from}  ->  ${m.to}   [${state}]`);
  for (const p of problems) console.log(`      ! ${p}`);
}
const mappedIds = new Set(plan.map((p) => p.account?.$id));
console.log(`\n  accounts that will not be touched: ${before.accounts.filter((a) => !mappedIds.has(a.$id)).length}`);
console.log(`  totals: ${JSON.stringify(before.totals)}`);

if (blocked) {
  console.log("\nPreflight failed. Nothing was changed.");
  process.exit(1);
}
if (DRY) {
  console.log("\nNothing was changed. To rename: npm run accounts:rename-run");
  process.exit(0);
}

// ---- Execute, one account at a time ----
let failure = null;
for (const p of plan) {
  if (p.state === "already done") { console.log(`\n${p.role}: already at ${p.to} - skipped`); continue; }
  const id = p.account.$id;
  try {
    if (p.state === "rename") {
      const updated = await users.updateEmail({ userId: id, email: p.to });
      if (updated.$id !== id || updated.email !== p.to) throw new Error("the account returned by Appwrite does not show the new address");
    }
    await tablesDB.updateRow({ databaseId: DATABASE_ID, tableId: "users", rowId: id, data: { email: p.to } });

    // Read both back before moving on.
    const account = await users.get({ userId: id });
    const profile = await tablesDB.getRow({ databaseId: DATABASE_ID, tableId: "users", rowId: id });
    const checks = {
      "same account ID": account.$id === id,
      "new address on the account": account.email === p.to,
      "new address on the profile": profile.email === p.to,
      "role label unchanged": account.labels.join(",") === before.perAccount[id].labels,
      "status unchanged": account.status === before.perAccount[id].status,
      "profile role unchanged": profile.role === before.perAccount[id].profileRole,
    };
    const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
    console.log(`\n${p.role}: ${p.from} -> ${p.to}`);
    console.log(`  account ID ${id} | email verified after change: ${account.emailVerification}`);
    for (const [k, ok] of Object.entries(checks)) console.log(`  ${ok ? "PASS" : "FAIL"}  ${k}`);
    if (failed.length) throw new Error(`verification failed: ${failed.join("; ")}`);
  } catch (err) {
    failure = `${p.role} (${id}): ${err?.type ? err.type + " - " : ""}${err?.message ?? err}`;
    break; // stop: do not touch the remaining accounts
  }
}

// ---- Verify that nothing else moved ----
const after = await snapshot();
const drift = [];
if (JSON.stringify(after.totals) !== JSON.stringify(before.totals)) drift.push(`totals changed: ${JSON.stringify(before.totals)} -> ${JSON.stringify(after.totals)}`);
for (const [id, was] of Object.entries(before.perAccount)) {
  const now = after.perAccount[id];
  if (!now) { drift.push(`account ${id} no longer exists`); continue; }
  for (const key of Object.keys(was)) if (was[key] !== now[key]) drift.push(`account ${id}: ${key} changed`);
}
for (const a of before.accounts) {
  if (mappedIds.has(a.$id)) continue;
  const now = after.accounts.find((x) => x.$id === a.$id);
  if (!now || now.email !== a.email) drift.push(`untouched account ${a.$id} changed`);
}
const emails = after.accounts.map((a) => a.email);
if (new Set(emails).size !== emails.length) drift.push("two accounts share an email address");

console.log(`\nAfter: totals ${JSON.stringify(after.totals)}`);
console.log(`Relationships (roles, report ownership, assignments, history) unchanged for all ${Object.keys(before.perAccount).length} accounts: ${drift.length === 0}`);
for (const d of drift) console.log(`  ! ${d}`);
if (failure) {
  console.log(`\nSTOPPED at: ${failure}`);
  console.log("Accounts renamed before this point keep their new address. No account was created or deleted.");
  console.log("To continue after fixing the cause, run the same command again; to undo, run: npm run accounts:rename-rollback");
}
const ok = !failure && drift.length === 0;
console.log(ok ? `\n${ROLLBACK ? "Rollback" : "Rename"} completed and verified.` : "\nFinished WITH PROBLEMS - see above.");
process.exit(ok ? 0 : 1);

// After the migration: checks through the running application that the
// migrated accounts can sign in and that each role sees the migrated data it
// should. Needs `npm run dev` running. Usage:  npm run migrate:check
//
// It reads the temporary passwords from migration-data/new-passwords.json and
// never prints them.
import { existsSync, readFileSync } from "node:fs";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const dir = new URL("../migration-data/", import.meta.url);
const load = (name) => JSON.parse(readFileSync(new URL(name, dir), "utf8"));
if (!existsSync(new URL("new-passwords.json", dir))) {
  console.error("migration-data/new-passwords.json not found (it is written by npm run migrate:run).");
  process.exit(1);
}
const passwords = load("new-passwords.json");
const profiles = load("users.json");
const accounts = load("auth-accounts.json");
const sourceReports = load("fault_reports.json");
const sourceLogs = load("status_log.json");

const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`); };

async function signIn(email, role) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email, password: passwords[email], role }),
  });
  return { status: res.status, cookie: (res.headers.get("set-cookie") ?? "").split(";")[0] };
}
const get = async (path, cookie) => {
  const res = await fetch(BASE + path, { headers: { Cookie: cookie } });
  return { status: res.status, data: await res.json().catch(() => null) };
};

console.log(`\nChecking migrated data through ${BASE}`);
for (const account of accounts) {
  const profile = profiles.find((p) => p.id === account.uid);
  if (!profile) continue;
  const role = profile.data.role;
  const email = String(account.email).toLowerCase();
  const session = await signIn(email, role);
  check(`${role}: migrated account signs in with its temporary password`, session.status === 200, `HTTP ${session.status}`);
  if (session.status !== 200) continue;

  const me = await get("/api/auth/me", session.cookie);
  check(`${role}: keeps the same account ID and role`, me.data?.user?.uid === account.uid && me.data?.user?.role === role);

  const { data } = await get("/api/reports", session.cookie);
  const seen = data?.reports ?? [];
  const migratedSeen = seen.filter((r) => sourceReports.some((s) => s.id === r.id));
  if (role === "student") {
    const own = sourceReports.filter((r) => r.data.studentId === account.uid);
    check(`student: sees exactly their own ${own.length} migrated report(s)`,
      migratedSeen.length === own.length && seen.every((r) => r.studentId === account.uid), `${migratedSeen.length} seen`);
  } else {
    check(`${role}: sees all ${sourceReports.length} migrated reports`, migratedSeen.length === sourceReports.length, `${migratedSeen.length} seen`);
  }

  // Dates and history survive the move.
  const sample = sourceReports.find((s) => seen.some((r) => r.id === s.id));
  if (sample) {
    const copied = seen.find((r) => r.id === sample.id);
    check(`${role}: report keeps its original submission time`, new Date(copied.createdAt).getTime() === new Date(sample.data.createdAt).getTime());
  }
  if (role !== "student") {
    let historyOk = true;
    for (const l of sourceLogs) {
      const h = await get(`/api/reports/${l.data.reportId}/history`, session.cookie);
      if (!(h.data?.history ?? []).some((e) => e.id === l.id && e.type === "note" && e.note === l.data.note)) historyOk = false;
    }
    check(`${role}: sees the ${sourceLogs.length} migrated history entries`, historyOk);
  }
  if (role === "technician") {
    const assigned = seen.filter((r) => r.assignedToId === account.uid).length;
    const expected = sourceReports.filter((r) => r.data.assignedTo === profile.data.name).length;
    check(`technician: ${expected} report(s) assigned by name are now linked to the account`, assigned === expected, `${assigned} linked`);
  }
  await fetch(`${BASE}/api/auth/logout`, { method: "POST", headers: { Cookie: session.cookie, Origin: BASE } });
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} of ${results.length} checks passed.`);
process.exit(failed ? 1 : 0);

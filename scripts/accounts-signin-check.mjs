// Checks through the running application that the three real accounts can
// sign in with their new addresses and that each role sees and is refused
// exactly what it should be. It only signs in, reads, and signs out: no report
// is created or changed.
//
//   npm run accounts:check                       against http://localhost:3000
//   TEST_BASE_URL=https://www.dfrmms.space npm run accounts:check
//
// Passwords are read from migration-data/new-passwords.json (local only) and
// are never printed. That file is keyed by each account's address at the time
// the password was set, so the rename backup is used to find the right entry.
import { existsSync, readdirSync, readFileSync } from "node:fs";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const dir = new URL("../migration-data/", import.meta.url);
const backupName = existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith("email-rename-backup")).sort().pop() : null;
if (!backupName || !existsSync(new URL("new-passwords.json", dir))) {
  console.error("migration-data/ needs new-passwords.json and an email-rename-backup file.");
  process.exit(1);
}
const backup = JSON.parse(readFileSync(new URL(backupName, dir), "utf8"));
const passwords = JSON.parse(readFileSync(new URL("new-passwords.json", dir), "utf8"));

const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`); };

const post = (path, body, cookie) =>
  fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body ?? {}) });
const get = async (path, cookie) => {
  const res = await fetch(BASE + path, { headers: cookie ? { Cookie: cookie } : {} });
  return { status: res.status, data: await res.json().catch(() => null) };
};
async function signIn(email, password, role) {
  const res = await post("/api/auth/login", { email, password, role });
  const setCookie = res.headers.get("set-cookie") ?? "";
  return { status: res.status, cookie: setCookie.split(";")[0], flags: setCookie.toLowerCase(), data: await res.json().catch(() => null) };
}

console.log(`\nSign-in check for the three accounts on ${BASE}`);
for (const account of backup.accounts) {
  const { role, userId, targetEmail, email: oldEmail } = account;
  const password = passwords[targetEmail] ?? passwords[oldEmail];
  console.log(`\n${role}: ${targetEmail}`);
  if (!password) { check("a saved password exists for this account", false); continue; }

  const session = await signIn(targetEmail, password, role);
  check("signs in with the new address", session.status === 200, `HTTP ${session.status}`);
  if (session.status !== 200) continue;
  check("session cookie is httpOnly, SameSite=Strict and Secure", session.flags.includes("httponly") && session.flags.includes("samesite=strict") && (BASE.startsWith("http://") || session.flags.includes("secure")));

  const me = await get("/api/auth/me", session.cookie);
  check("same account ID and role as before the rename", me.data?.user?.uid === userId && me.data?.user?.role === role && me.data?.user?.email === targetEmail);
  const again = await get("/api/auth/me", session.cookie);
  check("session persists across requests", again.data?.user?.uid === userId);

  const reports = (await get("/api/reports", session.cookie)).data?.reports ?? [];
  const users = await get("/api/users", session.cookie);
  if (role === "student") {
    check(`dashboard data: sees exactly their ${account.reportsOwned.length} own reports`, reports.length === account.reportsOwned.length && reports.every((r) => r.studentId === userId), `${reports.length} seen`);
    if (reports[0]) {
      const history = await get(`/api/reports/${reports[0].id}/history`, session.cookie);
      check("can read the history of an own report", history.status === 200);
    }
    check("restricted: cannot list users", users.status === 403, `HTTP ${users.status}`);
  } else if (role === "technician") {
    const mine = reports.filter((r) => r.assignedToId === userId);
    check(`dashboard data: ${account.reportsAssigned.length} reports assigned to this account`, mine.length === account.reportsAssigned.length, `${mine.length} assigned, ${reports.length} visible`);
    check("sees maintenance notes on assigned reports", mine.some((r) => r.resolutionNote));
    check("restricted: cannot list users", users.status === 403, `HTTP ${users.status}`);
  } else {
    check("dashboard data: sees all reports", reports.length >= backup.totals.reports, `${reports.length} seen`);
    const list = users.data?.users ?? [];
    check("can list users, including the technician for assignment", users.status === 200 && list.some((u) => u.role === "technician" && u.email === "technician@dfrmms.space"));
  }

  const wrongRole = await signIn(targetEmail, password, role === "admin" ? "student" : "admin");
  check("refused under a different role", wrongRole.status === 403 && !wrongRole.cookie, `HTTP ${wrongRole.status}`);

  const out = await post("/api/auth/logout", {}, session.cookie);
  const after = await get("/api/auth/me", session.cookie);
  check("signs out, and the old session no longer works", out.status === 200 && after.data?.user === null);

  const second = await signIn(targetEmail, password, role);
  check("signs in again after signing out", second.status === 200, `HTTP ${second.status}`);
  if (second.status === 200) await post("/api/auth/logout", {}, second.cookie);

  const old = await signIn(oldEmail, password, role);
  check("the old address no longer signs in", old.status === 401, `HTTP ${old.status}`);
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} of ${results.length} checks passed.`);
process.exit(failed ? 1 : 0);

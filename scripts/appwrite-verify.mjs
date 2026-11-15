// Verifies the Appwrite structure created by appwrite-setup.mjs.
// It writes two throwaway rows inside one transaction, reads them back,
// checks that a visitor who is not signed in cannot read them, and then
// deletes them again. It never touches real data.
//
// Usage:  npm run appwrite:verify
import { Client, ID, Query, Storage, TablesDB } from "node-appwrite";

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
if (!endpoint || !projectId || !apiKey) {
  console.error("Missing Appwrite settings in .env.local");
  process.exit(1);
}

const DATABASE_ID = "dfrmms";
const BUCKET_ID = "dormitory-fault-photos";
const admin = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const guest = new Client().setEndpoint(endpoint).setProject(projectId); // no key, no session
const tablesDB = new TablesDB(admin);
const storage = new Storage(admin);

const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const denied = async (fn) => {
  try {
    const r = await fn();
    return { denied: (r?.total ?? 1) === 0 && Array.isArray(r?.rows), note: `returned ${r?.total} rows` };
  } catch (err) {
    return { denied: [401, 403, 404].includes(err?.code), note: `HTTP ${err?.code}` };
  }
};

console.log(`\nVerifying Appwrite project ${projectId}`);

// 1. Structure
for (const [tableId, columnCount, indexCount] of [["users", 7, 2], ["fault_reports", 18, 4], ["status_log", 10, 1]]) {
  const table = await tablesDB.getTable({ databaseId: DATABASE_ID, tableId });
  const { columns } = await tablesDB.listColumns({ databaseId: DATABASE_ID, tableId });
  const { indexes } = await tablesDB.listIndexes({ databaseId: DATABASE_ID, tableId });
  check(`${tableId}: ${columnCount} columns available`, columns.length === columnCount && columns.every((c) => c.status === "available"), `${columns.length} found`);
  check(`${tableId}: ${indexCount} indexes available`, indexes.length === indexCount && indexes.every((i) => i.status === "available"), `${indexes.length} found, ${indexes.map((i) => i.status).join("/")}`);
  check(`${tableId}: row security on, no table-wide access`, table.rowSecurity === true && (table.$permissions ?? []).length === 0);
}
const bucket = await storage.getBucket({ bucketId: BUCKET_ID });
check("bucket: private, per-file access, 5 MB, images only",
  bucket.fileSecurity === true && bucket.maximumFileSize === 5 * 1024 * 1024 &&
  ["jpg", "jpeg", "png", "webp"].every((e) => bucket.allowedFileExtensions.includes(e)) && bucket.allowedFileExtensions.length === 4 &&
  bucket.$permissions.length === 1 && bucket.$permissions[0] === 'create("label:student")',
  `permissions: ${bucket.$permissions.join(", ")}`);

// 2. Atomic write: report + history entry in one transaction
const reportId = ID.unique();
const logId = ID.unique();
const now = new Date().toISOString();
try {
  const tx = await tablesDB.createTransaction();
  await tablesDB.createRow({
    databaseId: DATABASE_ID, tableId: "fault_reports", rowId: reportId, transactionId: tx.$id, permissions: [],
    data: { title: "VERIFY - temporary row", category: "other", urgency: "normal", priority: "low", description: "Temporary row written by appwrite-verify.mjs.", status: "open", studentId: "verify-script", createdAt: now, updatedAt: now },
  });
  await tablesDB.createRow({
    databaseId: DATABASE_ID, tableId: "status_log", rowId: logId, transactionId: tx.$id, permissions: [],
    data: { reportId, reportOwnerId: "verify-script", type: "created", to: "open", timestamp: now },
  });
  const before = await denied(() => tablesDB.getRow({ databaseId: DATABASE_ID, tableId: "fault_reports", rowId: reportId }));
  check("transaction: nothing is visible before commit", before.denied, before.note);
  await tablesDB.updateTransaction({ transactionId: tx.$id, commit: true });
  const saved = await tablesDB.getRow({ databaseId: DATABASE_ID, tableId: "fault_reports", rowId: reportId });
  const logs = await tablesDB.listRows({ databaseId: DATABASE_ID, tableId: "status_log", queries: [Query.equal("reportId", reportId)] });
  check("transaction: report and history entry saved together", saved.title.startsWith("VERIFY") && logs.total === 1);

  // 3. Validation by the schema
  const bad = await tablesDB.createRow({
    databaseId: DATABASE_ID, tableId: "fault_reports", rowId: ID.unique(), permissions: [],
    data: { title: "x", category: "garden", urgency: "normal", priority: "low", description: "d", status: "open", studentId: "verify-script", createdAt: now, updatedAt: now },
  }).then((r) => r.$id, () => null);
  check("schema rejects a category outside the allowed list", bad === null);
  if (bad) await tablesDB.deleteRow({ databaseId: DATABASE_ID, tableId: "fault_reports", rowId: bad });

  // 4. A visitor without a session cannot read anything
  const guestDb = new TablesDB(guest);
  const g1 = await denied(() => guestDb.getRow({ databaseId: DATABASE_ID, tableId: "fault_reports", rowId: reportId }));
  check("visitor cannot read a report", g1.denied, g1.note);
  const g2 = await denied(() => guestDb.listRows({ databaseId: DATABASE_ID, tableId: "fault_reports" }));
  check("visitor cannot list reports", g2.denied, g2.note);
  const g3 = await denied(() => guestDb.listRows({ databaseId: DATABASE_ID, tableId: "users" }));
  check("visitor cannot list user profiles", g3.denied, g3.note);
  const g4 = await denied(() => new Storage(guest).listFiles({ bucketId: BUCKET_ID }).then((r) => ({ total: r.total, rows: r.files })));
  check("visitor cannot list photos", g4.denied, g4.note);
} finally {
  // 5. Clean up the throwaway rows
  await tablesDB.deleteRow({ databaseId: DATABASE_ID, tableId: "fault_reports", rowId: reportId }).catch(() => {});
  await tablesDB.deleteRow({ databaseId: DATABASE_ID, tableId: "status_log", rowId: logId }).catch(() => {});
}
const left = await tablesDB.listRows({ databaseId: DATABASE_ID, tableId: "fault_reports", queries: [Query.equal("studentId", "verify-script")] });
const leftLogs = await tablesDB.listRows({ databaseId: DATABASE_ID, tableId: "status_log", queries: [Query.equal("reportOwnerId", "verify-script")] });
check("throwaway rows removed", left.total === 0 && leftLogs.total === 0);

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} of ${results.length} checks passed.`);
process.exit(failed ? 1 : 0);

// Creates the Appwrite backend structure for DFRMMS: database, tables,
// columns, indexes and the private photo bucket.
//
// Repeatable: it only creates what is missing and never deletes or changes
// existing data, so it is safe to run again after a partial run.
//
// Usage:  npm run appwrite:setup          (reads .env.local)
//         npm run appwrite:setup -- --check   (report only, change nothing)
//
// Required in .env.local (never committed):
//   NEXT_PUBLIC_APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1
//   NEXT_PUBLIC_APPWRITE_PROJECT_ID=<project id>
//   APPWRITE_API_KEY=<server API key>
import { Client, Permission, Role, Storage, TablesDB, TablesDBIndexType } from "node-appwrite";

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const checkOnly = process.argv.includes("--check");

const missing = Object.entries({
  NEXT_PUBLIC_APPWRITE_ENDPOINT: endpoint,
  NEXT_PUBLIC_APPWRITE_PROJECT_ID: projectId,
  APPWRITE_API_KEY: apiKey,
}).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error(`Missing in .env.local: ${missing.join(", ")}`);
  process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const tablesDB = new TablesDB(client);
const storage = new Storage(client);

/* ------------------------------------------------------------------ */
/* Schema (keep IDs in step with lib/appwrite/config.ts)               */
/* ------------------------------------------------------------------ */

export const DATABASE_ID = "dfrmms";
export const BUCKET_ID = "dormitory-fault-photos";

const ROLES = ["student", "technician", "admin"];
const CATEGORIES = ["electrical", "plumbing", "hvac", "structural", "internet", "furniture", "other"];
const CLASSIFICATIONS = ["normal", "urgent", "emergency"];
const PRIORITIES = ["critical", "high", "medium", "low"];
const STATUSES = ["open", "in-progress", "resolved", "closed"];
const LOG_TYPES = ["created", "edited", "status", "assignment", "priority", "note"];

const text = (key, size, required = false) => ({ kind: "varchar", key, size, required });
const choice = (key, elements, required = false) => ({ kind: "enum", key, elements, required });
const date = (key, required = false) => ({ kind: "datetime", key, required });
const flag = (key, required = false) => ({ kind: "boolean", key, required });
const whole = (key, required = false) => ({ kind: "integer", key, required });

// Row IDs: users use the account ID; reports and history keep their
// Firestore document IDs so existing relationships stay valid.
// Access is given per row (rowSecurity) by the server when a row is written;
// the tables themselves grant nothing, so the browser can never write to them.
const TABLES = [
  {
    id: "users",
    name: "User profiles",
    columns: [
      text("name", 80, true),
      text("email", 320, true),
      choice("role", ROLES, true),
      text("dormitory", 60),
      text("roomNumber", 20),
      text("specialization", 80),
      date("createdAt"),
    ],
    indexes: [
      { key: "email_unique", type: TablesDBIndexType.Unique, columns: ["email"] },
      { key: "role", type: TablesDBIndexType.Key, columns: ["role"] },
    ],
  },
  {
    id: "fault_reports",
    name: "Fault reports",
    columns: [
      text("title", 120, true),
      choice("category", CATEGORIES, true),
      choice("urgency", CLASSIFICATIONS, true),
      choice("priority", PRIORITIES, true),
      flag("priorityOverridden"),
      text("priorityReason", 300),
      text("description", 2000, true),
      text("photoFileId", 36),
      choice("status", STATUSES, true),
      text("studentId", 36, true),
      text("studentName", 320),
      text("dormitory", 60),
      text("roomNumber", 20),
      text("assignedTo", 80),
      text("assignedToId", 36),
      text("resolutionNote", 1000),
      date("createdAt", true),
      date("updatedAt", true),
    ],
    indexes: [
      { key: "studentId", type: TablesDBIndexType.Key, columns: ["studentId"] },
      { key: "createdAt", type: TablesDBIndexType.Key, columns: ["createdAt"] },
      { key: "status", type: TablesDBIndexType.Key, columns: ["status"] },
      { key: "assignedToId", type: TablesDBIndexType.Key, columns: ["assignedToId"] },
      { key: "photoFileId", type: TablesDBIndexType.Key, columns: ["photoFileId"] },
    ],
  },
  {
    id: "status_log",
    name: "Report history",
    columns: [
      text("reportId", 36, true),
      text("reportOwnerId", 36),
      choice("type", LOG_TYPES, true),
      text("from", 80),
      text("to", 80),
      text("note", 1000),
      text("actorId", 36),
      text("actorName", 320),
      choice("actorRole", ROLES),
      date("timestamp", true),
    ],
    indexes: [
      { key: "reportId", type: TablesDBIndexType.Key, columns: ["reportId"] },
    ],
  },
  {
    // Failed sign-in counters for brute-force protection. The row ID is a
    // hash of the email address, so no address is stored here.
    id: "auth_attempts",
    name: "Sign-in attempts",
    columns: [
      whole("failedCount", true),
      date("windowStart", true),
      date("lockedUntil"),
    ],
    indexes: [],
  },
];

const BUCKET = {
  bucketId: BUCKET_ID,
  name: "Dormitory fault photos",
  // Private bucket: only residents may upload; who may view each photo is set
  // per file by the server (fileSecurity).
  permissions: [Permission.create(Role.label("student"))],
  fileSecurity: true,
  enabled: true,
  maximumFileSize: 5 * 1024 * 1024,
  allowedFileExtensions: ["jpg", "jpeg", "png", "webp"],
  encryption: true,
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const report = { created: [], existing: [], wouldCreate: [], errors: [] };
const isNotFound = (err) => err?.code === 404;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensure(label, exists, create) {
  try {
    await exists();
    report.existing.push(label);
    return true;
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }
  if (checkOnly) {
    report.wouldCreate.push(label);
    return false;
  }
  await create();
  report.created.push(label);
  return true;
}

function createColumn(tableId, c) {
  const common = { databaseId: DATABASE_ID, tableId, key: c.key, required: c.required };
  switch (c.kind) {
    case "varchar": return tablesDB.createVarcharColumn({ ...common, size: c.size });
    case "enum": return tablesDB.createEnumColumn({ ...common, elements: c.elements });
    case "datetime": return tablesDB.createDatetimeColumn(common);
    case "boolean": return tablesDB.createBooleanColumn(common);
    case "integer": return tablesDB.createIntegerColumn(common);
    default: throw new Error(`Unknown column kind: ${c.kind}`);
  }
}

// Columns are built in the background; indexes can only be added once the
// columns they use are ready.
async function waitForColumns(tableId) {
  for (let i = 0; i < 60; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: DATABASE_ID, tableId });
    const failed = columns.filter((c) => c.status === "failed");
    if (failed.length) throw new Error(`Column(s) failed in ${tableId}: ${failed.map((c) => c.key).join(", ")}`);
    if (columns.every((c) => c.status === "available")) return;
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for columns of ${tableId}`);
}

/* ------------------------------------------------------------------ */
/* Run                                                                 */
/* ------------------------------------------------------------------ */

try {
  const dbReady = await ensure(
    `database ${DATABASE_ID}`,
    () => tablesDB.get({ databaseId: DATABASE_ID }),
    () => tablesDB.create({ databaseId: DATABASE_ID, name: "DFRMMS" })
  );

  for (const t of TABLES) {
    if (!dbReady) {
      report.wouldCreate.push(`table ${t.id} (${t.columns.length} columns, ${t.indexes.length} indexes)`);
      continue;
    }
    const tableReady = await ensure(
      `table ${t.id}`,
      () => tablesDB.getTable({ databaseId: DATABASE_ID, tableId: t.id }),
      () => tablesDB.createTable({ databaseId: DATABASE_ID, tableId: t.id, name: t.name, permissions: [], rowSecurity: true })
    );
    if (!tableReady) {
      report.wouldCreate.push(`  ${t.columns.length} columns and ${t.indexes.length} indexes of ${t.id}`);
      continue;
    }

    for (const c of t.columns) {
      await ensure(
        `column ${t.id}.${c.key}`,
        () => tablesDB.getColumn({ databaseId: DATABASE_ID, tableId: t.id, key: c.key }),
        () => createColumn(t.id, c)
      );
    }
    if (!checkOnly) await waitForColumns(t.id);

    for (const ix of t.indexes) {
      await ensure(
        `index ${t.id}.${ix.key}`,
        () => tablesDB.getIndex({ databaseId: DATABASE_ID, tableId: t.id, key: ix.key }),
        () => tablesDB.createIndex({ databaseId: DATABASE_ID, tableId: t.id, key: ix.key, type: ix.type, columns: ix.columns })
      );
    }
  }

  await ensure(
    `bucket ${BUCKET_ID}`,
    () => storage.getBucket({ bucketId: BUCKET_ID }),
    () => storage.createBucket(BUCKET)
  );
} catch (err) {
  report.errors.push(`${err?.type ?? err?.name ?? "error"}: ${err?.message ?? err}`);
}

console.log(`\nAppwrite ${checkOnly ? "check" : "setup"} for project ${projectId} at ${endpoint}`);
console.log(`  already present: ${report.existing.length}`);
if (checkOnly) {
  console.log(`  missing:         ${report.wouldCreate.length}`);
  for (const l of report.wouldCreate) console.log(`    - ${l}`);
} else {
  console.log(`  created:         ${report.created.length}`);
  for (const l of report.created) console.log(`    + ${l}`);
}
if (report.errors.length) {
  console.log(`  ERRORS:          ${report.errors.length}`);
  for (const e of report.errors) console.log(`    ! ${e}`);
  process.exit(1);
}

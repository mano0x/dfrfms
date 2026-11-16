/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS on purpose: the Firebase CLI modules used here are CommonJS */
// Reads the existing Firestore data (read-only) and saves it as JSON in
// migration-data/, which is ignored by git because it contains personal data.
// It uses the Firebase CLI's own sign-in on this machine (the same one used
// for `firebase deploy`), so no service account key file is needed.
// Nothing in Firebase is changed or deleted.
//
// Usage:  npm run migrate:export
const fs = require("node:fs");
const path = require("node:path");
const { requireAuth } = require("firebase-tools/lib/requireAuth");
const { getGlobalDefaultAccount } = require("firebase-tools/lib/auth");
const { Client } = require("firebase-tools/lib/apiv2");

const PROJECT = "dfrfms";
const COLLECTIONS = ["users", "fault_reports", "status_log"];
const OUT_DIR = path.join(__dirname, "..", "migration-data");

/** Convert Firestore's typed REST values into plain JSON values. */
function plain(value) {
  if (value === undefined || value === null) return null;
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("timestampValue" in value) return value.timestampValue; // ISO 8601
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(plain);
  if ("mapValue" in value) return Object.fromEntries(Object.entries(value.mapValue.fields ?? {}).map(([k, v]) => [k, plain(v)]));
  if ("referenceValue" in value) return value.referenceValue;
  return null;
}

async function readCollection(client, name) {
  const docs = [];
  let pageToken;
  do {
    const res = await client.get(`/projects/${PROJECT}/databases/(default)/documents/${name}`, {
      queryParams: { pageSize: "300", ...(pageToken ? { pageToken } : {}) },
    });
    for (const d of res.body.documents ?? []) {
      docs.push({
        id: d.name.split("/").pop(),
        createTime: d.createTime,
        updateTime: d.updateTime,
        data: Object.fromEntries(Object.entries(d.fields ?? {}).map(([k, v]) => [k, plain(v)])),
      });
    }
    pageToken = res.body.nextPageToken;
  } while (pageToken);
  return docs;
}

(async () => {
  // Load the account the Firebase CLI is signed in with, as the CLI itself does.
  const account = getGlobalDefaultAccount();
  if (!account) throw new Error("The Firebase CLI is not signed in. Run: npx firebase login");
  await requireAuth({ project: PROJECT, user: account.user, tokens: account.tokens });
  const client = new Client({ urlPrefix: "https://firestore.googleapis.com", apiVersion: "v1", auth: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const summary = {};
  for (const name of COLLECTIONS) {
    const docs = await readCollection(client, name);
    fs.writeFileSync(path.join(OUT_DIR, `${name}.json`), JSON.stringify(docs, null, 2));
    summary[name] = docs.length;
  }
  fs.writeFileSync(path.join(OUT_DIR, "export-summary.json"), JSON.stringify({ project: PROJECT, exportedAt: new Date().toISOString(), counts: summary }, null, 2));
  console.log("Exported from Firestore (read-only):");
  for (const [name, count] of Object.entries(summary)) console.log(`  ${name.padEnd(14)} ${count} documents`);
  console.log(`Saved to ${OUT_DIR}`);
})().catch((err) => {
  console.error("Export failed:", err?.message ?? err);
  process.exit(1);
});

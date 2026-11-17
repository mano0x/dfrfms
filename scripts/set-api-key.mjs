// Saves a new Appwrite API key into .env.local without showing it.
// Run it yourself in a terminal:  npm run key:set
// You paste the key at the prompt (nothing is displayed), and the script
// checks that the key works before telling you the result. The key is never
// printed, logged or sent anywhere except to your Appwrite project.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { Client, Query, Storage, TablesDB, Users } from "node-appwrite";

const FILE = new URL("../.env.local", import.meta.url);
if (!existsSync(FILE)) {
  console.error(".env.local was not found next to package.json.");
  process.exit(1);
}
const lines = readFileSync(FILE, "utf8").split(/\r?\n/);
const value = (name) => (lines.find((l) => l.startsWith(name + "=")) ?? "").slice(name.length + 1).trim();
const endpoint = value("NEXT_PUBLIC_APPWRITE_ENDPOINT");
const projectId = value("NEXT_PUBLIC_APPWRITE_PROJECT_ID");
const oldKey = value("APPWRITE_API_KEY");

/** Ask a question without echoing what is typed or pasted. */
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    process.stdout.write(question);
    rl._writeToOutput = () => {}; // do not echo the key
    rl.question("", (answer) => {
      rl.close();
      process.stdout.write("\n");
      // Some terminals wrap pasted text in invisible control codes; keep only
      // the visible characters a key can contain.
      resolve(answer.replace(/\x1b\[[0-9;]*[~A-Za-z]/g, "").replace(/[^\x21-\x7e]/g, ""));
    });
  });
}

const key = await askHidden("Paste the NEW Appwrite API key and press Enter (it will not be shown): ");

if (!key) { console.error("Nothing was entered. .env.local was not changed."); process.exit(1); }
if (/\s/.test(key)) { console.error("The key contains spaces or line breaks. Copy it again. .env.local was not changed."); process.exit(1); }
console.log(`Received ${key.length} characters${key.startsWith("standard_") ? "" : " (it does not start with standard_, which Appwrite keys normally do)"}.`);
if (key === oldKey) { console.error("This is the same key that is already saved. Create a new key in the Appwrite console first. .env.local was not changed."); process.exit(1); }

// Test the key before saving it: one harmless read per kind of access.
const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(key);
const checks = [
  ["database and tables", () => new TablesDB(client).getTable({ databaseId: "dfrmms", tableId: "fault_reports" })],
  ["rows", () => new TablesDB(client).listRows({ databaseId: "dfrmms", tableId: "users", queries: [Query.limit(1)] })],
  ["users", () => new Users(client).list({ queries: [Query.limit(1)] })],
  ["storage bucket", () => new Storage(client).getBucket({ bucketId: "dormitory-fault-photos" })],
  ["files", () => new Storage(client).listFiles({ bucketId: "dormitory-fault-photos", queries: [Query.limit(1)] })],
];
let failed = 0;
for (const [name, run] of checks) {
  try {
    await run();
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${name}  (${err?.code ?? ""} ${err?.type ?? "error"})`);
  }
}
if (failed) {
  console.error("\nThe key does not have all the access it needs (or is not valid). .env.local was NOT changed.");
  console.error("In the Appwrite console, edit the key's scopes: databases, tables, columns, indexes, rows, buckets, files, users, sessions.");
  process.exit(1);
}

const updated = lines.map((l) => (l.startsWith("APPWRITE_API_KEY=") ? `APPWRITE_API_KEY=${key}` : l));
writeFileSync(FILE, updated.join("\n"));
console.log("\nThe new key works and is saved in .env.local.");
console.log("Note: sign-in also needs the 'sessions' scope, which this check cannot test without signing in.");
console.log("Next: put the same key in Vercel, redeploy, then delete the old key in the Appwrite console.");

// Sets new passwords for sign-in accounts without showing them.
// Run it yourself in a terminal, naming one or more accounts:
//
//   npm run password:set -- admin@dfrmms.space
//   npm run password:set -- admin@dfrmms.space technician@dfrmms.space student@dfrmms.space
//
// For each account you type the new password twice at the prompt (nothing is
// displayed). A password is sent only to your Appwrite project; it is never
// printed, logged or written to a file. Only the password changes: the
// account's ID, email, name and role stay exactly as they are.
//
//   npm run password:set -- --check admin@dfrmms.space    find the accounts only; change nothing
import { createInterface } from "node:readline";
import { Client, Query, Users } from "node-appwrite";

const { NEXT_PUBLIC_APPWRITE_ENDPOINT: endpoint, NEXT_PUBLIC_APPWRITE_PROJECT_ID: projectId, APPWRITE_API_KEY: apiKey } = process.env;
if (!endpoint || !projectId || !apiKey) {
  console.error("Missing Appwrite settings in .env.local");
  process.exit(1);
}

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const emails = [...new Set(args.filter((a) => a.includes("@")).map((a) => a.trim().toLowerCase()))];
if (!emails.length) {
  console.error("Say which account(s):  npm run password:set -- admin@dfrmms.space");
  process.exit(1);
}

const users = new Users(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey));

// Find every account first, so a typing mistake stops the run before anything changes.
const accounts = [];
for (const email of emails) {
  const { users: found } = await users.list({ queries: [Query.equal("email", email), Query.limit(2)] });
  if (found.length !== 1) {
    console.error(`No account with the email ${email} was found. Nothing was changed.`);
    process.exit(1);
  }
  accounts.push(found[0]);
  console.log(`Found: ${found[0].name || "(no name)"} <${found[0].email}>, role: ${found[0].labels.join(", ") || "none"}`);
}
if (checkOnly) {
  console.log("Check only: nothing was changed.");
  process.exit(0);
}

/** Ask a question without echoing what is typed. */
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    process.stdout.write(question);
    rl._writeToOutput = () => {}; // do not echo the password
    rl.question("", (answer) => {
      rl.close();
      process.stdout.write("\n");
      // Some terminals wrap pasted text in invisible control codes.
      resolve(answer.replace(/\x1b\[[0-9;]*[~A-Za-z]/g, "").replace(/[\x00-\x1f\x7f]/g, ""));
    });
  });
}

let failed = 0;
for (const account of accounts) {
  console.log(`\n${account.email}`);
  const first = await askHidden("  New password (it will not be shown): ");
  if (first.length < 8 || first.length > 128) {
    console.error("  The password must be 8 to 128 characters. This account was not changed.");
    failed++;
    continue;
  }
  const second = await askHidden("  Type it again: ");
  if (first !== second) {
    console.error("  The two entries are different. This account was not changed.");
    failed++;
    continue;
  }
  try {
    await users.updatePassword({ userId: account.$id, password: first });
    console.log("  Changed. Sign in with the new password to confirm.");
  } catch (err) {
    // Appwrite can refuse very common passwords or ones containing personal details.
    console.error(`  Appwrite refused the change (${err?.type ?? err?.code ?? "error"}). This account was not changed.`);
    failed++;
  }
}
process.exit(failed ? 1 : 0);

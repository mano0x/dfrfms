/**
 * Appwrite clients for server code only (Next.js route handlers and scripts).
 *
 * The browser never talks to Appwrite directly. Every request goes through a
 * route handler, which identifies the caller from an httpOnly session cookie,
 * checks what that role may do, and only then uses the full-access client.
 *
 * The API key grants full access to the project, so it must never reach the
 * browser. It is read from APPWRITE_API_KEY, which has no NEXT_PUBLIC_ prefix
 * and is therefore never included in the browser bundle. Do not import this
 * file from a client component.
 */
import { Account, Client, Storage, TablesDB, Users } from "node-appwrite";
import { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID } from "./config";

if (typeof window !== "undefined") {
  throw new Error("lib/appwrite/server.ts must not be loaded in the browser.");
}

function baseClient() {
  if (!APPWRITE_PROJECT_ID) {
    throw new Error("Appwrite is not configured (NEXT_PUBLIC_APPWRITE_PROJECT_ID).");
  }
  return new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID);
}

/** Full-access services. Use only after the caller has been authorised. */
export function adminServices() {
  const apiKey = process.env.APPWRITE_API_KEY;
  if (!apiKey) throw new Error("Appwrite is not configured on the server (APPWRITE_API_KEY).");
  const client = baseClient().setKey(apiKey);
  return {
    account: new Account(client), // creates sessions and returns their secret
    tablesDB: new TablesDB(client),
    storage: new Storage(client),
    users: new Users(client),
  };
}

/** Services that act as the signed-in user identified by a session secret. */
export function sessionServices(sessionSecret: string) {
  const client = baseClient().setSession(sessionSecret);
  return { account: new Account(client) };
}

/** Services with no credentials at all (public operations such as password recovery). */
export function guestServices() {
  return { account: new Account(baseClient()) };
}

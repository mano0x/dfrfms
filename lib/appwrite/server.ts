/**
 * Appwrite clients for server code only (Next.js route handlers and scripts).
 *
 * The API key grants full access to the project, so it must never reach the
 * browser. It is read from APPWRITE_API_KEY, which has no NEXT_PUBLIC_ prefix
 * and is therefore never included in the browser bundle. Do not import this
 * file from a client component.
 */
import { Account, Client, Storage, TablesDB, Users } from "node-appwrite";
import { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, ROLE_LABELS } from "./config";
import type { Role } from "../maintenance";

if (typeof window !== "undefined") {
  throw new Error("lib/appwrite/server.ts must not be loaded in the browser.");
}

/** Full-access client for privileged work after the caller has been authorised. */
export function adminServices() {
  const apiKey = process.env.APPWRITE_API_KEY;
  if (!apiKey || !APPWRITE_PROJECT_ID) {
    throw new Error("Appwrite is not configured on the server (APPWRITE_API_KEY / NEXT_PUBLIC_APPWRITE_PROJECT_ID).");
  }
  const client = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID).setKey(apiKey);
  return {
    tablesDB: new TablesDB(client),
    storage: new Storage(client),
    users: new Users(client),
  };
}

export type Caller = { id: string; name: string; email: string; role: Role };

/**
 * Identify the caller of a server route from the short-lived token (JWT) the
 * browser obtained for its signed-in session. Appwrite itself verifies the
 * token; the role is read from the account's labels, which only the server
 * can change, so a role sent by the browser is never trusted.
 * Returns null when the token is missing, invalid or expired, or when the
 * account has no role.
 */
export async function identifyCaller(jwt: string | null | undefined): Promise<Caller | null> {
  if (!jwt || !APPWRITE_PROJECT_ID) return null;
  try {
    const client = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID).setJWT(jwt);
    const user = await new Account(client).get();
    const role = ROLE_LABELS.find((r) => user.labels?.includes(r));
    if (!role) return null;
    return { id: user.$id, name: user.name || user.email, email: user.email, role };
  } catch {
    return null;
  }
}

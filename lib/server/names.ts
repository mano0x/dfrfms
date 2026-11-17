/** Reads the current name of every sign-in account. Server only. */
import { Query } from "node-appwrite";
import { adminServices } from "../appwrite/server";
import type { NameMap } from "../names";

const MAX_ACCOUNTS = 500;

/**
 * Current names by account ID, read from the sign-in accounts, which are the
 * one place a name is edited. If the lookup fails the map is empty, and
 * callers fall back to the names stored with the data.
 */
export async function currentNames(): Promise<NameMap> {
  try {
    const { users } = await adminServices().users.list({ queries: [Query.limit(MAX_ACCOUNTS)] });
    return new Map(users.filter((u) => u.name).map((u) => [u.$id, u.name]));
  } catch (err) {
    console.error("Could not read account names:", (err as { type?: string })?.type ?? err);
    return new Map();
  }
}

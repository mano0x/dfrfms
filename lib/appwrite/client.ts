/**
 * Appwrite client for the browser. It carries the signed-in user's session
 * and can only do what that user's permissions allow: sign in and out, read
 * the rows the user may see, and upload photos. All changes to data go
 * through the server routes, never from here.
 */
import { Account, Client, Storage, TablesDB } from "appwrite";
import { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID } from "./config";

export const appwriteClient = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID);

export const account = new Account(appwriteClient);
export const tablesDB = new TablesDB(appwriteClient);
export const storage = new Storage(appwriteClient);

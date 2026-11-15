/**
 * Appwrite identifiers shared by the browser and the server.
 * Nothing here is secret: the endpoint and project ID are public by design.
 * The server API key is read only in lib/appwrite/server.ts.
 *
 * Keep the IDs in step with scripts/appwrite-setup.mjs.
 */
export const APPWRITE_ENDPOINT =
  process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "https://fra.cloud.appwrite.io/v1";

export const APPWRITE_PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || "";

export const DATABASE_ID = "dfrmms";

export const TABLES = {
  users: "users",
  reports: "fault_reports",
  history: "status_log",
} as const;

export const PHOTO_BUCKET_ID = "dormitory-fault-photos";

/** Roles are stored as Appwrite user labels, which only the server can set. */
export const ROLE_LABELS = ["student", "technician", "admin"] as const;

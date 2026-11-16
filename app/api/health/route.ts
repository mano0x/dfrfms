import { adminServices } from "@/lib/appwrite/server";
import { APPWRITE_PROJECT_ID, DATABASE_ID } from "@/lib/appwrite/config";
import { ok } from "@/lib/server/http";

/**
 * Deployment check: is the server configured and can it reach the backend?
 * It reports only yes/no answers - no settings, IDs or error details - so it
 * is safe to leave public.
 */
export async function GET() {
  const configured = Boolean(APPWRITE_PROJECT_ID && process.env.APPWRITE_API_KEY);
  let backend: "ok" | "unreachable" | "not configured" = "not configured";
  if (configured) {
    try {
      await adminServices().tablesDB.get({ databaseId: DATABASE_ID });
      backend = "ok";
    } catch {
      backend = "unreachable";
    }
  }
  return ok({ ok: backend === "ok", configured, backend }, backend === "ok" ? 200 : 503);
}

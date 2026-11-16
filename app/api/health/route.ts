import { adminServices } from "@/lib/appwrite/server";
import { APPWRITE_PROJECT_ID, DATABASE_ID } from "@/lib/appwrite/config";
import { ok } from "@/lib/server/http";

/**
 * Deployment check: is the server configured and can it reach the backend?
 * It reports only whether each setting is present ("set" / "missing") and
 * yes/no answers - never a value, an ID or an error detail - so it is safe to
 * leave public.
 */
export async function GET() {
  const settings = {
    // Built into the site when it is built: changing it needs a new deployment.
    NEXT_PUBLIC_APPWRITE_PROJECT_ID: APPWRITE_PROJECT_ID ? "set" : "missing",
    // Read by the server while it runs.
    APPWRITE_API_KEY: process.env.APPWRITE_API_KEY ? "set" : "missing",
  };
  const configured = Object.values(settings).every((v) => v === "set");

  let backend: "ok" | "unreachable" | "not configured" = "not configured";
  if (configured) {
    try {
      await adminServices().tablesDB.get({ databaseId: DATABASE_ID });
      backend = "ok";
    } catch {
      // Settings are present but wrong (project ID or key), or the key lacks access.
      backend = "unreachable";
    }
  }
  return ok({ ok: backend === "ok", configured, backend, settings }, backend === "ok" ? 200 : 503);
}

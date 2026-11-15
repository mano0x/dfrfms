import { handle, ok, readJson } from "@/lib/server/http";
import { requireCaller } from "@/lib/server/session";
import { createReport, listReports } from "@/lib/server/reports";

/** Reports the caller may see: a resident's own reports, or all reports for staff. */
export async function GET(request: Request) {
  return handle(async () => {
    const guard = await requireCaller(request, ["student", "technician", "admin"]);
    if (guard.response) return guard.response;
    return ok({ reports: await listReports(guard.caller) });
  });
}

/** Submit a new fault report. Residents only. */
export async function POST(request: Request) {
  return handle(async () => {
    const guard = await requireCaller(request, ["student"]);
    if (guard.response) return guard.response;
    return ok({ report: await createReport(guard.caller, await readJson(request)) }, 201);
  });
}

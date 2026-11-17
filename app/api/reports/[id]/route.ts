import { HttpError, handle, ok, readJson } from "@/lib/server/http";
import { requireCaller } from "@/lib/server/session";
import {
  assignTechnician, editReport, forDisplay, getReportFor, overridePriority, saveNote, setStatus,
} from "@/lib/server/reports";

type Context = { params: Promise<{ id: string }> };

/** One report, if the caller may see it. */
export async function GET(request: Request, { params }: Context) {
  return handle(async () => {
    const guard = await requireCaller(request, ["student", "technician", "admin"]);
    if (guard.response) return guard.response;
    return ok({ report: await forDisplay(await getReportFor(guard.caller, (await params).id)) });
  });
}

/**
 * Change a report. The body names one action; each action has its own
 * authorisation rule (lib/access.ts), checked again here on the server:
 *   { action: "edit", title, category, urgency, description, photoFileId? }  resident (owner)
 *   { action: "status", status }                                             assigned technician / administrator
 *   { action: "assign", technicianId | null }                                administrator
 *   { action: "priority", priority, reason }                                 administrator
 *   { action: "note", note }                                                 assigned technician / administrator
 */
export async function PATCH(request: Request, { params }: Context) {
  return handle(async () => {
    const guard = await requireCaller(request, ["student", "technician", "admin"]);
    if (guard.response) return guard.response;
    const { caller } = guard;
    const { id } = await params;
    const body = (await readJson(request)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") throw new HttpError(400, "Invalid request.");

    switch (body.action) {
      case "edit":
        return ok({ report: await forDisplay(await editReport(caller, id, body)) });
      case "status":
        return ok({ report: await forDisplay(await setStatus(caller, id, body.status)) });
      case "assign":
        return ok({ report: await forDisplay(await assignTechnician(caller, id, body.technicianId ?? null)) });
      case "priority":
        return ok({ report: await forDisplay(await overridePriority(caller, id, body)) });
      case "note":
        return ok({ report: await forDisplay(await saveNote(caller, id, body.note)) });
      default:
        throw new HttpError(400, "Unknown action.");
    }
  });
}

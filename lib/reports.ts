/**
 * Data operations on fault reports. Every change to a report is written
 * together with a history entry in `status_log` using a single batch, so the
 * report and its audit trail cannot get out of step.
 */
import {
  collection, doc, getDocs, query, serverTimestamp, where, writeBatch,
  type Timestamp, type WriteBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  canChangeStatus, priorityOverrideSchema, resolutionNoteSchema, firstError,
  type Priority, type Role, type Status,
} from "./maintenance";

export type Actor = { uid: string; name: string; role: Role };

export type LogType = "created" | "status" | "assignment" | "priority" | "note" | "edited";

export type LogEntry = {
  id: string;
  reportId: string;
  type?: LogType;
  from?: string | null;
  to?: string | null;
  note?: string;
  actorId?: string;
  actorName?: string;
  actorRole?: Role;
  /** Legacy field written by the coursework version for resolution notes. */
  technicianName?: string;
  timestamp?: Timestamp | null;
};

type ReportRef = { id: string; status: string; priority?: string; assignedTo?: string | null; assignedToId?: string | null };

function addLog(
  batch: WriteBatch,
  reportId: string,
  actor: Actor,
  entry: { type: LogType; from?: string | null; to?: string | null; note?: string }
) {
  batch.set(doc(collection(db, "status_log")), {
    reportId,
    type: entry.type,
    from: entry.from ?? null,
    to: entry.to ?? null,
    note: entry.note ?? "",
    actorId: actor.uid,
    actorName: actor.name,
    actorRole: actor.role,
    timestamp: serverTimestamp(),
  });
}

/** History entry for a newly created report (called right after creation). */
export async function logReportCreated(reportId: string, actor: Actor) {
  const batch = writeBatch(db);
  addLog(batch, reportId, actor, { type: "created", to: "open" });
  await batch.commit();
}

/** History entry for a resident's edit of their own open report. */
export async function logReportEdited(reportId: string, actor: Actor) {
  const batch = writeBatch(db);
  addLog(batch, reportId, actor, { type: "edited" });
  await batch.commit();
}

/** Change a report's status if the workflow allows it for the actor's role. */
export async function changeStatus(report: ReportRef, to: Status, actor: Actor) {
  if (!canChangeStatus(actor.role, report.status, to)) {
    throw new Error(`A ${actor.role} cannot change a report from "${report.status}" to "${to}".`);
  }
  const batch = writeBatch(db);
  batch.update(doc(db, "fault_reports", report.id), { status: to, updatedAt: serverTimestamp() });
  addLog(batch, report.id, actor, { type: "status", from: report.status, to });
  await batch.commit();
}

/**
 * Assign a technician (or unassign with `null`). Assigning an open report also
 * moves it to "in-progress". The technician is stored by account ID
 * (`assignedToId`) with the name kept alongside for display.
 * Returns the report's status after the change.
 */
export async function assignTechnician(
  report: ReportRef,
  technician: { id: string; name: string } | null,
  actor: Actor
): Promise<string> {
  const nextStatus = technician && report.status === "open" ? "in-progress" : report.status;
  const batch = writeBatch(db);
  batch.update(doc(db, "fault_reports", report.id), {
    assignedTo: technician ? technician.name : null,
    assignedToId: technician ? technician.id : null,
    status: nextStatus,
    updatedAt: serverTimestamp(),
  });
  addLog(batch, report.id, actor, {
    type: "assignment",
    from: report.assignedTo || null,
    to: technician ? technician.name : null,
  });
  if (nextStatus !== report.status) {
    addLog(batch, report.id, actor, { type: "status", from: report.status, to: nextStatus });
  }
  await batch.commit();
  return nextStatus;
}

/** Administrator triage: set the priority with a recorded reason. */
export async function overridePriority(report: ReportRef, priority: Priority, reason: string, actor: Actor) {
  if (actor.role !== "admin") throw new Error("Only an administrator can change a report's priority.");
  const parsed = priorityOverrideSchema.safeParse({ priority, reason });
  if (!parsed.success) throw new Error(firstError(parsed));
  const batch = writeBatch(db);
  batch.update(doc(db, "fault_reports", report.id), {
    priority: parsed.data.priority,
    priorityOverridden: true,
    priorityReason: parsed.data.reason,
    updatedAt: serverTimestamp(),
  });
  addLog(batch, report.id, actor, {
    type: "priority",
    from: report.priority ?? null,
    to: parsed.data.priority,
    note: parsed.data.reason,
  });
  await batch.commit();
}

/** Save the resolution note on the report and record it in the history. */
export async function saveResolutionNote(report: ReportRef, note: string, actor: Actor): Promise<string> {
  const parsed = resolutionNoteSchema.safeParse(note);
  if (!parsed.success) throw new Error(firstError(parsed));
  const batch = writeBatch(db);
  batch.update(doc(db, "fault_reports", report.id), { resolutionNote: parsed.data, updatedAt: serverTimestamp() });
  addLog(batch, report.id, actor, { type: "note", note: parsed.data });
  await batch.commit();
  return parsed.data;
}

/** All history entries of one report, oldest first. */
export async function fetchTimeline(reportId: string): Promise<LogEntry[]> {
  const snap = await getDocs(query(collection(db, "status_log"), where("reportId", "==", reportId)));
  const entries = snap.docs.map((d) => ({ id: d.id, ...d.data() } as LogEntry));
  entries.sort((a, b) => (a.timestamp?.seconds ?? 0) - (b.timestamp?.seconds ?? 0));
  return entries;
}

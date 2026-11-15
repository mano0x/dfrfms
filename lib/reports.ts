/**
 * Browser-side data layer for fault reports. Every function calls one of the
 * application's own server routes; the server decides what the signed-in
 * user may see and do (lib/access.ts) and validates everything again.
 */
import { ApiError, api } from "./api";
import { prepareImage } from "./image-client";
import type { HistoryDTO, ReportDTO } from "./server/reports"; // types only - no server code is bundled

export type Report = ReportDTO;
export type LogEntry = HistoryDTO;

export type ReportInput = { title: string; category: string; urgency: string; description: string; photoFileId?: string | null };

export const fetchReports = async () => (await api<{ reports: Report[] }>("/api/reports")).reports;

export const createReport = async (input: ReportInput) =>
  (await api<{ report: Report }>("/api/reports", { method: "POST", body: input })).report;

const patch = async (reportId: string, body: Record<string, unknown>) =>
  (await api<{ report: Report }>(`/api/reports/${encodeURIComponent(reportId)}`, { method: "PATCH", body })).report;

export const editReport = (reportId: string, input: ReportInput) => patch(reportId, { action: "edit", ...input });
export const changeStatus = (reportId: string, status: string) => patch(reportId, { action: "status", status });
export const assignTechnician = (reportId: string, technicianId: string | null) => patch(reportId, { action: "assign", technicianId });
export const overridePriority = (reportId: string, priority: string, reason: string) => patch(reportId, { action: "priority", priority, reason });
export const saveResolutionNote = (reportId: string, note: string) => patch(reportId, { action: "note", note });

export const fetchTimeline = async (reportId: string) =>
  (await api<{ history: LogEntry[] }>(`/api/reports/${encodeURIComponent(reportId)}/history`)).history;

/** Resize the photo in the browser, upload it, and return its file ID. */
export async function uploadPhoto(file: File): Promise<string> {
  const form = new FormData();
  form.append("photo", await prepareImage(file), "photo.jpg");
  const response = await fetch("/api/photos", { method: "POST", body: form, credentials: "same-origin" });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(data?.error || "The photo could not be uploaded.", response.status);
  return data.photoFileId as string;
}

/** Address of a report's photo. The server checks access on every request. */
export const photoUrl = (photoFileId: string) => `/api/photos/${encodeURIComponent(photoFileId)}`;

/* ---------- dates (the server sends ISO strings) ---------- */

export const toDate = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};
export const formatDate = (iso: string | null | undefined) => toDate(iso)?.toLocaleDateString() ?? "—";
export const formatDateTime = (iso: string | null | undefined) => toDate(iso)?.toLocaleString() ?? "—";

/** Message to show for a failed request. */
export const errorMessage = (err: unknown, fallback = "The change could not be saved. Please try again.") =>
  err instanceof ApiError ? err.message : fallback;

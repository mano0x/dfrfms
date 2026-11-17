/**
 * Browser-side data layer for the free item exchange. Every function calls
 * one of the application's own server routes; the server decides what the
 * signed-in user may see and do (lib/sharing.ts).
 */
import { ApiError, api } from "./api";
import { prepareImage } from "./image-client";
import type { ListingView } from "./sharing";
import type { AdminListingView, SharingStats } from "./server/sharing"; // types only - no server code is bundled

export type Item = ListingView;
export type AdminItem = AdminListingView;
export type ItemStats = SharingStats;

export type ItemInput = {
  title: string; description: string; category: string; condition: string; location: string;
  collectionTime: string | null; expiresOn: string | null; photoIds: string[];
};

export const fetchItems = async () => (await api<{ listings: Item[] }>("/api/free")).listings;
export const fetchAdminItems = () => api<{ listings: AdminItem[]; stats: ItemStats }>("/api/free");

export const publishItem = async (input: ItemInput) => (await api<{ listing: Item }>("/api/free", { method: "POST", body: input })).listing;

const act = async <T = Item>(itemId: string, action: string, extra: Record<string, unknown> = {}) =>
  (await api<{ listing: T }>(`/api/free/${encodeURIComponent(itemId)}`, { method: "PATCH", body: { action, ...extra } })).listing;

export const editItem = (itemId: string, input: ItemInput) => act(itemId, "edit", input);
export const withdrawItem = (itemId: string) => act(itemId, "withdraw");
export const reserveItem = (itemId: string) => act(itemId, "reserve");
export const cancelItemReservation = (itemId: string) => act(itemId, "cancel");
export const confirmItemHandover = (itemId: string) => act(itemId, "handover");
export const reportItem = (itemId: string, reason: string) => act<undefined>(itemId, "report", { reason });
export const removeItem = (itemId: string, reason: string) => act<AdminItem>(itemId, "remove", { reason });
export const dismissItemReports = (itemId: string) => act<AdminItem>(itemId, "dismiss-reports");

/** Resize the photo in the browser, upload it, and return its file ID. */
export async function uploadItemPhoto(file: File): Promise<string> {
  const form = new FormData();
  form.append("photo", await prepareImage(file), "photo.jpg");
  const response = await fetch("/api/free/photos", { method: "POST", body: form, credentials: "same-origin" });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(data?.error || "The photo could not be uploaded.", response.status);
  return data.photoFileId as string;
}

/** Address of an item's photo. The server checks access on every request. */
export const itemPhotoUrl = (photoFileId: string) => `/api/free/photos/${encodeURIComponent(photoFileId)}`;

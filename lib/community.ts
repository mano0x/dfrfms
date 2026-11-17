/**
 * Browser-side data layer for neighbour notices and notifications. Every
 * function calls one of the application's own server routes; the server
 * decides what the signed-in user may see and do (lib/neighbour.ts).
 */
import { api } from "./api";
import type { NoticeView } from "./neighbour";
import type { ModerationDTO, SenderDTO } from "./server/neighbour"; // types only - no server code is bundled
import type { NotificationDTO } from "./server/notifications";

export type Notice = NoticeView;
export type ModerationEntry = ModerationDTO;
export type NoticeSender = SenderDTO;
export type Notification = NotificationDTO;
export type Inbox = { notifications: Notification[]; unread: number };

export type NoticeInput = { category: string; subject: string; description: string; area: string | null };

export const fetchNotices = async () => (await api<{ notices: Notice[] }>("/api/neighbour")).notices;

export const sendNotice = async (input: NoticeInput) =>
  (await api<{ notice: Notice }>("/api/neighbour", { method: "POST", body: input })).notice;

const path = (noticeId: string, rest = "") => `/api/neighbour/${encodeURIComponent(noticeId)}${rest}`;
const moderate = async (noticeId: string, body: Record<string, unknown>) =>
  (await api<{ notice: Notice }>(path(noticeId), { method: "PATCH", body })).notice;

export const setNoticeStatus = (noticeId: string, status: string) => moderate(noticeId, { action: "status", status });
export const publishNotice = (noticeId: string) => moderate(noticeId, { action: "publish" });
export const unpublishNotice = (noticeId: string) => moderate(noticeId, { action: "unpublish" });
export const removeNotice = (noticeId: string, reason: string) => moderate(noticeId, { action: "remove", reason });
export const respondToNotice = (noticeId: string, response: string) => moderate(noticeId, { action: "respond", response });

/** Ask the server who sent a notice. The request and its reason are recorded. */
export const viewSender = async (noticeId: string, reason: string) =>
  (await api<{ sender: NoticeSender }>(path(noticeId, "/reveal"), { method: "POST", body: { reason } })).sender;

export const fetchModeration = async (noticeId: string) =>
  (await api<{ actions: ModerationEntry[] }>(path(noticeId, "/actions"))).actions;

export const fetchInbox = () => api<Inbox>("/api/notifications");
export const markNotificationRead = (id: string) => api<Inbox>("/api/notifications", { method: "PATCH", body: { id } });
export const markAllNotificationsRead = () => api<Inbox>("/api/notifications", { method: "PATCH", body: { all: true } });

/** Other pages listen for this to refresh the unread count in the navigation. */
export const INBOX_CHANGED = "dfrmms:inbox-changed";
export const announceInboxChange = () => window.dispatchEvent(new Event(INBOX_CHANGED));

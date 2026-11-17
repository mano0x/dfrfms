/**
 * In-app notifications: short messages shown to one account inside the
 * application. No email or push message is sent. Server only.
 */
import { ID, Query } from "node-appwrite";
import { adminServices } from "../appwrite/server";
import { DATABASE_ID, TABLES } from "../appwrite/config";
import type { Actor } from "../access";
import { roleFromLabels } from "./session";
import { HttpError } from "./http";

export type NotificationDTO = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
};

export type NewNotification = { type: string; title: string; body?: string; link?: string };

const table = { databaseId: DATABASE_ID, tableId: TABLES.notifications };
const MAX_LISTED = 50;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toNotification = (row: any): NotificationDTO => ({
  id: row.$id,
  type: row.type,
  title: row.title,
  body: row.body ?? null,
  link: row.link ?? null,
  read: row.read === true,
  createdAt: row.createdAt,
});

/** Add a notification for one account, as part of the caller's transaction. */
export function notify(transactionId: string, userId: string, message: NewNotification, at: string) {
  return adminServices().tablesDB.createRow({
    ...table,
    rowId: ID.unique(),
    transactionId,
    permissions: [],
    data: {
      userId,
      type: message.type,
      title: message.title.slice(0, 120),
      body: message.body?.slice(0, 300) ?? null,
      link: message.link ?? null,
      read: false,
      createdAt: at,
    },
  });
}

/** The account IDs of all active administrators. */
export async function administratorIds(): Promise<string[]> {
  const { users } = await adminServices().users.list({ queries: [Query.limit(500)] });
  return users.filter((u) => u.status !== false && roleFromLabels(u.labels) === "admin").map((u) => u.$id);
}

/** The caller's own notifications, newest first, and how many are unread. */
export async function listNotifications(actor: Actor): Promise<{ notifications: NotificationDTO[]; unread: number }> {
  const { tablesDB } = adminServices();
  const [recent, unread] = await Promise.all([
    tablesDB.listRows({ ...table, queries: [Query.equal("userId", actor.id), Query.orderDesc("createdAt"), Query.limit(MAX_LISTED)] }),
    tablesDB.listRows({ ...table, queries: [Query.equal("userId", actor.id), Query.equal("read", false), Query.limit(1)] }),
  ]);
  return { notifications: recent.rows.map(toNotification), unread: unread.total };
}

/** Mark one of the caller's notifications as read. Someone else's notification is reported as not found. */
export async function markRead(actor: Actor, notificationId: string): Promise<void> {
  const { tablesDB } = adminServices();
  let ownerId: string;
  try {
    ownerId = (await tablesDB.getRow({ ...table, rowId: notificationId })).userId;
  } catch {
    throw new HttpError(404, "Notification not found.");
  }
  if (ownerId !== actor.id) throw new HttpError(404, "Notification not found.");
  await tablesDB.updateRow({ ...table, rowId: notificationId, data: { read: true } });
}

/** Mark all of the caller's unread notifications as read. */
export async function markAllRead(actor: Actor): Promise<void> {
  const { tablesDB } = adminServices();
  const { rows } = await tablesDB.listRows({ ...table, queries: [Query.equal("userId", actor.id), Query.equal("read", false), Query.limit(200)] });
  for (const row of rows) await tablesDB.updateRow({ ...table, rowId: row.$id, data: { read: true } });
}

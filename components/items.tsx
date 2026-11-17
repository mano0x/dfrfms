"use client";
/* eslint-disable @next/next/no-img-element -- photos come from an authorised route, not a public image host */
import type { ReactNode } from "react";
import {
  ITEM_CATEGORY_LABEL, ITEM_CONDITION_LABEL, ITEM_STATUS_LABEL,
  type ItemCategory, type ItemCondition, type ItemStatus,
} from "@/lib/sharing";
import { itemPhotoUrl, type Item } from "@/lib/free";
import { formatDate, formatDateTime } from "@/lib/reports";
import { Card, Tag, cx } from "./ui";

export const itemCategoryName = (v: string) => ITEM_CATEGORY_LABEL[v as ItemCategory] ?? v;
export const itemConditionName = (v: string) => ITEM_CONDITION_LABEL[v as ItemCondition] ?? v;

/** Status of an item. A filled label marks an item that can be reserved now. */
export function ItemStatusTag({ status }: { status: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold",
        status === "available" ? "border-ink bg-ink text-on-brand" : "border-line-strong bg-surface text-ink-2"
      )}
    >
      {ITEM_STATUS_LABEL[status as ItemStatus] ?? status}
    </span>
  );
}

export function ItemPhotos({ item, size = "h-28 w-28" }: { item: Pick<Item, "photoIds" | "title">; size?: string }) {
  if (!item.photoIds.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {item.photoIds.map((id, i) => (
        <a key={id} href={itemPhotoUrl(id)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-line">
          <img src={itemPhotoUrl(id)} alt={`${item.title}, photo ${i + 1}`} loading="lazy" className={cx(size, "object-cover")} />
        </a>
      ))}
    </div>
  );
}

/** Where and when to collect, shown only when the server sent the details. */
export function CollectionDetails({ item }: { item: Item }) {
  if (!item.location) return null;
  return (
    <div className="mt-4 rounded-lg border border-line bg-surface-2 px-3.5 py-3 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Collection</p>
      <p className="mt-1 text-ink">{item.location}</p>
      {item.collectionTime && <p className="text-ink-2">{item.collectionTime}</p>}
      {item.reservationExpiresAt && <p className="mt-1 text-xs text-muted">Reserved until {formatDateTime(item.reservationExpiresAt)}</p>}
    </div>
  );
}

/** One item as a card. `children` holds the note and buttons for the viewer. */
export function ItemCard({ item, children }: { item: Item; children?: ReactNode }) {
  return (
    <Card className="flex flex-col p-5">
      <div className="flex flex-wrap items-center gap-2">
        <ItemStatusTag status={item.status} />
        <Tag>{itemCategoryName(item.category)}</Tag>
        <Tag>{itemConditionName(item.condition)}</Tag>
      </div>
      <h3 className="mt-3 font-semibold text-ink">{item.title}</h3>
      <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink-2">{item.description}</p>
      {item.photoIds.length > 0 && <div className="mt-3"><ItemPhotos item={item} /></div>}
      <p className="mt-3 text-xs text-muted">
        Offered by {item.mine ? "you" : item.ownerName} · {formatDate(item.createdAt)}
        {item.expiresAt && ` · listed until ${formatDate(item.expiresAt)}`}
      </p>
      <CollectionDetails item={item} />
      {children && <div className="mt-4 border-t border-line pt-4">{children}</div>}
    </Card>
  );
}

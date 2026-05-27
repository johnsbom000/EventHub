import { type InsertNotification, type Notification, notifications } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "../db";
import { and, desc, eq, gt, inArray, isNull, ne, or, sql as drizzleSql } from "drizzle-orm";

export async function createNotification(
  insertNotification: InsertNotification
): Promise<Notification> {
  const [row] = await db
    .insert(notifications)
    .values({
      id: randomUUID(),
      recipientId: insertNotification.recipientId,
      recipientType: insertNotification.recipientType,
      type: insertNotification.type,
      title: insertNotification.title,
      message: insertNotification.message,
      link: insertNotification.link ?? null,
      read: insertNotification.read ?? false,
      createdAt: new Date(),
    })
    .returning();
  return row as Notification;
}

export async function getNotificationsByRecipient(
  recipientId: string,
  recipientType: string
): Promise<Notification[]> {
  const rows = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.recipientId, recipientId),
        eq(notifications.recipientType, recipientType as "customer" | "vendor"),
        ne(notifications.archived, true),
        or(isNull(notifications.expiresAt), gt(notifications.expiresAt, drizzleSql`now()`))
      )
    )
    .orderBy(desc(notifications.createdAt))
    .limit(100);
  return rows as Notification[];
}

export async function markNotificationAsRead(
  id: string,
  recipientId: string,
  recipientType: string
): Promise<boolean> {
  const rows = await db
    .update(notifications)
    .set({ read: true })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.recipientId, recipientId),
        eq(notifications.recipientType, recipientType as "customer" | "vendor")
      )
    )
    .returning({ id: notifications.id });
  return rows.length > 0;
}

export async function bulkMarkNotificationsRead(
  ids: string[],
  recipientId: string,
  recipientType: string
): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await db
    .update(notifications)
    .set({ read: true })
    .where(
      and(
        inArray(notifications.id, ids),
        eq(notifications.recipientId, recipientId),
        eq(notifications.recipientType, recipientType as "customer" | "vendor")
      )
    )
    .returning({ id: notifications.id });
  return rows.length;
}

export async function bulkArchiveNotifications(
  ids: string[],
  recipientId: string,
  recipientType: string
): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await db
    .update(notifications)
    .set({ archived: true })
    .where(
      and(
        inArray(notifications.id, ids),
        eq(notifications.recipientId, recipientId),
        eq(notifications.recipientType, recipientType as "customer" | "vendor")
      )
    )
    .returning({ id: notifications.id });
  return rows.length;
}

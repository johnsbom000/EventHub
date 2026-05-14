import {
  type Notification,
  type InsertNotification,
  notifications,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { and, desc, eq, or, isNull, gt, sql as drizzleSql } from "drizzle-orm";

/**
 * IStorage — minimal interface for the notification helpers called via
 * `storage.*` from routes. All other data operations (bookings, payments,
 * listings, profiles) talk to `db` directly inside routes.ts.
 */
export interface IStorage {
  createNotification(notification: InsertNotification): Promise<Notification>;
  getNotificationsByRecipient(recipientId: string, recipientType: string): Promise<Notification[]>;
  markNotificationAsRead(id: string, recipientId: string, recipientType: string): Promise<boolean>;
}

class DbStorage implements IStorage {
  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
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

  async getNotificationsByRecipient(
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
          // Exclude notifications past their 90-day expiry window.
          // isNull guard handles rows created before migration 0053 ran.
          or(isNull(notifications.expiresAt), gt(notifications.expiresAt, drizzleSql`now()`))
        )
      )
      .orderBy(desc(notifications.createdAt))
      .limit(100); // cap at 100 — prevents unbounded payload growth

    return rows as Notification[];
  }

  async markNotificationAsRead(
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
}

export const storage = new DbStorage();

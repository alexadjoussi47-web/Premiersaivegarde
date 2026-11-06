import {
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { productsTable } from "./products";

export const orderStatus = pgEnum("order_status", ["pending", "paid", "failed"]);
export const paymentMethod = pgEnum("payment_method", [
  "mixx_by_yas",
  "flooz",
]);

export const ordersTable = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id),
    productTitle: varchar("product_title", { length: 160 }).notNull(),
    productFileObjectPath: text("product_file_object_path").notNull(),
    productFileName: varchar("product_file_name", { length: 180 }).notNull(),
    productFileContentType: varchar("product_file_content_type", { length: 100 }).notNull(),
    productFileSize: integer("product_file_size").notNull(),
    amountFcfa: integer("amount_fcfa").notNull(),
    customerName: varchar("customer_name", { length: 120 }).notNull(),
    email: varchar("email", { length: 254 }).notNull(),
    phone: varchar("phone", { length: 24 }).notNull(),
    siteOrigin: varchar("site_origin", { length: 512 }).notNull(),
    paymentMethod: paymentMethod("payment_method").notNull(),
    status: orderStatus("status").notNull().default("pending"),
    providerTransactionId: varchar("provider_transaction_id", { length: 120 }),
    downloadTokenHash: varchar("download_token_hash", { length: 64 }),
    downloadExpiresAt: timestamp("download_expires_at", { withTimezone: true }),
    downloadCount: integer("download_count").notNull().default(0),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
    emailDeliveryClaimedAt: timestamp("email_delivery_claimed_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("orders_provider_transaction_unique").on(
      table.providerTransactionId,
    ),
    uniqueIndex("orders_download_token_hash_unique").on(
      table.downloadTokenHash,
    ),
  ],
);

export const webhookEventsTable = pgTable(
  "payment_webhook_events",
  {
    id: serial("id").primaryKey(),
    providerEventKey: varchar("provider_event_key", { length: 180 }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("payment_webhook_events_key_unique").on(table.providerEventKey),
  ],
);

export type Order = typeof ordersTable.$inferSelect;
export type NewOrder = typeof ordersTable.$inferInsert;

import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
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

export const productType = pgEnum("product_type", ["ebook", "formation"]);

export const productsTable = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 180 }).notNull(),
    type: productType("type").notNull(),
    category: varchar("category", { length: 80 }).notNull(),
    description: text("description").notNull(),
    priceFcfa: integer("price_fcfa").notNull(),
    coverUrl: varchar("cover_url", { length: 2048 }),
    fileObjectPath: text("file_object_path").notNull(),
    fileName: varchar("file_name", { length: 180 }).notNull(),
    fileContentType: varchar("file_content_type", { length: 100 }).notNull(),
    fileSize: integer("file_size").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("products_slug_unique").on(table.slug)],
);

export const productUploadsTable = pgTable("product_uploads", {
  uploadId: uuid("upload_id").defaultRandom().primaryKey(),
  objectPath: text("object_path").notNull(),
  originalName: varchar("original_name", { length: 180 }).notNull(),
  contentType: varchar("content_type", { length: 100 }).notNull(),
  size: integer("size").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertProductSchema = createInsertSchema(productsTable);
export type Product = typeof productsTable.$inferSelect;
export type NewProduct = typeof productsTable.$inferInsert;

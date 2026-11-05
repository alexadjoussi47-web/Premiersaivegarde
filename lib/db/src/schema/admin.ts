import {
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const adminCredentialsTable = pgTable("admin_credentials", {
  id: serial("id").primaryKey(),
  passwordHash: text("password_hash").notNull(),
  salt: varchar("salt", { length: 64 }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const contactMessagesTable = pgTable("contact_messages", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 254 }).notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

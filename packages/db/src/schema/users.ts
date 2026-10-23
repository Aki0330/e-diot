import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  numeric,
  pgTable,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * users 表（1:1 对齐旧库实际结构，来源是 `scripts/init_db.sql` 建出的表）。
 *
 * 与 SQLAlchemy 模型的已知差异（以实际库为准）：
 * - 实际库有 `currency`（默认 'CNY'）与 `last_login_at`，模型里没有；
 * - 实际库 `username` **没有**唯一约束（旧 API 在应用层查重），模型里写了 unique=True；
 * - 唯一约束名沿用 `users_phone_num_key` / `users_email_key`。
 */
export const users = pgTable(
  "users",
  {
    userId: varchar("user_id", { length: 64 }).primaryKey(),
    username: varchar("username", { length: 100 }).notNull(),
    phoneNum: varchar("phone_num", { length: 20 }),
    email: varchar("email", { length: 255 }),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    /** numeric(12,2)，驱动读出为字符串；默认值为 "0" */
    monthlyBudget: numeric("monthly_budget", { precision: 12, scale: 2 }).default("0"),
    currency: varchar("currency", { length: 10 }).default("CNY"),
    isActive: boolean("is_active").default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("users_phone_num_key").on(table.phoneNum),
    unique("users_email_key").on(table.email),
    index("idx_users_phone")
      .on(table.phoneNum)
      .where(sql`phone_num IS NOT NULL`),
    index("idx_users_email")
      .on(table.email)
      .where(sql`email IS NOT NULL`),
    check(
      "check_phone_or_email",
      sql`(phone_num IS NOT NULL AND email IS NULL) OR (phone_num IS NULL AND email IS NOT NULL) OR (phone_num IS NOT NULL AND email IS NOT NULL)`,
    ),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

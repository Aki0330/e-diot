import type { TransactionType } from "@cyberbudget/shared";
import { sql } from "drizzle-orm";
import {
  bigserial,
  check,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "./users.js";

/**
 * transactions 表（1:1 对齐旧库）。
 *
 * 关键契约（方案 5.6）：`type` 只存大写 `EXPENSE` / `INCOME`；
 * LLM 输出的小写 `income` / `expense` 在写入前用 `toDbTransactionType()` 转换。
 * 旧库的 `amount` 是 `numeric(12,2)`（不是模型里声明的 Float）。
 */
export const transactions = pgTable(
  "transactions",
  {
    transactionId: bigserial("transaction_id", { mode: "number" }).primaryKey(),
    userId: varchar("user_id", { length: 64 })
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    /** 旧库这一列可空；CHECK 约束只允许 EXPENSE / INCOME */
    type: varchar("type", { length: 10 }).$type<TransactionType>(),
    category: varchar("category", { length: 50 }).notNull(),
    subCategory: varchar("sub_category", { length: 50 }),
    merchant: varchar("merchant", { length: 100 }),
    note: text("note"),
    rawText: text("raw_text"),
    transactionTime: timestamp("transaction_time", { withTimezone: true }).defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_transactions_user_time").on(table.userId, table.transactionTime.desc()),
    index("idx_transactions_category").on(table.userId, table.category),
    check("transactions_type_check", sql`type IN ('EXPENSE', 'INCOME')`),
  ],
);

export type TransactionRow = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;

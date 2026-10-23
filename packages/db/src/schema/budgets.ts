import { bigserial, numeric, pgTable, timestamp, unique, varchar } from "drizzle-orm/pg-core";

import { users } from "./users.js";

/**
 * budgets 表（1:1 对齐旧库）。
 *
 * 同一用户 + 同一分类 + 同一月份只能有一行（唯一约束），
 * 因此 Agent 的 MERGE 语义可以用 `ON CONFLICT DO UPDATE` 实现，
 * 手动填写的「全量替换」则是先 DELETE 再 INSERT（方案 5.4）。
 */
export const budgets = pgTable(
  "budgets",
  {
    budgetId: bigserial("budget_id", { mode: "number" }).primaryKey(),
    userId: varchar("user_id", { length: 64 })
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    category: varchar("category", { length: 50 }).notNull(),
    monthlyLimit: numeric("monthly_limit", { precision: 12, scale: 2 }).notNull(),
    /** `YYYY-MM`，UTC 口径（方案 5.8） */
    yearMonth: varchar("year_month", { length: 7 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("budgets_user_id_category_year_month_key").on(
      table.userId,
      table.category,
      table.yearMonth,
    ),
  ],
);

export type BudgetRow = typeof budgets.$inferSelect;
export type NewBudget = typeof budgets.$inferInsert;

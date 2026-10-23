import { and, eq, sql } from "drizzle-orm";

import type { Executor } from "../client.js";
import { budgets, type BudgetRow } from "../schema/budgets.js";

export interface CategoryLimitRow {
  readonly category: string;
  readonly monthlyLimit: string;
}

export async function listMonthBudgets(
  db: Executor,
  userId: string,
  yearMonth: string,
): Promise<CategoryLimitRow[]> {
  return db
    .select({ category: budgets.category, monthlyLimit: budgets.monthlyLimit })
    .from(budgets)
    .where(and(eq(budgets.userId, userId), eq(budgets.yearMonth, yearMonth)));
}

/**
 * MERGE 语义：同名分类覆盖额度，其余保持不动（`ON CONFLICT DO UPDATE`）。
 * 调用方负责事务边界与「合计 ≤ 总预算」的校验。
 */
export async function upsertMonthBudgets(
  db: Executor,
  userId: string,
  yearMonth: string,
  items: readonly CategoryLimitRow[],
): Promise<void> {
  if (items.length === 0) return;
  await db
    .insert(budgets)
    .values(
      items.map((item) => ({
        userId,
        category: item.category,
        monthlyLimit: item.monthlyLimit,
        yearMonth,
      })),
    )
    .onConflictDoUpdate({
      target: [budgets.userId, budgets.category, budgets.yearMonth],
      set: { monthlyLimit: sql`excluded.monthly_limit` },
    });
}

export async function deleteMonthBudgets(
  db: Executor,
  userId: string,
  yearMonth: string,
): Promise<void> {
  await db.delete(budgets).where(and(eq(budgets.userId, userId), eq(budgets.yearMonth, yearMonth)));
}

/**
 * 全量替换语义（手动填写用）：先删当月、再插入传入列表。
 * 调用方必须在外层事务里调用，避免删除成功但插入失败。
 */
export async function replaceMonthBudgets(
  db: Executor,
  userId: string,
  yearMonth: string,
  items: readonly CategoryLimitRow[],
): Promise<void> {
  await deleteMonthBudgets(db, userId, yearMonth);
  if (items.length === 0) return;
  await db.insert(budgets).values(
    items.map((item) => ({
      userId,
      category: item.category,
      monthlyLimit: item.monthlyLimit,
      yearMonth,
    })),
  );
}

export async function listBudgetRows(
  db: Executor,
  userId: string,
  yearMonth: string,
): Promise<BudgetRow[]> {
  return db
    .select()
    .from(budgets)
    .where(and(eq(budgets.userId, userId), eq(budgets.yearMonth, yearMonth)));
}

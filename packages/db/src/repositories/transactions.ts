import type { TransactionType } from "@cyberbudget/shared";
import { and, desc, eq, gte, sql } from "drizzle-orm";

import type { Executor } from "../client.js";
import { transactions, type NewTransaction, type TransactionRow } from "../schema/transactions.js";

export async function insertTransaction(
  db: Executor,
  values: NewTransaction,
): Promise<TransactionRow> {
  const rows = await db.insert(transactions).values(values).returning();
  const row = rows[0];
  if (row === undefined) throw new Error("插入交易失败：没有返回记录");
  return row;
}

export interface ListTransactionsParams {
  readonly userId: string;
  readonly category?: string;
  readonly limit?: number;
}

/** 交易可更新字段（金额用 numeric(12,2) 字符串传给驱动） */
export interface TransactionPatch {
  readonly amount?: string;
  readonly type?: TransactionType;
  readonly category?: string;
  readonly note?: string | null;
  readonly transactionTime?: Date;
}

/** 按 id + 归属更新；不存在或不属于该用户时返回 undefined（路由统一转 404） */
export async function updateTransaction(
  db: Executor,
  userId: string,
  transactionId: number,
  patch: TransactionPatch,
): Promise<TransactionRow | undefined> {
  const rows = await db
    .update(transactions)
    .set({ ...patch })
    .where(and(eq(transactions.transactionId, transactionId), eq(transactions.userId, userId)))
    .returning();
  return rows[0];
}

/** 按 id + 归属删除；返回是否真的删掉了 */
export async function deleteTransaction(
  db: Executor,
  userId: string,
  transactionId: number,
): Promise<boolean> {
  const rows = await db
    .delete(transactions)
    .where(and(eq(transactions.transactionId, transactionId), eq(transactions.userId, userId)))
    .returning({ transactionId: transactions.transactionId });
  return rows.length > 0;
}

/** 按时间倒序取交易；`limit` 上限 100（与旧 `/chat/transactions` 一致） */
export async function listTransactions(
  db: Executor,
  params: ListTransactionsParams,
): Promise<TransactionRow[]> {
  const limit = Math.min(params.limit ?? 30, 100);
  const conditions = [eq(transactions.userId, params.userId)];
  if (params.category !== undefined && params.category !== "") {
    conditions.push(eq(transactions.category, params.category));
  }

  return db
    .select()
    .from(transactions)
    .where(and(...conditions))
    .orderBy(desc(transactions.transactionTime))
    .limit(limit);
}

export interface SumSinceParams {
  readonly userId: string;
  readonly type: TransactionType;
  readonly since: Date;
  /** 可选分类过滤；省略表示不按分类过滤（对应 `全部`） */
  readonly category?: string;
}

/** 指定类型 + 时间起点之后的合计，返回 numeric 字符串（无数据时为 "0"） */
export async function sumAmountSince(db: Executor, params: SumSinceParams): Promise<string> {
  const conditions = [
    eq(transactions.userId, params.userId),
    eq(transactions.type, params.type),
    gte(transactions.transactionTime, params.since),
  ];
  if (params.category !== undefined && params.category !== "") {
    conditions.push(eq(transactions.category, params.category));
  }

  const rows = await db
    .select({ total: sql<string>`coalesce(sum(${transactions.amount}), 0)` })
    .from(transactions)
    .where(and(...conditions));
  return rows[0]?.total ?? "0";
}

export interface CategoryTotal {
  readonly category: string;
  readonly total: string;
}

/** 按分类聚合（仪表盘用），同样只统计指定类型 + 时间起点之后 */
export async function sumByCategorySince(
  db: Executor,
  params: SumSinceParams,
): Promise<CategoryTotal[]> {
  return db
    .select({
      category: transactions.category,
      total: sql<string>`coalesce(sum(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, params.userId),
        eq(transactions.type, params.type),
        gte(transactions.transactionTime, params.since),
      ),
    )
    .groupBy(transactions.category);
}

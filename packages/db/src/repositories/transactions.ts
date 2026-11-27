import {
  centsToNumber,
  monthStartUtc,
  parseCents,
  type TransactionType,
} from "@cyberbudget/shared";
import { and, desc, eq, gte, lt, lte, sql } from "drizzle-orm";

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
  readonly from?: Date;
  readonly to?: Date;
  /** numeric(12,2) 字符串，例如 "100.00" */
  readonly minAmount?: string;
  readonly maxAmount?: string;
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
  if (params.from !== undefined) {
    conditions.push(gte(transactions.transactionTime, params.from));
  }
  if (params.to !== undefined) {
    conditions.push(lte(transactions.transactionTime, params.to));
  }
  if (params.minAmount !== undefined) {
    conditions.push(gte(transactions.amount, params.minAmount));
  }
  if (params.maxAmount !== undefined) {
    conditions.push(lte(transactions.amount, params.maxAmount));
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
  readonly until?: Date;
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
  if (params.until) conditions.push(lt(transactions.transactionTime, params.until));
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
        params.until ? lt(transactions.transactionTime, params.until) : undefined,
      ),
    )
    .groupBy(transactions.category);
}

/** 按 UTC 自然日聚合，覆盖整个当月和近七日（可以跨月）。 */
export async function getDashboardActivity(db: Executor, userId: string, now: Date) {
  const monthStart = monthStartUtc(now);
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const weekStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6);
  const start = new Date(Math.min(monthStart.getTime(), weekStart));
  const day = sql<string>`to_char(${transactions.transactionTime} at time zone 'UTC', 'YYYY-MM-DD')`;
  const days = await db
    .select({
      day,
      count: sql<number>`count(*) filter (where ${transactions.type} = 'EXPENSE')`.mapWith(Number),
      spent: sql<string>`coalesce(sum(${transactions.amount}) filter (where ${transactions.type} = 'EXPENSE'), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        gte(transactions.transactionTime, start),
        lt(transactions.transactionTime, monthEnd),
      ),
    )
    .groupBy(day);

  const byDay = new Map(days.map((row) => [row.day, row]));
  const firstDay = monthStart.toISOString().slice(0, 10);
  const month = days.filter((row) => row.day >= firstDay);
  let weekSpent = 0n;
  const lastSevenDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setUTCDate(date.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10);
    const row = byDay.get(key);
    const spent = parseCents(row?.spent ?? "0");
    weekSpent += spent;
    return { date: key, spent: centsToNumber(spent), recorded: row !== undefined };
  });
  return {
    expense_count: month.reduce((sum, row) => sum + row.count, 0),
    recorded_days: month.length,
    last_seven_days: lastSevenDays,
    seven_day_spent: centsToNumber(weekSpent),
  };
}

/** 「查看依据」用：按 id + 归属查询单笔交易 */
export async function findTransactionById(
  db: Executor,
  userId: string,
  transactionId: number,
): Promise<TransactionRow | undefined> {
  const rows = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.transactionId, transactionId), eq(transactions.userId, userId)));
  return rows[0];
}

/** 主动关怀用：最近一笔交易时间（没有记录返回 undefined） */
export async function latestTransactionAt(db: Executor, userId: string): Promise<Date | undefined> {
  const rows = await db
    .select({ at: transactions.transactionTime })
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(desc(transactions.transactionTime))
    .limit(1);
  return rows[0]?.at ?? undefined;
}

import { z } from "zod";

/** `YYYY-MM`，与旧 Pydantic pattern `^\d{4}-(0[1-9]|1[0-2])$` 一致 */
export const YEAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export const yearMonthSchema = z
  .string()
  .regex(YEAR_MONTH_PATTERN, "月份格式应为 YYYY-MM（月份取 01-12）");

/**
 * 金额。旧后端用 Pydantic float（宽松模式会接受 "100" 这类字符串），
 * 这里用 coerce 保持同样的宽松度，同时拒绝 NaN / Infinity。
 *
 * 数据层（P1）已确认：库里的金额列是 `numeric(12,2)`，内部一律用 BigInt「分」
 * （见 `packages/shared/src/money.ts`）；这个 schema 只负责 HTTP 入参的宽松解析。
 */
export const moneySchema = z.coerce
  .number()
  .refine((value) => Number.isFinite(value), "金额必须是有限数字");

// numeric(12,2) 最多容纳 9,999,999,999.99 元，按分舍入后仍须满足列约束。
export const positiveMoneyNumberSchema = z
  .number()
  .min(0.005, "金额按分舍入后必须大于 0")
  .lt(9_999_999_999.995, "金额超过数据库允许的最大额度");
export const positiveMoneySchema = z.coerce.number().pipe(positiveMoneyNumberSchema);

export const nonNegativeMoneySchema = moneySchema.refine((value) => value >= 0, "金额不能为负");

/** budgets.category 为 varchar(50)，不 trim 以保留重复判定语义。 */
export const categorySchema = z
  .string()
  .min(1, "分类名称不能为空")
  .refine((value) => [...value].length <= 50, "分类名称最长 50 个字符");

/** UTC 口径的 `YYYY-MM`（方案 5.8：当日/当月一律 UTC） */
export function formatYearMonthUtc(date: Date = new Date()): string {
  const year = date.getUTCFullYear().toString().padStart(4, "0");
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  return `${year}-${month}`;
}

/** UTC 口径的当月 1 日 00:00:00.000 */
export function monthStartUtc(date: Date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

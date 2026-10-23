import { formatCents, parseCents, type MoneyInput } from "@cyberbudget/shared";

/**
 * 超支判定（方案 5.5，必须与旧实现公式完全一致）：
 *
 * ```
 * isOver = categoryBudget > 0
 *   ? spent > categoryBudget
 *   : monthlyBudget > 0 && spent > monthlyBudget;
 * ```
 *
 * 配套口径（由调用方保证，P2/P3 使用）：
 * - `spent` 只统计 `type = 'EXPENSE'` 且 `transaction_time >= 当月 1 日 00:00 UTC`；
 * - 分类为 `"全部"` 时不做分类过滤、也不读分类预算（即 categoryBudget 传 0）；
 * - 分类预算取 `budgets` 表中 `year_month = YYYY-MM`（UTC）的行。
 *
 * 金额内部用「分」（BigInt）比较，不经过浮点。
 */

export interface OverspendInput {
  readonly spent: MoneyInput;
  readonly monthlyBudget: MoneyInput;
  /** 未设置分类预算时传 0（或省略） */
  readonly categoryBudget?: MoneyInput;
}

export function isOverBudget(input: OverspendInput): boolean {
  const spent = parseCents(input.spent);
  const categoryBudget = parseCents(input.categoryBudget ?? 0);

  if (categoryBudget > 0n) {
    return spent > categoryBudget;
  }
  const monthlyBudget = parseCents(input.monthlyBudget);
  return monthlyBudget > 0n && spent > monthlyBudget;
}

export interface BudgetStatusResult {
  readonly spent: string;
  readonly monthlyBudget: string;
  readonly categoryBudget: string;
  readonly isOverBudget: boolean;
  /** 总预算剩余 = monthlyBudget - spent（可能为负，与旧 `BudgetStatus.remaining` 一致） */
  readonly remaining: string;
  /** 分类剩余 = categoryBudget - spent */
  readonly categoryRemaining: string;
}

/** 对应旧 `state.py` 的 `BudgetStatus` 结构，供 Agent 节点组装 response */
export function computeBudgetStatus(input: OverspendInput): BudgetStatusResult {
  const spent = parseCents(input.spent);
  const monthlyBudget = parseCents(input.monthlyBudget);
  const categoryBudget = parseCents(input.categoryBudget ?? 0);

  return {
    spent: formatCents(spent),
    monthlyBudget: formatCents(monthlyBudget),
    categoryBudget: formatCents(categoryBudget),
    isOverBudget: isOverBudget(input),
    remaining: formatCents(monthlyBudget - spent),
    categoryRemaining: formatCents(categoryBudget - spent),
  };
}

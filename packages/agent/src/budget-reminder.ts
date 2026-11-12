import type { AgentState } from "@cyberbudget/shared";

/** 预算提醒阈值：只在跨过这些线时主动提预算 */
export const BUDGET_THRESHOLDS = [50, 80, 100] as const;
export type BudgetThreshold = (typeof BUDGET_THRESHOLDS)[number];

export type BudgetScope = "category" | "total";

export interface BudgetCrossing {
  readonly scope: BudgetScope;
  readonly threshold: BudgetThreshold;
  readonly currentPercent: number;
  readonly label: string;
}

function percentOf(spent: number, limit: number): number {
  if (limit <= 0) return 0;
  return (spent / limit) * 100;
}

/** 本次支出是否让使用率跨过某个阈值（严格从下方跨到 ≥ 阈值） */
export function crossedThresholds(
  spentBefore: number,
  spentAfter: number,
  limit: number,
): BudgetThreshold[] {
  if (limit <= 0 || spentAfter <= spentBefore) return [];
  const before = percentOf(spentBefore, limit);
  const after = percentOf(spentAfter, limit);
  return BUDGET_THRESHOLDS.filter((threshold) => before < threshold && after >= threshold);
}

/**
 * 收集「本次记账」触发的预算阈值提醒。
 * 只对支出交易生效；分类与总额各自判断，避免每次回复都念预算。
 */
export function budgetCrossings(state: AgentState): BudgetCrossing[] {
  const budget = state.budget_status;
  const transaction = state.intent?.transaction;
  if (!budget || !transaction || transaction.transaction_type !== "expense") return [];

  const amount = Number(transaction.amount);
  if (!Number.isFinite(amount) || amount <= 0) return [];

  const crossings: BudgetCrossing[] = [];

  if (budget.category_budget > 0) {
    const current = budget.spent_this_month;
    const previous = current - amount;
    for (const threshold of crossedThresholds(previous, current, budget.category_budget)) {
      crossings.push({
        scope: "category",
        threshold,
        currentPercent: Math.round(percentOf(current, budget.category_budget)),
        label: budget.category,
      });
    }
  }

  if (budget.monthly_budget > 0) {
    const current = budget.total_spent_this_month;
    const previous = current - amount;
    for (const threshold of crossedThresholds(previous, current, budget.monthly_budget)) {
      crossings.push({
        scope: "total",
        threshold,
        currentPercent: Math.round(percentOf(current, budget.monthly_budget)),
        label: "总预算",
      });
    }
  }

  return crossings;
}

/** 本次回复是否需要展示预算上下文 */
export function shouldMentionBudget(state: AgentState): boolean {
  if (state.intent?.intent_type === "query_budget") return true;
  return budgetCrossings(state).length > 0;
}

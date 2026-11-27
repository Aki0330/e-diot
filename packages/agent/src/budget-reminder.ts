import { parseCents, type AgentState, type Cents } from "@cyberbudget/shared";

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

function crossedCentThresholds(before: Cents, after: Cents, limit: Cents): BudgetThreshold[] {
  if (limit <= 0n || after <= before) return [];
  return BUDGET_THRESHOLDS.filter((threshold) => {
    const boundary = limit * BigInt(threshold);
    return before * 100n < boundary && after * 100n >= boundary;
  });
}

/** 本次支出是否让使用率跨过某个阈值（严格从下方跨到 ≥ 阈值） */
export function crossedThresholds(
  spentBefore: number,
  spentAfter: number,
  limit: number,
): BudgetThreshold[] {
  return crossedCentThresholds(parseCents(spentBefore), parseCents(spentAfter), parseCents(limit));
}

/**
 * 收集「本次记账」触发的预算阈值提醒。
 * 只对支出交易生效；分类与总额各自判断，避免每次回复都念预算。
 */
export function budgetCrossings(state: AgentState): BudgetCrossing[] {
  const budget = state.budget_status;
  const transaction = state.intent?.transaction;
  if (!budget || !transaction || transaction.transaction_type !== "expense") return [];

  const amount = parseCents(transaction.amount);
  if (amount <= 0n) return [];

  const crossings: BudgetCrossing[] = [];

  function collect(scope: BudgetScope, label: string, spent: number, budgetLimit: number): void {
    const current = parseCents(spent);
    const limit = parseCents(budgetLimit);
    for (const threshold of crossedCentThresholds(current - amount, current, limit)) {
      const currentPercent = Number((current * 200n + limit) / (2n * limit));
      crossings.push({ scope, threshold, currentPercent, label });
    }
  }
  collect("category", budget.category, budget.spent_this_month, budget.category_budget);
  collect("total", "总预算", budget.total_spent_this_month, budget.monthly_budget);
  return crossings;
}

/** 本次回复是否需要展示预算上下文 */
export function shouldMentionBudget(state: AgentState): boolean {
  if (state.intent?.intent_type === "query_budget") return true;
  return budgetCrossings(state).length > 0;
}

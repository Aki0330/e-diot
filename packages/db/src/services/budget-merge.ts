import {
  AppError,
  formatCents,
  parseCents,
  type Cents,
  type MoneyInput,
} from "@cyberbudget/shared";

/**
 * 预算 MERGE + 校验（对应旧 `backend/models/budget.py` 的 `merge_and_validate_budgets`）。
 *
 * 语义（方案 5.4）：
 * - `incoming` 覆盖同名分类；
 * - 已有但 `incoming` 未提及的分类保持不变；
 * - 合并后合计必须 ≤ 总预算。
 *
 * 旧实现把「查库 + merge + 校验」耦合在一个 async 函数里；这里拆成
 * 纯函数 `mergeAndValidateBudgets`（可 100% 单测覆盖）+ 写库函数 `persistMergedBudgets`。
 * 金额内部统一用「分」（BigInt），不经过浮点。
 */

export interface CategoryLimit {
  readonly category: string;
  readonly monthlyLimit: MoneyInput;
}

export interface MergeBudgetsParams {
  readonly existing: readonly CategoryLimit[];
  readonly incoming: readonly CategoryLimit[];
  readonly totalBudget: MoneyInput;
}

export interface MergedCategory {
  readonly category: string;
  readonly monthlyLimit: string;
}

export interface MergeBudgetsResult {
  readonly isValid: boolean;
  /** 校验失败时的用户可读文案，成功时为空串 */
  readonly message: string;
  /** 合并后要写库的分类（额度统一成两位小数字符串） */
  readonly merged: readonly MergedCategory[];
  readonly mergedTotal: string;
  readonly totalBudget: string;
}

/** 与 Python `sorted(dict)` 的键序保持一致（按码点比较） */
function compareCategory(left: string, right: string): number {
  // Map 的键唯一，排序时不会出现相等比较，因此不需要额外处理 left === right
  return left < right ? -1 : 1;
}

export function mergeAndValidateBudgets(params: MergeBudgetsParams): MergeBudgetsResult {
  const merged = new Map<string, Cents>();

  for (const item of params.existing) {
    merged.set(item.category, parseCents(item.monthlyLimit));
  }
  // MERGE 模式：同名分类覆盖，未提及的保留
  for (const item of params.incoming) {
    merged.set(item.category, parseCents(item.monthlyLimit));
  }

  const totalBudget = parseCents(params.totalBudget);
  const mergedTotal = [...merged.values()].reduce<Cents>((sum, limit) => sum + limit, 0n);

  const categories: MergedCategory[] = [...merged.entries()].map(([category, limit]) => ({
    category,
    monthlyLimit: formatCents(limit),
  }));

  if (mergedTotal > totalBudget) {
    // 文案与旧实现逐字一致：Python `f"{v:.0f}"` 是「四舍六入五成双」，
    // formatCents(cents, 0) 复刻了同样的舍入。
    const detail = [...merged.entries()]
      .sort(([left], [right]) => compareCategory(left, right))
      .map(([category, limit]) => `${category}=${formatCents(limit, 0)}`)
      .join(", ");

    return {
      isValid: false,
      message: `各分类预算合计 ${formatCents(mergedTotal)} 超出总预算 ${formatCents(totalBudget)}，请调整。当前所有分类: ${detail}`,
      merged: categories,
      mergedTotal: formatCents(mergedTotal),
      totalBudget: formatCents(totalBudget),
    };
  }

  return {
    isValid: true,
    message: "",
    merged: categories,
    mergedTotal: formatCents(mergedTotal),
    totalBudget: formatCents(totalBudget),
  };
}

/**
 * 校验通过才写库（MERGE 语义）。校验失败抛 `BUDGET_OVER_ALLOCATED`（422），
 * 与旧 `/budget/manual` 的 422 行为对应，且**不写库**。
 *
 * 写库动作通过 `write` 回调注入，保持本函数不依赖数据库、可 100% 单测覆盖；
 * 调用方通常传 `(merged) => upsertMonthBudgets(db, userId, yearMonth, merged)`。
 */
export type MergedBudgetWriter = (merged: readonly MergedCategory[]) => Promise<void>;

export async function persistMergedBudgets(
  result: MergeBudgetsResult,
  write: MergedBudgetWriter,
): Promise<void> {
  if (!result.isValid) {
    throw new AppError("BUDGET_OVER_ALLOCATED", result.message, {
      details: { mergedTotal: result.mergedTotal, totalBudget: result.totalBudget },
    });
  }
  await write(result.merged);
}

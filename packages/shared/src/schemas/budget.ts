import { z } from "zod";

import { centsToNumber, formatCents, parseCents } from "../money.js";
import { categorySchema, positiveMoneySchema, yearMonthSchema } from "./common.js";

/**
 * 预算相关请求/响应（对应旧 `backend/schemas/budget.py`）。
 *
 * ⚠️ 两套语义别混（方案 5.4）：
 * - `POST /budget/agent`：MERGE —— 本次传入的分类覆盖同名，未提及的保留；
 * - `POST /budget/manual`：全量替换 —— 先删当月所有行再插入。
 */

export const categoryBudgetItemSchema = z.object({
  category: categorySchema,
  monthly_limit: positiveMoneySchema,
});

export type CategoryBudgetItem = z.infer<typeof categoryBudgetItemSchema>;

export const agentBudgetRequestSchema = z.object({
  user_input: z.string().min(1, "user_input 不能为空"),
});

export type AgentBudgetRequest = z.infer<typeof agentBudgetRequestSchema>;

export const manualBudgetRequestSchema = z
  .object({
    categories: z.array(categoryBudgetItemSchema).min(1, "categories 至少包含一条分类预算"),
    year_month: yearMonthSchema.nullish(),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const [index, item] of value.categories.entries()) {
      if (seen.has(item.category)) {
        ctx.addIssue({
          code: "custom",
          message: `分类「${item.category}」重复出现，每个分类只能有一条预算`,
          path: ["categories", index, "category"],
        });
      }
      seen.add(item.category);
    }
  });

export type ManualBudgetRequest = z.infer<typeof manualBudgetRequestSchema>;

export const budgetResponseSchema = z.object({
  user_id: z.string(),
  year_month: z.string(),
  total_budget: z.number(),
  // 旧版本允许小于半分的输入，数据库中可能已有舍入为零的分类。
  categories: z.array(categoryBudgetItemSchema.extend({ monthly_limit: z.number().nonnegative() })),
  total_allocated: z.number(),
  remaining_unallocated: z.number(),
  is_valid: z.boolean(),
});

export type BudgetResponse = z.infer<typeof budgetResponseSchema>;

export interface CategoryBudgetLike {
  readonly category: string;
  readonly monthly_limit: number;
}

export interface BudgetValidation {
  readonly isValid: boolean;
  readonly message: string;
  readonly totalAllocated: number;
}

/**
 * 校验分类预算合计不超过总预算（API 与 Agent 节点共用）。
 * 文案与旧实现保持一致：`子类预算合计 X 超出总预算 Y，请调整后重试`。
 */
export function validateCategoryBudgets(
  categories: readonly CategoryBudgetLike[],
  totalBudget: number,
): BudgetValidation {
  const allocated = categories.reduce((sum, item) => sum + parseCents(item.monthly_limit), 0n);
  const total = parseCents(totalBudget);
  const totalAllocated = centsToNumber(allocated);
  if (allocated > total) {
    return {
      isValid: false,
      message: `子类预算合计 ${formatCents(allocated)} 超出总预算 ${formatCents(total)}，请调整后重试`,
      totalAllocated,
    };
  }
  return { isValid: true, message: "", totalAllocated };
}

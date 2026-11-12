import { z } from "zod";

import { INTENT_TYPES, LLM_TRANSACTION_TYPES } from "../types.js";
import { nonNegativeMoneySchema, positiveMoneySchema } from "./common.js";

/**
 * Agent 状态与 LLM 结构化输出（对应旧 `backend/agent/state.py`）。
 *
 * 这些 schema 有三个用途：
 * 1. 作为 LLM JSON mode 的「格式说明」来源（替代旧 `_json_instruction`）；
 * 2. 校验 LLM 返回的 JSON，失败时走兜底文案；
 * 3. 推导 TS 类型，避免手写两份定义。
 */

export const transactionItemSchema = z.object({
  transaction_type: z.enum(LLM_TRANSACTION_TYPES),
  amount: positiveMoneySchema,
  category: z.string().min(1),
  description: z.string().nullish(),
});

export type TransactionItem = z.infer<typeof transactionItemSchema>;

export const categoryBudgetAllocationSchema = z.object({
  category: z.string().min(1),
  monthly_limit: positiveMoneySchema,
});

export type CategoryBudgetAllocation = z.infer<typeof categoryBudgetAllocationSchema>;

export const budgetAllocationResultSchema = z.object({
  categories: z.array(categoryBudgetAllocationSchema),
  total_allocated: nonNegativeMoneySchema,
});

export type BudgetAllocationResult = z.infer<typeof budgetAllocationResultSchema>;

export const intentResultSchema = z.object({
  intent_type: z.enum(INTENT_TYPES),
  transaction: transactionItemSchema.nullish(),
  query_category: z.string().nullish(),
  budget_allocations: budgetAllocationResultSchema.nullish(),
});

export type IntentResult = z.infer<typeof intentResultSchema>;

export const budgetStatusSchema = z.object({
  category: z.string(),
  spent_this_month: nonNegativeMoneySchema,
  /** 用户总预算（users.monthly_budget） */
  monthly_budget: nonNegativeMoneySchema,
  is_over_budget: z.boolean(),
  /** monthly_budget - spent_this_month */
  remaining: z.number(),
  /** 当月总支出（与 spent_this_month 区分：后者在有分类时是分类支出） */
  total_spent_this_month: nonNegativeMoneySchema.default(0),
  /** 该分类的预算额度（budgets 表，0=未设置） */
  category_budget: nonNegativeMoneySchema.default(0),
  category_remaining: z.number().default(0),
});

export type BudgetStatus = z.infer<typeof budgetStatusSchema>;

/**
 * 旧 LangGraph 的 TypedDict(total=False)：所有字段都可缺失。
 * 纯 TS 流水线（方案 3.1）沿用同样语义，节点函数返回新对象而不是原地修改。
 */
export interface AgentState {
  user_id?: string;
  user_input?: string;
  intent?: IntentResult | null;
  transaction_written?: boolean;
  is_over_budget?: boolean;
  budget_status?: BudgetStatus | null;
  budget_allocation_written?: boolean;
  budget_validation_error?: string | null;
  response?: string;
  error?: string | null;
  /** 旧 LangGraph add_messages 遗留字段；纯 TS 流水线不消费 */
  messages?: unknown[];
}

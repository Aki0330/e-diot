import {
  findUserById,
  insertTransaction,
  isOverBudget,
  listMonthBudgets,
  mergeAndValidateBudgets,
  sumAmountSince,
  upsertMonthBudgets,
  type Executor,
} from "@cyberbudget/db";
import {
  ALL_CATEGORY,
  centsToNumber,
  formatCents,
  formatYearMonthUtc,
  monthStartUtc,
  parseCents,
  toDbTransactionType,
  type AgentState,
  type BudgetStatus,
  type Persona,
} from "@cyberbudget/shared";

import { HISTORY_NOTE, historyMessages, type ChatTurn } from "./history.js";
import { budgetCrossings, shouldMentionBudget } from "./budget-reminder.js";
import { memoryBlock, type MemoryContext } from "./memory.js";
import {
  FALLBACK_BUDGET_ERROR,
  FALLBACK_NO_TOTAL_BUDGET,
  FALLBACK_OVERSPEND_TEMPLATE,
  FALLBACK_PARSE_ERROR,
  FALLBACK_RESPONSE_ERROR,
  NORMAL_RESPONSE_SYSTEM_PROMPT,
  OVERSPEND_ADVICE_SYSTEM_PROMPT,
  OVERSPEND_USER_PROMPT_TEMPLATE,
  formatTemplate,
  withPersona,
} from "./prompts.js";
import { parseIntent } from "./llm/intent.js";
import type { LlmClient } from "./llm/client.js";

/**
 * 6 个节点，与旧 `backend/agent/nodes.py` 一一对应：
 *
 * - parseIntentNode      ← parse_intent_node
 * - writeTransactionNode ← write_transaction_node
 * - checkBudgetNode      ← check_budget_node
 * - writeBudgetNode      ← write_budget_node
 * - generateResponseNode ← generate_response_node
 * - adviceNode           ← advice_node
 *
 * 与旧实现的差别只有「注入方式」：DB 与 LLM 都通过参数显式传入，
 * 不再用 FastAPI 依赖 + 闭包工厂（方案 3.1）。
 */

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface NodeOptions {
  /** 同一会话的最近历史（已截断） */
  readonly history?: readonly ChatTurn[];
  /** 用户的相处人格（只影响回复语气） */
  readonly persona?: Persona;
  /** 用户已确认的长期记忆（已按优先级排序） */
  readonly memories?: readonly MemoryContext[];
}

/** Node 1：LLM 解析意图；失败时保留兜底文案，流程继续（与旧图一致） */
export async function parseIntentNode(
  state: AgentState,
  llm: LlmClient,
  options: NodeOptions = {},
): Promise<AgentState> {
  try {
    const intent = await parseIntent(llm, state.user_input ?? "", options.history ?? []);
    return { ...state, intent, error: null };
  } catch (error) {
    return {
      ...state,
      intent: null,
      error: `意图解析失败: ${errorMessage(error)}`,
      response: FALLBACK_PARSE_ERROR,
    };
  }
}

/** Node 2：写入交易（type 转大写，note 对应 LLM 的 description，raw_text 保留原话） */
export async function writeTransactionNode(state: AgentState, db: Executor): Promise<AgentState> {
  const transaction = state.intent?.transaction ?? null;
  if (transaction === null) {
    return { ...state, transaction_written: false };
  }
  await insertTransaction(db, {
    userId: state.user_id ?? "",
    amount: formatCents(parseCents(transaction.amount)),
    type: toDbTransactionType(transaction.transaction_type),
    category: transaction.category,
    note: transaction.description ?? null,
    rawText: state.user_input ?? null,
  });

  return { ...state, transaction_written: true };
}

/** Node 3：读取当月消费与分类预算，判断是否超支（方案 5.5 的口径） */
export async function checkBudgetNode(state: AgentState, db: Executor): Promise<AgentState> {
  const userId = state.user_id ?? "";
  const intent = state.intent;

  let category = ALL_CATEGORY;
  if (intent?.transaction?.transaction_type === "expense") {
    category = intent.transaction.category;
  } else if (intent?.query_category) {
    category = intent.query_category;
  }

  const user = await findUserById(db, userId);
  const monthlyBudgetCents = parseCents(user?.monthlyBudget ?? "0");

  const now = new Date();
  const yearMonth = formatYearMonthUtc(now);

  let categoryBudgetCents = 0n;
  if (category !== ALL_CATEGORY) {
    const rows = await listMonthBudgets(db, userId, yearMonth);
    const matched = rows.find((row) => row.category === category);
    categoryBudgetCents = parseCents(matched?.monthlyLimit ?? "0");
  }

  const spent = await sumAmountSince(db, {
    userId,
    type: "EXPENSE",
    since: monthStartUtc(now),
    ...(category === ALL_CATEGORY ? {} : { category }),
  });
  const spentCents = parseCents(spent);
  const totalSpentCents =
    category === ALL_CATEGORY
      ? spentCents
      : parseCents(
          await sumAmountSince(db, {
            userId,
            type: "EXPENSE",
            since: monthStartUtc(now),
          }),
        );

  const over = isOverBudget({
    spent: centsToNumber(spentCents),
    monthlyBudget: centsToNumber(monthlyBudgetCents),
    categoryBudget: centsToNumber(categoryBudgetCents),
  });

  const budgetStatus: BudgetStatus = {
    category,
    spent_this_month: centsToNumber(spentCents),
    monthly_budget: centsToNumber(monthlyBudgetCents),
    is_over_budget: over,
    remaining: centsToNumber(monthlyBudgetCents - spentCents),
    total_spent_this_month: centsToNumber(totalSpentCents),
    category_budget: centsToNumber(categoryBudgetCents),
    category_remaining: centsToNumber(categoryBudgetCents - spentCents),
  };

  return { ...state, budget_status: budgetStatus, is_over_budget: over };
}

/** Node 3b：MERGE 写入分类预算（与已有分配合并后校验总额） */
export async function writeBudgetNode(state: AgentState, db: Executor): Promise<AgentState> {
  const intent = state.intent;
  const allocations = intent?.budget_allocations ?? null;

  if (allocations === null) {
    return {
      ...state,
      budget_allocation_written: false,
      budget_validation_error: "未提取到预算分配数据",
    };
  }

  const userId = state.user_id ?? "";
  const now = new Date();
  const yearMonth = formatYearMonthUtc(now);

  const user = await findUserById(db, userId);
  const totalBudget = user?.monthlyBudget ?? "0";
  if (parseCents(totalBudget) <= 0n) {
    return {
      ...state,
      budget_allocation_written: false,
      budget_validation_error: FALLBACK_NO_TOTAL_BUDGET,
      response: FALLBACK_NO_TOTAL_BUDGET,
    };
  }

  const existing = await listMonthBudgets(db, userId, yearMonth);
  const result = mergeAndValidateBudgets({
    existing,
    incoming: allocations.categories.map((item) => ({
      category: item.category,
      monthlyLimit: item.monthly_limit,
    })),
    totalBudget,
  });

  if (!result.isValid) {
    return { ...state, budget_allocation_written: false, budget_validation_error: result.message };
  }

  await upsertMonthBudgets(db, userId, yearMonth, result.merged);

  // 回填 merge 后的完整列表（旧实现也会写回 intent，供回复节点列出全部分类）
  const merged = {
    categories: [...result.merged]
      .sort((left, right) => (left.category < right.category ? -1 : 1))
      .map((item) => ({ category: item.category, monthly_limit: Number(item.monthlyLimit) })),
    total_allocated: Number(result.mergedTotal),
  };

  return {
    ...state,
    budget_allocation_written: true,
    budget_validation_error: null,
    intent:
      intent === undefined || intent === null ? intent : { ...intent, budget_allocations: merged },
  };
}

/** Node 4a：正常回复（记账成功 / 查询 / 分配成功） */
export async function generateResponseNode(
  state: AgentState,
  llm: LlmClient,
  options: NodeOptions = {},
): Promise<AgentState> {
  const intent = state.intent;
  const budget = state.budget_status;
  const contextParts = [`用户输入: ${state.user_input ?? ""}`];

  if (
    intent?.intent_type === "add_transaction" &&
    state.transaction_written &&
    intent.transaction
  ) {
    const transaction = intent.transaction;
    contextParts.push(
      `已记录: ${transaction.transaction_type} ${transaction.amount}元, 分类=${transaction.category}`,
    );
  }

  if (
    intent?.intent_type === "set_category_budget" &&
    state.budget_allocation_written &&
    intent.budget_allocations
  ) {
    const allocations = intent.budget_allocations;
    const details = allocations.categories
      .map((item) => `${item.category}=${item.monthly_limit}元`)
      .join(", ");
    contextParts.push(`已写入分类预算: ${details}, 合计=${allocations.total_allocated}元`);
  }

  if (state.budget_validation_error) {
    contextParts.push(`预算校验失败: ${state.budget_validation_error}`);
  }

  if (budget && shouldMentionBudget(state)) {
    for (const crossing of budgetCrossings(state)) {
      contextParts.push(
        `预算提醒: 本次记账后${crossing.label}使用率跨过 ${crossing.threshold}%（当前 ${crossing.currentPercent}%）。`,
      );
    }

    const lines = [`预算状态: ${budget.category}`, `  已花: ${budget.spent_this_month}元`];
    if (budget.category_budget > 0) {
      lines.push(`  该分类预算: ${budget.category_budget}元`);
      lines.push(`  该分类剩余: ${budget.category_remaining}元`);
    }
    lines.push(`  总额度: ${budget.monthly_budget}元`);
    lines.push(`  总额剩余: ${budget.remaining}元`);
    contextParts.push(lines.join("\n"));
  }

  try {
    const response = await llm.complete([
      { role: "system", content: withPersona(NORMAL_RESPONSE_SYSTEM_PROMPT, options.persona) },
      ...(options.memories === undefined || options.memories.length === 0
        ? []
        : [{ role: "system" as const, content: memoryBlock(options.memories) }]),
      ...(options.history === undefined || options.history.length === 0
        ? []
        : [
            { role: "system" as const, content: HISTORY_NOTE },
            ...historyMessages(options.history),
          ]),
      { role: "user", content: contextParts.join("\n") },
    ]);
    return { ...state, response };
  } catch (error) {
    return {
      ...state,
      response: formatTemplate(FALLBACK_RESPONSE_ERROR, { error: errorMessage(error) }),
    };
  }
}

/** Node 4b：超支建议 */
export async function adviceNode(
  state: AgentState,
  llm: LlmClient,
  options: NodeOptions = {},
): Promise<AgentState> {
  const budget = state.budget_status;
  if (!budget) {
    return { ...state, response: FALLBACK_BUDGET_ERROR };
  }

  const referenceBudget =
    budget.category_budget > 0 ? budget.category_budget : budget.monthly_budget;
  const overAmount = budget.spent_this_month - referenceBudget;

  const extraInfo =
    budget.category_budget > 0
      ? `（该分类预算${budget.category_budget}元，分类剩余${budget.category_remaining}元；总额度${budget.monthly_budget}元）`
      : "";

  const userPrompt =
    formatTemplate(OVERSPEND_USER_PROMPT_TEMPLATE, {
      category: budget.category,
      spent: String(budget.spent_this_month),
      budget: String(referenceBudget),
      over_amount: String(overAmount),
    }) + extraInfo;

  try {
    const response = await llm.complete([
      { role: "system", content: withPersona(OVERSPEND_ADVICE_SYSTEM_PROMPT, options.persona) },
      ...(options.memories === undefined || options.memories.length === 0
        ? []
        : [{ role: "system" as const, content: memoryBlock(options.memories) }]),
      ...(options.history === undefined || options.history.length === 0
        ? []
        : [
            { role: "system" as const, content: HISTORY_NOTE },
            ...historyMessages(options.history),
          ]),
      { role: "user", content: userPrompt },
    ]);
    return { ...state, response };
  } catch {
    return {
      ...state,
      response: formatTemplate(FALLBACK_OVERSPEND_TEMPLATE, {
        category: budget.category,
        over_amount: String(overAmount),
      }),
    };
  }
}

import type { Executor } from "@cyberbudget/db";
import type { AgentState, IntentResult, Persona } from "@cyberbudget/shared";

import type { ChatTurn } from "./history.js";
import type { MemoryContext } from "./memory.js";
import type { KnowledgePort, KnowledgeSnippet } from "./knowledge.js";
import type { LlmClient } from "./llm/client.js";
import {
  adviceNode,
  checkBudgetNode,
  generateResponseNode,
  parseIntentNode,
  writeBudgetNode,
  writeTransactionNode,
} from "./nodes.js";

/**
 * 手写类型化流水线（方案 3.1），替代 LangGraph 状态图。
 *
 * 与旧 `backend/agent/graph.py` 的分支一一对应：
 *   parse_intent
 *     ├─ add_transaction + transaction   → write_transaction → check_budget → (advice | generate_response)
 *     ├─ set_category_budget + 分配数据  → write_budget → generate_response
 *     └─ 其它（含解析失败）              → check_budget → (advice | generate_response)
 */

export interface AgentDeps {
  readonly db: Executor;
  readonly llm: LlmClient;
}

/** 单次运行的上下文：同会话历史与用户人格（都可选） */
export interface AgentRunOptions {
  readonly history?: readonly ChatTurn[];
  readonly persona?: Persona;
  readonly memories?: readonly MemoryContext[];
  /** 知识库端口（可选）：传入即在本轮检索 top3 片段并注入提示词 */
  readonly knowledge?: KnowledgePort;
}

export interface AgentTraceResult {
  readonly response: string;
  readonly intentType: string | null;
  readonly graphPath: string;
  readonly executionData: Record<string, unknown>;
  /** 本轮实际注入的知识片段（顺序即引用编号）；未检索或检索失败时为空 */
  readonly citations: readonly KnowledgeSnippet[];
  readonly state: AgentState;
}

export function createInitialState(userId: string, userInput: string): AgentState {
  return {
    user_id: userId,
    user_input: userInput,
    intent: null,
    transaction_written: false,
    is_over_budget: false,
    budget_status: null,
    budget_allocation_written: false,
    budget_validation_error: null,
    response: "",
    error: null,
    messages: [],
  };
}

/** 从最终 state 反推执行路径（必须与旧 `_derive_graph_path` 逐字一致） */
export function deriveGraphPath(state: AgentState): string {
  const intent = state.intent;
  if (intent === undefined || intent === null) {
    return "parse_intent→error";
  }

  const path: string[] = ["parse_intent"];
  const intentType = intent.intent_type;

  if (intentType === "add_transaction") {
    if (state.transaction_written) path.push("write_transaction");
    path.push("check_budget");
  } else if (intentType === "set_category_budget") {
    if (state.budget_allocation_written) path.push("write_budget");
    else if (state.budget_validation_error) path.push("write_budget(validation_failed)");
  } else {
    path.push("check_budget");
  }

  if (intentType === "add_transaction" || intentType === "query_budget") {
    path.push(state.is_over_budget ? "advice" : "generate_response");
  } else {
    path.push("generate_response");
  }

  return path.join("→");
}

/** 结构化执行数据，字段名与旧 `_build_execution_data` 完全一致（写入 chat_messages.execution_data） */
export function buildExecutionData(state: AgentState): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const intent: IntentResult | null = state.intent ?? null;

  if (intent !== null) {
    if (intent.transaction) {
      data.transaction = {
        type: intent.transaction.transaction_type,
        amount: intent.transaction.amount,
        category: intent.transaction.category,
        description: intent.transaction.description ?? null,
      };
    }
    if (intent.budget_allocations) {
      data.budget_allocations = {
        categories: intent.budget_allocations.categories.map((item) => ({
          category: item.category,
          monthly_limit: item.monthly_limit,
        })),
        total_allocated: intent.budget_allocations.total_allocated,
      };
    }
  }

  const budgetStatus = state.budget_status;
  if (budgetStatus) {
    data.budget_status = {
      category: budgetStatus.category,
      spent_this_month: budgetStatus.spent_this_month,
      monthly_budget: budgetStatus.monthly_budget,
      category_budget: budgetStatus.category_budget,
      category_remaining: budgetStatus.category_remaining,
      remaining: budgetStatus.remaining,
      is_over_budget: budgetStatus.is_over_budget,
    };
  }

  if (state.budget_validation_error) {
    data.budget_validation_error = state.budget_validation_error;
  }

  return data;
}

/**
 * 检索知识库（best-effort）：知识库不可用时不阻塞记账主流程，只返回空片段。
 * 「记账」场景会把分类拼进查询串，提升分类规则 / 省钱建议的召回。
 */
async function retrieveKnowledge(
  port: KnowledgePort | undefined,
  userInput: string,
  intent: IntentResult | null,
): Promise<readonly KnowledgeSnippet[]> {
  if (port === undefined) return [];
  const category = intent?.transaction?.category;
  const query = category === undefined ? userInput : `${userInput} ${category}`;
  try {
    return await port.search(query, { topK: 3 });
  } catch {
    return [];
  }
}

export async function runAgentWithTrace(
  deps: AgentDeps,
  userId: string,
  userInput: string,
  options: AgentRunOptions = {},
): Promise<AgentTraceResult> {
  let state = createInitialState(userId, userInput);

  // 知识库端口不进入 NodeOptions（那里放的是检索结果本身）
  const { knowledge: knowledgePort, ...nodeOptions } = options;

  state = await parseIntentNode(state, deps.llm, nodeOptions);

  const intent: IntentResult | null = state.intent ?? null;
  const intentType = intent?.intent_type ?? null;

  // 纯预算分配不需要知识库；其余场景注入 top3
  const citations =
    intentType === "set_category_budget"
      ? []
      : await retrieveKnowledge(knowledgePort, userInput, intent);
  const callOptions =
    citations.length === 0 ? nodeOptions : { ...nodeOptions, knowledge: citations };

  if (intentType === "add_transaction" && intent?.transaction) {
    state = await writeTransactionNode(state, deps.db);
    state = await checkBudgetNode(state, deps.db);
    state = state.is_over_budget
      ? await adviceNode(state, deps.llm, callOptions)
      : await generateResponseNode(state, deps.llm, callOptions);
  } else if (intentType === "set_category_budget" && intent?.budget_allocations) {
    state = await writeBudgetNode(state, deps.db);
    state = await generateResponseNode(state, deps.llm, callOptions);
  } else if (intentType === "query_budget") {
    state = await checkBudgetNode(state, deps.db);
    state = state.is_over_budget
      ? await adviceNode(state, deps.llm, callOptions)
      : await generateResponseNode(state, deps.llm, callOptions);
  } else {
    state = await checkBudgetNode(state, deps.db);
    state = await generateResponseNode(state, deps.llm, callOptions);
  }

  return {
    response:
      state.response !== undefined && state.response !== "" ? state.response : "Agent 未生成回复",
    intentType,
    graphPath: deriveGraphPath(state),
    executionData: buildExecutionData(state),
    citations,
    state,
  };
}

export async function runAgent(
  deps: AgentDeps,
  userId: string,
  userInput: string,
  options: AgentRunOptions = {},
): Promise<string> {
  return (await runAgentWithTrace(deps, userId, userInput, options)).response;
}

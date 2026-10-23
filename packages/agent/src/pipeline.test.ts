import { randomInt } from "node:crypto";

import {
  createDatabase,
  insertTransaction,
  insertUser,
  listMonthBudgets,
  updateMonthlyBudget,
  type Database,
} from "@cyberbudget/db";
import { generateUserId, type AgentState } from "@cyberbudget/shared";
import { sql } from "drizzle-orm";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { LlmClient } from "./llm/client.js";
import { stripMarkdownFence } from "./llm/intent.js";
import { deriveGraphPath, runAgentWithTrace } from "./pipeline.js";
import { FALLBACK_NO_TOTAL_BUDGET, FALLBACK_OVERSPEND_TEMPLATE } from "./prompts.js";

const connectionString = process.env["TEST_DATABASE_URL"];
const enabled = connectionString !== undefined && connectionString !== "";

const INTENT_MARKER = "意图解析器";

/** 假 LLM：意图解析请求返回固定 JSON，其它请求返回固定回复 */
function fakeLlm(intent: unknown, reply = "好的，已记录 ✅"): LlmClient {
  return {
    complete: (messages) => {
      const system = messages.find((message) => message.role === "system")?.content ?? "";
      if (system.includes(INTENT_MARKER)) {
        return Promise.resolve(typeof intent === "string" ? intent : JSON.stringify(intent));
      }
      return Promise.resolve(reply);
    },
  };
}

/** 意图解析成功、但回复调用失败的假 LLM */
function failingReplyLlm(intent: unknown): LlmClient {
  return {
    complete: (messages) => {
      const system = messages.find((message) => message.role === "system")?.content ?? "";
      if (system.includes(INTENT_MARKER)) return Promise.resolve(JSON.stringify(intent));
      return Promise.reject(new Error("upstream timeout"));
    },
  };
}

describe.skipIf(!enabled)("Agent 流水线（集成测试）", () => {
  let pool: pg.Pool;
  let db: Database;

  beforeAll(() => {
    pool = new pg.Pool({ connectionString });
    db = createDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function createTestUser(monthlyBudget: string): Promise<string> {
    const phone = `136${String(randomInt(10_000_000, 99_999_999))}`;
    const userId = generateUserId({ phoneNum: phone });
    await insertUser(db, {
      userId,
      username: `agent-${phone}`,
      phoneNum: phone,
      passwordHash: "not-used-in-tests",
    });
    await updateMonthlyBudget(db, userId, monthlyBudget);
    return userId;
  }

  it("记账：未超支走 write_transaction → check_budget → generate_response", async () => {
    const userId = await createTestUser("5000.00");
    const trace = await runAgentWithTrace(
      {
        db,
        llm: fakeLlm({
          intent_type: "add_transaction",
          transaction: {
            transaction_type: "expense",
            amount: 50,
            category: "餐饮",
            description: "午餐",
          },
        }),
      },
      userId,
      "午餐花了50元",
    );

    expect(trace.intentType).toBe("add_transaction");
    expect(trace.graphPath).toBe("parse_intent→write_transaction→check_budget→generate_response");
    expect(trace.executionData.transaction).toEqual({
      type: "expense",
      amount: 50,
      category: "餐饮",
      description: "午餐",
    });
    expect(trace.response).toBe("好的，已记录 ✅");
  });

  it("记账：超支走 advice 分支", async () => {
    const userId = await createTestUser("100.00");
    await insertTransaction(db, {
      userId,
      amount: "90.00",
      type: "EXPENSE",
      category: "餐饮",
    });

    const trace = await runAgentWithTrace(
      {
        db,
        llm: fakeLlm({
          intent_type: "add_transaction",
          transaction: { transaction_type: "expense", amount: 50, category: "餐饮" },
        }),
      },
      userId,
      "又吃了50元",
    );

    expect(trace.graphPath).toBe("parse_intent→write_transaction→check_budget→advice");
    const budgetStatus = trace.executionData.budget_status as {
      is_over_budget: boolean;
      spent_this_month: number;
    };
    expect(budgetStatus.is_over_budget).toBe(true);
    expect(budgetStatus.spent_this_month).toBe(140);
  });

  it("查预算：query_category 参与分类预算与花费过滤", async () => {
    const userId = await createTestUser("5000.00");
    await insertTransaction(db, { userId, amount: "200.00", type: "EXPENSE", category: "餐饮" });
    await insertTransaction(db, { userId, amount: "999.00", type: "EXPENSE", category: "交通" });
    const yearMonth = new Date().toISOString().slice(0, 7);
    // 直接写一条分类预算，避免依赖 Agent 的写预算分支
    await db.execute(
      sql`insert into budgets (user_id, category, monthly_limit, year_month) values (${userId}, '餐饮', 1000, ${yearMonth})`,
    );

    const trace = await runAgentWithTrace(
      {
        db,
        llm: fakeLlm({ intent_type: "query_budget", query_category: "餐饮" }),
      },
      userId,
      "餐饮这个月花了多少",
    );

    expect(trace.graphPath).toBe("parse_intent→check_budget→generate_response");
    const budgetStatus = trace.executionData.budget_status as {
      category: string;
      spent_this_month: number;
      category_budget: number;
      is_over_budget: boolean;
    };
    expect(budgetStatus.category).toBe("餐饮");
    expect(budgetStatus.spent_this_month).toBe(200);
    expect(budgetStatus.category_budget).toBe(1000);
    expect(budgetStatus.is_over_budget).toBe(false);
  });

  it("查账单与闲聊都走 check_budget → generate_response", async () => {
    const userId = await createTestUser("0.00");

    const queryTransactions = await runAgentWithTrace(
      { db, llm: fakeLlm({ intent_type: "query_transactions" }) },
      userId,
      "看看最近的账单",
    );
    expect(queryTransactions.graphPath).toBe("parse_intent→check_budget→generate_response");

    const chat = await runAgentWithTrace(
      { db, llm: fakeLlm({ intent_type: "chat" }) },
      userId,
      "你好呀",
    );
    expect(chat.graphPath).toBe("parse_intent→check_budget→generate_response");
    expect(chat.intentType).toBe("chat");
  });

  it("预算分配：MERGE 写入并回填完整分类", async () => {
    const userId = await createTestUser("5000.00");

    const trace = await runAgentWithTrace(
      {
        db,
        llm: fakeLlm({
          intent_type: "set_category_budget",
          budget_allocations: {
            categories: [
              { category: "餐饮", monthly_limit: 2000 },
              { category: "交通", monthly_limit: 500 },
            ],
            total_allocated: 2500,
          },
        }),
      },
      userId,
      "餐饮2000，交通500",
    );

    expect(trace.graphPath).toBe("parse_intent→write_budget→generate_response");
    const allocations = trace.executionData.budget_allocations as {
      categories: { category: string; monthly_limit: number }[];
      total_allocated: number;
    };
    expect(allocations.total_allocated).toBe(2500);
    expect(allocations.categories).toEqual([
      { category: "交通", monthly_limit: 500 },
      { category: "餐饮", monthly_limit: 2000 },
    ]);

    const yearMonth = new Date().toISOString().slice(0, 7);
    const rows = await listMonthBudgets(db, userId, yearMonth);
    expect(rows).toHaveLength(2);
  });

  it("预算分配：超总预算时 validation_failed 且不写库", async () => {
    const userId = await createTestUser("1000.00");

    const trace = await runAgentWithTrace(
      {
        db,
        llm: fakeLlm({
          intent_type: "set_category_budget",
          budget_allocations: {
            categories: [{ category: "餐饮", monthly_limit: 2000 }],
            total_allocated: 2000,
          },
        }),
      },
      userId,
      "餐饮2000",
    );

    expect(trace.graphPath).toBe("parse_intent→write_budget(validation_failed)→generate_response");
    expect(String(trace.executionData.budget_validation_error)).toContain("超出总预算");

    const yearMonth = new Date().toISOString().slice(0, 7);
    expect(await listMonthBudgets(db, userId, yearMonth)).toEqual([]);
  });

  it("未设置总预算时提示先设总预算", async () => {
    const userId = await createTestUser("0.00");

    const trace = await runAgentWithTrace(
      {
        db,
        llm: fakeLlm({
          intent_type: "set_category_budget",
          budget_allocations: {
            categories: [{ category: "餐饮", monthly_limit: 100 }],
            total_allocated: 100,
          },
        }),
      },
      userId,
      "餐饮100",
    );

    expect(trace.graphPath).toBe("parse_intent→write_budget(validation_failed)→generate_response");
    expect(trace.executionData.budget_validation_error).toBe(FALLBACK_NO_TOTAL_BUDGET);
  });

  it("意图解析失败：graph_path 为 parse_intent→error，走兜底回复", async () => {
    const userId = await createTestUser("5000.00");

    const trace = await runAgentWithTrace(
      { db, llm: fakeLlm("这不是 JSON") },
      userId,
      "随便说点什么",
    );

    expect(trace.intentType).toBeNull();
    expect(trace.graphPath).toBe("parse_intent→error");
    expect(trace.response).toBe("好的，已记录 ✅");
  });

  it("回复生成失败时用兜底文案", async () => {
    const userId = await createTestUser("5000.00");
    const intent = {
      intent_type: "add_transaction",
      transaction: { transaction_type: "expense", amount: 10, category: "餐饮" },
    };

    const trace = await runAgentWithTrace({ db, llm: failingReplyLlm(intent) }, userId, "早餐10元");
    expect(trace.response).toContain("已记录完成，但生成回复时出错");

    const overUser = await createTestUser("5.00");
    await insertTransaction(db, {
      userId: overUser,
      amount: "10.00",
      type: "EXPENSE",
      category: "餐饮",
    });
    const adviceTrace = await runAgentWithTrace(
      { db, llm: failingReplyLlm(intent) },
      overUser,
      "又花10元",
    );
    expect(adviceTrace.graphPath).toBe("parse_intent→write_transaction→check_budget→advice");
    expect(adviceTrace.response).toBe(
      FALLBACK_OVERSPEND_TEMPLATE.replace("{category}", "餐饮").replace("{over_amount}", "15"),
    );
  });
});

describe("deriveGraphPath", () => {
  const base: AgentState = { user_id: "u", user_input: "x" };

  it("无意图返回 parse_intent→error", () => {
    expect(deriveGraphPath(base)).toBe("parse_intent→error");
  });

  it("记账已写入且超支", () => {
    expect(
      deriveGraphPath({
        ...base,
        intent: {
          intent_type: "add_transaction",
          transaction: { transaction_type: "expense", amount: 1, category: "餐饮" },
        },
        transaction_written: true,
        is_over_budget: true,
      }),
    ).toBe("parse_intent→write_transaction→check_budget→advice");
  });

  it("预算写库失败", () => {
    expect(
      deriveGraphPath({
        ...base,
        intent: {
          intent_type: "set_category_budget",
          budget_allocations: { categories: [], total_allocated: 0 },
        },
        budget_validation_error: "超了",
      }),
    ).toBe("parse_intent→write_budget(validation_failed)→generate_response");
  });
});

describe("stripMarkdownFence", () => {
  it("去掉 ```json 围栏", () => {
    expect(stripMarkdownFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("只有开头围栏时也能处理", () => {
    expect(stripMarkdownFence('```\n{"a":1}')).toBe('{"a":1}');
  });

  it("普通 JSON 原样返回", () => {
    expect(stripMarkdownFence('  {"a":1}  ')).toBe('{"a":1}');
  });
});

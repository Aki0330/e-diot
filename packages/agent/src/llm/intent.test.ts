import { describe, expect, it } from "vitest";

import { parseBudgetAllocations, parseIntent } from "./intent.js";
import type { ChatMessage, LlmClient } from "./client.js";

function fakeLlm(reply: string): LlmClient & { readonly calls: ChatMessage[][] } {
  const calls: ChatMessage[][] = [];
  return {
    calls,
    complete: (messages) => {
      calls.push([...messages]);
      return Promise.resolve(reply);
    },
  };
}

describe("parseIntent", () => {
  it("把对话历史作为上下文传给 LLM", async () => {
    const llm = fakeLlm(
      '{"intent_type":"chat","transaction":null,"query_category":null,"budget_allocations":null}',
    );

    await parseIntent(llm, "再记一笔", [
      { role: "user", content: "午餐花了50元" },
      { role: "assistant", content: "已记录到餐饮" },
    ]);

    const messages = llm.calls[0] ?? [];
    expect(messages.some((message) => message.content === "午餐花了50元")).toBe(true);
    expect(messages.some((message) => message.content === "已记录到餐饮")).toBe(true);
    expect(messages[messages.length - 1]).toEqual({ role: "user", content: "再记一笔" });
  });

  it("没有历史时不插入历史说明", async () => {
    const llm = fakeLlm(
      '{"intent_type":"chat","transaction":null,"query_category":null,"budget_allocations":null}',
    );

    await parseIntent(llm, "你好");

    const messages = llm.calls[0] ?? [];
    expect(messages.length).toBe(3);
    expect(messages.some((message) => message.content.includes("历史消息"))).toBe(false);
  });
});

describe("parseBudgetAllocations", () => {
  it.each([
    {
      intent_type: "add_transaction",
      transaction: { transaction_type: "expense", amount: 20, category: "餐饮" },
    },
    {
      intent_type: "set_category_budget",
      budget_allocations: { categories: [], total_allocated: 0 },
    },
  ])("拒绝不能分配预算的意图 %o", async (intent) => {
    await expect(
      parseBudgetAllocations(fakeLlm(JSON.stringify(intent)), "餐饮 20"),
    ).rejects.toMatchObject({
      code: "UNPROCESSABLE_ENTITY",
      status: 422,
    });
  });

  it("模型返回无效数据时保留上游错误语义", async () => {
    await expect(parseBudgetAllocations(fakeLlm("无效 JSON"), "餐饮 20")).rejects.toMatchObject({
      code: "UPSTREAM_LLM_ERROR",
      status: 502,
    });
  });
});

import { describe, expect, it } from "vitest";

import { parseIntent } from "./intent.js";
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

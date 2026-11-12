import { describe, expect, it } from "vitest";

import { memoryBlock, type MemoryContext } from "./memory.js";
import { generateResponseNode } from "./nodes.js";
import type { ChatMessage, LlmClient } from "./llm/client.js";
import type { AgentState } from "@cyberbudget/shared";

function memories(...items: MemoryContext[]): MemoryContext[] {
  return items;
}

describe("memoryBlock", () => {
  it("没有记忆时返回空字符串", () => {
    expect(memoryBlock([])).toBe("");
  });

  it("按类型优先级排序：边界 > 目标 > 偏好 > 习惯", () => {
    const block = memoryBlock(
      memories(
        { type: "habit", content: "晚餐常点外卖" },
        { type: "preference", content: "喜欢奶茶少糖" },
        { type: "boundary", content: "不要评价身材" },
        { type: "goal", content: "餐饮月预算 1500" },
      ),
    );
    const lines = block.split("\n");
    expect(lines[1]).toContain("不要评价身材");
    expect(lines[2]).toContain("餐饮月预算 1500");
    expect(lines[3]).toContain("喜欢奶茶少糖");
    expect(lines[4]).toContain("晚餐常点外卖");
  });

  it("超出字符预算时丢弃低优先级记忆", () => {
    const block = memoryBlock(
      memories(
        { type: "boundary", content: "边界".repeat(10) },
        { type: "habit", content: "习惯".repeat(200) },
      ),
      60,
    );
    expect(block).toContain("边界");
    expect(block).not.toContain("习惯习惯习惯");
  });
});

describe("generateResponseNode 注入记忆", () => {
  it("把记忆作为 system 消息传给 LLM", async () => {
    const calls: ChatMessage[][] = [];
    const llm: LlmClient = {
      complete: (messages) => {
        calls.push([...messages]);
        return Promise.resolve("好的");
      },
    };
    const state: AgentState = { user_input: "今天喝点什么", budget_status: null };

    await generateResponseNode(state, llm, {
      memories: [{ type: "preference", content: "喜欢奶茶，通常少糖" }],
    });

    const sent = calls[0] ?? [];
    expect(sent.some((message) => message.content.includes("喜欢奶茶，通常少糖"))).toBe(true);
  });
});

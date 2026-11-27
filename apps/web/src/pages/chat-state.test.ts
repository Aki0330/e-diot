import { describe, expect, it } from "vitest";

import { chatViewReducer, emptyChatView, submitsChat } from "./chat-state.js";

describe("聊天会话切换", () => {
  it("选中另一会话后忽略旧历史和旧回复，包括新对话分配的会话 ID", () => {
    const first = emptyChatView(1, null);
    const second = emptyChatView(2, "second");
    const response = {
      type: "reply",
      version: first.version,
      id: "old",
      message: { role: "assistant", content: "旧回复" },
    } as const;
    expect(chatViewReducer(second, response)).toBe(second);
    expect(chatViewReducer(second, { type: "history", version: 1, messages: [] })).toBe(second);
    expect(chatViewReducer(first, response)).toMatchObject({
      id: "old",
      messages: [response.message],
    });
  });

  it("两次选择同一会话也按载入顺序区分", () => {
    const latest = emptyChatView(3, "same");
    expect(chatViewReducer(latest, { type: "failure", version: 1, error: "旧错误" })).toBe(latest);
  });
});

describe("聊天输入", () => {
  const enter = { key: "Enter", shiftKey: false, isComposing: false, keyCode: 13 };
  it("确认中文候选词时，包括旧版浏览器的 229 事件，都保留草稿", () => {
    expect(submitsChat({ ...enter, isComposing: true })).toBe(false);
    expect(submitsChat({ ...enter, keyCode: 229 })).toBe(false);
  });
  it("回车发送，Shift+Enter 换行", () => {
    expect(submitsChat(enter)).toBe(true);
    expect(submitsChat({ ...enter, shiftKey: true })).toBe(false);
  });
});

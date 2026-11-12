import { describe, expect, it } from "vitest";

import { selectHistory, type ChatTurn } from "./history.js";
import { PERSONA_INSTRUCTIONS, withPersona } from "./prompts.js";

function turns(...contents: string[]): ChatTurn[] {
  return contents.map((content, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content,
  }));
}

describe("selectHistory", () => {
  it("只保留最近 N 条消息", () => {
    const history = turns("a", "b", "c", "d", "e");
    const selected = selectHistory(history, 3);
    expect(selected.map((turn) => turn.content)).toEqual(["c", "d", "e"]);
  });

  it("按字符预算从新到旧截断", () => {
    const selected = selectHistory(
      turns("x".repeat(100), "y".repeat(100), "z".repeat(50)),
      10,
      160,
    );
    expect(selected.map((turn) => turn.content)).toEqual(["y".repeat(100), "z".repeat(50)]);
  });

  it("预算不足时至少保留最新一条", () => {
    const selected = selectHistory(turns("a".repeat(50), "b".repeat(500)), 10, 10);
    expect(selected).toHaveLength(1);
    expect(selected[0]?.content.startsWith("b")).toBe(true);
  });

  it("丢弃空白消息", () => {
    const selected = selectHistory(turns("a", "   ", "b"), 10);
    expect(selected.map((turn) => turn.content)).toEqual(["a", "b"]);
  });
});

describe("withPersona", () => {
  it("未指定人格时保持原提示词", () => {
    expect(withPersona("base")).toBe("base");
  });

  it("指定人格时追加对应风格说明", () => {
    const prompt = withPersona("base", "lurker");
    expect(prompt.startsWith("base")).toBe(true);
    expect(prompt).toContain(PERSONA_INSTRUCTIONS.lurker);
    expect(prompt).not.toContain(PERSONA_INSTRUCTIONS.chatterbox);
  });
});

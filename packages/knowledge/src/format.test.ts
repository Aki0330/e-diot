import { describe, expect, it } from "vitest";

import { categoryIcon, formatKnowledgeResults, toCitations } from "./format.js";
import type { KnowledgeHit } from "./types.js";

const HIT: KnowledgeHit = {
  content: "【餐饮预算超标建议】当用户本月餐饮预算使用超过 80% 时，建议提醒用户。",
  category: "saving_advice",
  metadata: { tags: ["吃土预警", "餐饮", "控笔"] },
  score: 0.91,
  rerankScore: 0.83214,
};

describe("formatKnowledgeResults", () => {
  it("按旧版格式输出查询、条数、分类、分数、标签", () => {
    const text = formatKnowledgeResults("我点外卖花了太多钱", [HIT]);
    expect(text).toContain('🔍 查询: "我点外卖花了太多钱"');
    expect(text).toContain("📚 知识库检索结果 (1 条)");
    expect(text).toContain("[1] 💡 [saving_advice] 相关度: 0.8321");
    expect(text).toContain("🏷️ 标签: 吃土预警 / 餐饮 / 控笔");
  });

  it("分类规则用 📋 图标", () => {
    expect(categoryIcon("category_rule")).toBe("📋");
    expect(categoryIcon("saving_advice")).toBe("💡");
    expect(categoryIcon("custom")).toBe("💡");
  });

  it("正文按 previewChars 截断并补省略号", () => {
    const text = formatKnowledgeResults("q", [HIT], { previewChars: 12 });
    expect(text).toContain("【餐饮预算超标建议】当用…");
  });

  it("空结果给出明确提示", () => {
    const text = formatKnowledgeResults("q", []);
    expect(text).toContain("📭 未找到相关知识");
    expect(text).not.toContain("📚");
  });

  it("没有 tags 时不输出标签行", () => {
    const text = formatKnowledgeResults("q", [{ ...HIT, metadata: {} }]);
    expect(text).not.toContain("🏷️");
  });
});

describe("toCitations", () => {
  it("保留内容、分类、四位小数的分数与标签", () => {
    expect(toCitations([HIT])).toEqual([
      {
        content: HIT.content,
        category: "saving_advice",
        score: 0.8321,
        tags: ["吃土预警", "餐饮", "控笔"],
      },
    ]);
  });

  it("tags 非字符串数组时忽略非法项", () => {
    const citations = toCitations([{ ...HIT, metadata: { tags: ["a", 1, null] } }]);
    expect(citations[0]?.tags).toEqual(["a"]);
  });
});

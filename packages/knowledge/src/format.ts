/**
 * 结果格式化：对齐旧版 `backend/mcp/server.py` 的 `_format_knowledge_results`。
 *
 * 输出示例：
 * ```
 * 🔍 查询: "我点外卖花了太多钱怎么办"
 * 📚 知识库检索结果 (2 条)
 *
 * [1] 💡 [saving_advice] 相关度: 0.8321
 * 【餐饮预算超标建议】当用户本月餐饮预算使用超过 80% 时…
 * 🏷️ 标签: 吃土预警 / 餐饮 / 控笔
 * ```
 */

import type { KnowledgeHit } from "./types.js";

export interface FormatOptions {
  /** 正文字数上限，默认 200（与展示页一致） */
  readonly previewChars?: number;
}

/** 分类 → 图标（旧版：规则用 📋，建议用 💡） */
export function categoryIcon(category: string): string {
  return category === "category_rule" ? "📋" : "💡";
}

function tagsOf(hit: KnowledgeHit): string[] {
  const raw = hit.metadata["tags"];
  if (!Array.isArray(raw)) return [];
  return raw.filter((tag): tag is string => typeof tag === "string");
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}

export function formatKnowledgeResults(
  query: string,
  hits: readonly KnowledgeHit[],
  options: FormatOptions = {},
): string {
  const previewChars = options.previewChars ?? 200;
  const lines = [`🔍 查询: "${query}"`];

  if (hits.length === 0) {
    lines.push("📭 未找到相关知识");
    return lines.join("\n");
  }

  lines.push(`📚 知识库检索结果 (${hits.length} 条)`);

  hits.forEach((hit, index) => {
    lines.push("");
    lines.push(
      `[${index + 1}] ${categoryIcon(hit.category)} [${hit.category}] 相关度: ${hit.rerankScore.toFixed(4)}`,
    );
    lines.push(truncate(hit.content, previewChars));
    const tags = tagsOf(hit);
    if (tags.length > 0) lines.push(`🏷️ 标签: ${tags.join(" / ")}`);
  });

  return lines.join("\n");
}

/** Agent 引用结构（chat 响应里的 citations） */
export interface KnowledgeCitation {
  readonly content: string;
  readonly category: string;
  readonly score: number;
  readonly tags: readonly string[];
}

export function toCitations(hits: readonly KnowledgeHit[]): KnowledgeCitation[] {
  return hits.map((hit) => ({
    content: hit.content,
    category: hit.category,
    score: Number(hit.rerankScore.toFixed(4)),
    tags: tagsOf(hit),
  }));
}

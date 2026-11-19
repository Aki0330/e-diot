/**
 * 知识库注入（P4b）：把 `@cyberbudget/knowledge` 的检索结果变成
 * 1) 提示词里的 system 块；2) 接口返回的 citations。
 *
 * 这里只依赖一个最小接口 `KnowledgePort`，Agent 包不直接依赖 Milvus/推理实现，
 * 便于单测用假实现注入，也避免 Agent 在没有知识库时被拖住。
 */

/** 注入 Agent 的知识片段（与 `KnowledgeHit` 同构，去掉内部字段） */
export interface KnowledgeSnippet {
  readonly content: string;
  readonly category: string;
  readonly score: number;
  readonly tags: readonly string[];
}

export interface KnowledgeSearchOptions {
  readonly topK?: number;
  readonly categoryFilter?: string;
  readonly candidatePool?: number;
}

/** Agent 侧的知识库端口：失败时由调用方决定是否降级 */
export interface KnowledgePort {
  search(query: string, options?: KnowledgeSearchOptions): Promise<readonly KnowledgeSnippet[]>;
}

const CATEGORY_LABELS: Record<string, string> = {
  category_rule: "分类规则",
  saving_advice: "省钱建议",
};

export function knowledgeCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

/**
 * 拼成 system 块：编号 + 分类 + 正文（截断 200 字）+ 标签。
 * 编号与 `citations` 顺序一致，提示模型用「（来源[n]）」标注。
 */
export function knowledgeBlock(snippets: readonly KnowledgeSnippet[], previewChars = 200): string {
  if (snippets.length === 0) return "";

  const lines = snippets.map((snippet, index) => {
    const content =
      snippet.content.length > previewChars
        ? `${snippet.content.slice(0, previewChars)}…`
        : snippet.content;
    const tags = snippet.tags.length > 0 ? `（标签: ${snippet.tags.join(" / ")}）` : "";
    return `[${index + 1}] [${knowledgeCategoryLabel(snippet.category)}] ${content}${tags}`;
  });

  return [
    "以下是从理财知识库检索到的参考片段，按相关度排序：",
    ...lines,
    "使用要求：只在确实相关时引用；引用时用「（来源[n]）」标注编号，不要编造片段之外的数字或结论。",
  ].join("\n");
}

/** 转成接口返回的 citations（分数保留四位小数，与旧版格式一致） */
export function toKnowledgeCitations(
  snippets: readonly KnowledgeSnippet[],
): readonly { content: string; category: string; score: number; tags: readonly string[] }[] {
  return snippets.map((snippet) => ({
    content: snippet.content,
    category: snippet.category,
    score: Math.round(snippet.score * 10_000) / 10_000,
    tags: snippet.tags,
  }));
}

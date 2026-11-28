/**
 * 知识库的类型定义。
 *
 * 与旧版 Python（`scripts/init_knowledge_base.py`）保持一致：
 * collection `financial_knowledge_base`，字段 doc_id / vector / sparse_vector / category / content / metadata，
 * 语料分类 `category_rule`（记账归类规则）与 `saving_advice`（控笔建议）。
 */

import type { SparseVector } from "@cyberbudget/inference";

/** 语料分类（旧版只有这两类，保留 string 以便用户自建分类） */
export const KNOWLEDGE_CATEGORIES = ["category_rule", "saving_advice"] as const;
export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

/** 一条语料（未向量化） */
export interface KnowledgeDoc {
  readonly category: string;
  readonly content: string;
  readonly metadata: Record<string, unknown>;
}

/** 一条待写入 Milvus 的记录（已向量化） */
export interface KnowledgeEntry extends KnowledgeDoc {
  readonly vector: readonly number[];
  readonly sparseVector: SparseVector;
}

/** 向量库返回的候选（混合检索融合后的分数） */
export interface VectorHit {
  readonly content: string;
  readonly category: string;
  readonly metadata: Record<string, unknown>;
  /** WeightedRanker 融合分数（0–1，越大越相关） */
  readonly score: number;
}

/** 精排之后的命中项 */
export interface KnowledgeHit extends VectorHit {
  /** Reranker 归一化分数（0–1） */
  readonly rerankScore: number;
}

/** 混合检索请求 */
export interface HybridQuery {
  readonly dense: readonly number[];
  readonly sparse: SparseVector;
  /** 融合后取回数量（候选池） */
  readonly limit: number;
  /** SQL 风格的分类过滤，如 category == "saving_advice" */
  readonly category?: string;
}

/** 向量库抽象：便于单测用假实现，也把 Milvus SDK 挡在业务逻辑之外 */
export interface VectorStore {
  hybridSearch(query: HybridQuery): Promise<readonly VectorHit[]>;
  insert(entries: readonly KnowledgeEntry[]): Promise<number>;
  count(): Promise<number>;
  /** 删除并重建 collection（kb:init 用） */
  recreate(): Promise<void>;
}

/** 知识库错误码：调用方（MCP / Agent）据此决定降级文案 */
export type KnowledgeErrorCode =
  "invalid_argument" | "inference_unavailable" | "milvus_unavailable" | "empty_query" | "unknown";

export class KnowledgeError extends Error {
  override readonly name = "KnowledgeError";

  constructor(
    message: string,
    readonly code: KnowledgeErrorCode,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

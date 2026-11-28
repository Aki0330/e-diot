/**
 * 检索编排：BGE-M3 双向量 → Milvus 混合检索（0.7/0.3）→ Reranker 精排 → top_k。
 *
 * 与旧版 `retrieve_knowledge()` 对齐：
 *   1. 编码 query 得到 dense / sparse；
 *   2. 混合检索取候选池 `max(candidate_pool, top_k * 2)`；
 *   3. Reranker 打分并排序，截断到 top_k。
 *
 * 依赖以参数注入（inference 客户端 + VectorStore），单测用假实现即可覆盖全部分支。
 */

import type { InferenceClient } from "@cyberbudget/inference";

import type { KnowledgeHit, VectorStore } from "./types.js";
import { KnowledgeError } from "./types.js";

export interface SearchKnowledgeOptions {
  readonly query: string;
  /** 最终返回条数，默认 3，上限 10 */
  readonly topK?: number;
  /** 分类过滤（空串表示不过滤），如 saving_advice */
  readonly categoryFilter?: string;
  /** 混合检索候选池大小，默认 10，上限 50 */
  readonly candidatePool?: number;
}

export interface KnowledgeSearcherDeps {
  readonly inference: Pick<InferenceClient, "embed" | "rerank">;
  readonly store: VectorStore;
}

const MAX_TOP_K = 10;
const MAX_CANDIDATE_POOL = 50;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function wrapError(
  error: unknown,
  code: "inference_unavailable" | "milvus_unavailable",
): KnowledgeError {
  if (error instanceof KnowledgeError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new KnowledgeError(message, code, { cause: error });
}

export async function searchKnowledge(
  deps: KnowledgeSearcherDeps,
  options: SearchKnowledgeOptions,
): Promise<readonly KnowledgeHit[]> {
  const query = options.query.trim();
  if (query === "") throw new KnowledgeError("查询内容不能为空", "invalid_argument");

  const topK = clamp(options.topK ?? 3, 1, MAX_TOP_K);
  const candidatePool = clamp(options.candidatePool ?? 10, 1, MAX_CANDIDATE_POOL);
  const limit = Math.max(candidatePool, topK * 2);
  const category = options.categoryFilter?.trim() ?? "";

  let embedding: {
    dense: readonly (readonly number[])[];
    sparse: readonly Record<string, number>[];
  };
  try {
    embedding = await deps.inference.embed([query]);
  } catch (error) {
    throw wrapError(error, "inference_unavailable");
  }

  const dense = embedding.dense[0];
  const sparse = embedding.sparse[0];
  if (dense === undefined || sparse === undefined) {
    throw new KnowledgeError("推理服务没有返回 query 的向量", "inference_unavailable");
  }

  let candidates: Awaited<ReturnType<VectorStore["hybridSearch"]>>;
  try {
    candidates = await deps.store.hybridSearch({
      dense,
      sparse,
      limit,
      ...(category === "" ? {} : { category }),
    });
  } catch (error) {
    throw wrapError(error, "milvus_unavailable");
  }

  if (candidates.length === 0) return [];

  let scores: readonly number[];
  try {
    scores = (
      await deps.inference.rerank({ query, documents: candidates.map((hit) => hit.content) })
    ).scores;
  } catch (error) {
    throw wrapError(error, "inference_unavailable");
  }

  if (scores.length !== candidates.length) {
    throw new KnowledgeError(
      `Reranker 返回的分数数量（${scores.length}）与候选数（${candidates.length}）不一致`,
      "unknown",
    );
  }

  return candidates
    .map((hit, index) => ({ ...hit, rerankScore: scores[index] ?? 0 }))
    .sort((left, right) => right.rerankScore - left.rerankScore)
    .slice(0, topK);
}

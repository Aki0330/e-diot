/**
 * @cyberbudget/inference — 推理 sidecar 的 TS 客户端（P4 落地，方案 6.3）。
 *
 * 背景：Node 侧没有 BGE-M3（dense + sparse）与 BGE-Reranker-v2-M3 的等价实现，
 * 因此保留一个极小的 Python sidecar（`services/inference`，FastAPI）只暴露两个端点：
 *
 *   POST /embed   { texts: string[] } → { dense: number[][], sparse: SparseVector[] }
 *   POST /rerank  { query, documents, top_n? } → { scores: number[] }
 *
 * 本文件先固定 HTTP 契约与客户端接口，P4 再实现 `fetch` 调用（含超时与重试）。
 * sidecar 以外的一切（Milvus 读写、混合检索编排、结果格式化）都在 TS 里。
 */

/** 稀疏向量：token_id（字符串化）→ 权重。旧 FlagEmbedding 的 lexical_weights 即此结构 */
export type SparseVector = Record<string, number>;

export interface EmbedRequest {
  readonly texts: readonly string[];
}

export interface EmbedResponse {
  readonly dense: readonly (readonly number[])[];
  readonly sparse: readonly SparseVector[];
}

export interface RerankRequest {
  readonly query: string;
  readonly documents: readonly string[];
  readonly top_n?: number;
}

export interface RerankResponse {
  readonly scores: readonly number[];
}

export interface InferenceClient {
  embed(texts: readonly string[]): Promise<EmbedResponse>;
  rerank(request: RerankRequest): Promise<RerankResponse>;
}

export const INFERENCE_PACKAGE = "@cyberbudget/inference" as const;

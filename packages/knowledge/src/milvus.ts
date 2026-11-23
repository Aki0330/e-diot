/**
 * Milvus 适配器：把 `VectorStore` 接口落到 `@zilliz/milvus2-sdk-node`。
 *
 * collection 结构与旧版 `init_knowledge_base.py` 一致：
 *   doc_id INT64(auto) / vector FLOAT_VECTOR(1024, HNSW+COSINE) /
 *   sparse_vector SPARSE_FLOAT_VECTOR(SPARSE_INVERTED_INDEX+IP) /
 *   category VARCHAR(64) / content VARCHAR(2048) / metadata JSON
 *
 * 混合检索用 WeightedRanker(dense_weight, sparse_weight)，默认 0.7 / 0.3。
 */

import { DataType, MetricType, MilvusClient, WeightedRanker } from "@zilliz/milvus2-sdk-node";

import type { SparseVector } from "@cyberbudget/inference";

import type { HybridQuery, KnowledgeEntry, KnowledgeDoc, VectorHit, VectorStore } from "./types.js";
import { KnowledgeError } from "./types.js";

export const DENSE_FIELD = "vector";
export const SPARSE_FIELD = "sparse_vector";
export const EMBEDDING_DIM = 1024;

export interface MilvusStoreOptions {
  /** 例如 http://localhost:19530 */
  readonly uri: string;
  readonly collection?: string;
  readonly denseWeight?: number;
  readonly sparseWeight?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Milvus 返回的 metadata 是 JSON 字段，SDK 可能给字符串或对象 */
function parseMetadata(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    try {
      const parsed: unknown = JSON.parse(value);
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function escapeExpr(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** 搜索响应可能是「一维行数组」或「按请求分组的二维数组」，统一拍平 */
function flattenRows(results: unknown): Record<string, unknown>[] {
  if (!Array.isArray(results)) return [];
  const rows: Record<string, unknown>[] = [];
  for (const item of results) {
    if (Array.isArray(item)) {
      for (const row of item) if (isRecord(row)) rows.push(row);
    } else if (isRecord(item)) {
      rows.push(item);
    }
  }
  return rows;
}

function scoreOf(row: Record<string, unknown>): number {
  for (const key of ["score", "distance", "similarity"]) {
    const value = row[key];
    if (typeof value === "number") return value;
  }
  return 0;
}

export class MilvusVectorStore implements VectorStore {
  private readonly client: MilvusClient;
  readonly collection: string;
  private readonly denseWeight: number;
  private readonly sparseWeight: number;

  constructor(options: MilvusStoreOptions) {
    const address = options.uri.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    this.client = new MilvusClient({ address });
    this.collection = options.collection ?? "financial_knowledge_base";
    this.denseWeight = options.denseWeight ?? 0.7;
    this.sparseWeight = options.sparseWeight ?? 0.3;
  }

  async hasCollection(): Promise<boolean> {
    const response: unknown = await this.client.hasCollection({ collection_name: this.collection });
    return isRecord(response) && response["value"] === true;
  }

  async recreate(): Promise<void> {
    if (await this.hasCollection()) {
      await this.client.dropCollection({ collection_name: this.collection });
    }
    await this.createSchema();
  }

  /** 建 collection + 两个索引 + load */
  async createSchema(): Promise<void> {
    await this.client.createCollection({
      collection_name: this.collection,
      description: "CyberBudget 知识库：BGE-M3 双向量 + 记账规则/控笔建议",
      fields: [
        { name: "doc_id", data_type: DataType.Int64, is_primary_key: true, autoID: true },
        { name: DENSE_FIELD, data_type: DataType.FloatVector, dim: EMBEDDING_DIM },
        { name: SPARSE_FIELD, data_type: DataType.SparseFloatVector },
        { name: "category", data_type: DataType.VarChar, max_length: 64 },
        { name: "content", data_type: DataType.VarChar, max_length: 2048 },
        { name: "metadata", data_type: DataType.JSON },
      ],
    });

    await this.client.createIndex({
      collection_name: this.collection,
      field_name: DENSE_FIELD,
      index_type: "HNSW",
      metric_type: MetricType.COSINE,
      params: { M: 16, efConstruction: 200 },
    });

    await this.client.createIndex({
      collection_name: this.collection,
      field_name: SPARSE_FIELD,
      index_type: "SPARSE_INVERTED_INDEX",
      metric_type: MetricType.IP,
    });

    await this.client.loadCollection({ collection_name: this.collection });
    await this.waitForLoad();
  }

  private async waitForLoad(timeoutMs = 120_000): Promise<void> {
    const startedAt = Date.now();
    for (;;) {
      const progress: unknown = await this.client.getLoadingProgress({
        collection_name: this.collection,
      });
      const percent = isRecord(progress) && typeof progress["progress"] === "number"
        ? progress["progress"]
        : 100;
      if (percent >= 100) return;
      if (Date.now() - startedAt > timeoutMs) {
        throw new KnowledgeError(`collection ${this.collection} 加载超时`, "milvus_unavailable");
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  async insert(entries: readonly KnowledgeEntry[]): Promise<number> {
    if (entries.length === 0) return 0;
    const data = entries.map((entry) => ({
      [DENSE_FIELD]: [...entry.vector],
      [SPARSE_FIELD]: entry.sparseVector,
      category: entry.category,
      content: entry.content,
      metadata: entry.metadata,
    }));

    const response: unknown = await this.client.insert({
      collection_name: this.collection,
      data,
    });
    await this.client.flush({ collection_names: [this.collection] });

    const count =
      isRecord(response) && typeof response["insert_cnt"] === "number" ? response["insert_cnt"] : 0;
    return count === 0 ? entries.length : count;
  }

  async count(): Promise<number> {
    try {
      const response: unknown = await this.client.count({ collection_name: this.collection });
      if (isRecord(response)) {
        // v2.4 SDK：{ data: 6 }；部分版本：{ count: 6 } / { data: [{ value: 6 }] }
        if (typeof response["count"] === "number") return response["count"];
        const data = response["data"];
        if (typeof data === "number") return data;
        if (Array.isArray(data) && isRecord(data[0]) && typeof data[0]["value"] === "number") {
          return data[0]["value"];
        }
      }
    } catch {
      // 老版本 SDK 没有 count()，退回统计信息
    }
    const stats: unknown = await this.client.getCollectionStatistics({
      collection_name: this.collection,
    });
    const rawStats = isRecord(stats) ? (stats["data"] ?? stats["stats"]) : undefined;
    // v2.4 SDK：data = { row_count: "6" }；也有版本返回 [{ key: "row_count", value: "6" }]
    if (isRecord(rawStats) && rawStats["row_count"] !== undefined) {
      return Number(rawStats["row_count"]);
    }
    const rows: unknown[] = Array.isArray(rawStats)
      ? rawStats
      : isRecord(stats) && Array.isArray(stats["stats"])
        ? stats["stats"]
        : [];
    const rowCount = rows.find((item) => isRecord(item) && item["key"] === "row_count");
    if (isRecord(rowCount) && rowCount["value"] !== undefined) return Number(rowCount["value"]);
    return 0;
  }

  async hybridSearch(query: HybridQuery): Promise<readonly VectorHit[]> {
    const response: unknown = await this.client.search({
      collection_name: this.collection,
      data: [
        { anns_field: DENSE_FIELD, data: [[...query.dense]], params: { ef: 100 } },
        { anns_field: SPARSE_FIELD, data: [toSparseDict(query.sparse)], params: {} },
      ],
      rerank: WeightedRanker([this.denseWeight, this.sparseWeight]),
      limit: query.limit,
      output_fields: ["category", "content", "metadata"],
      ...(query.category === undefined || query.category === ""
        ? {}
        : { expr: `category == "${escapeExpr(query.category)}"` }),
    });

    const rows = flattenRows(isRecord(response) ? response["results"] : undefined);
    return rows.map((row) => ({
      content: typeof row["content"] === "string" ? row["content"] : "",
      category: typeof row["category"] === "string" ? row["category"] : "",
      metadata: parseMetadata(row["metadata"]),
      score: scoreOf(row),
    }));
  }

  /** 健康检查：连不上 Milvus 时尽早失败，给出明确错误 */
  async ping(): Promise<void> {
    try {
      const response: unknown = await this.client.checkHealth();
      const healthy = isRecord(response) ? response["isHealthy"] ?? response["state"] : undefined;
      if (healthy === false) {
        throw new KnowledgeError("Milvus 报告不健康", "milvus_unavailable");
      }
    } catch (error) {
      if (error instanceof KnowledgeError) throw error;
      throw new KnowledgeError(
        `连接 Milvus 失败（${this.collection}）：${error instanceof Error ? error.message : String(error)}`,
        "milvus_unavailable",
        { cause: error },
      );
    }
  }
}

/** token id 在 JSON 里是字符串，Milvus 稀疏向量要求数字键，转回去 */
function toSparseDict(sparse: SparseVector | Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [token, weight] of Object.entries(sparse)) {
    result[token] = weight;
  }
  return result;
}

/** 供 kb:init 使用：把语料补齐（不重建 collection 时只插缺的） */
export type { KnowledgeDoc };

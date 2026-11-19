/**
 * 语料入库（`pnpm kb:init` 的核心逻辑）。
 *
 * - `recreate: true`：删库重建（等同旧版脚本每次重跑的行为，doc_id 会重新分配）；
 * - `recreate: false`：只追加，用于本地补语料。
 */

import type { InferenceClient } from "@cyberbudget/inference";

import { DEFAULT_CORPUS } from "./corpus.js";
import type { KnowledgeDoc, KnowledgeEntry, VectorStore } from "./types.js";
import { KnowledgeError } from "./types.js";

export interface IngestCorpusOptions {
  readonly recreate?: boolean;
  readonly corpus?: readonly KnowledgeDoc[];
  readonly logger?: (message: string) => void;
}

export interface IngestCorpusResult {
  readonly inserted: number;
  readonly total: number;
  readonly collectionSize: number;
}

export interface IngestCorpusDeps {
  readonly inference: Pick<InferenceClient, "embed">;
  readonly store: VectorStore;
}

export async function ingestCorpus(
  deps: IngestCorpusDeps,
  options: IngestCorpusOptions = {},
): Promise<IngestCorpusResult> {
  const corpus = options.corpus ?? DEFAULT_CORPUS;
  const log = options.logger ?? (() => {});
  if (corpus.length === 0) throw new KnowledgeError("语料为空", "invalid_argument");

  if (options.recreate === true) {
    log("重建 collection …");
    await deps.store.recreate();
  }

  log(`向量化 ${corpus.length} 条语料 …`);
  const embedded = await deps.inference.embed(corpus.map((doc) => doc.content));

  if (embedded.dense.length !== corpus.length || embedded.sparse.length !== corpus.length) {
    throw new KnowledgeError(
      `推理服务返回的向量数量不一致（dense=${embedded.dense.length}, sparse=${embedded.sparse.length}, 语料=${corpus.length}）`,
      "inference_unavailable",
    );
  }

  const entries: KnowledgeEntry[] = corpus.map((doc, index) => ({
    ...doc,
    vector: embedded.dense[index] ?? [],
    sparseVector: embedded.sparse[index] ?? {},
  }));

  const inserted = await deps.store.insert(entries);
  const collectionSize = await deps.store.count();
  return { inserted, total: corpus.length, collectionSize };
}

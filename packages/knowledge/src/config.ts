/**
 * 知识库运行时装配：从全局配置（`getConfig()`）拼出 inference 客户端 + Milvus store。
 *
 * 上层（MCP / Agent）只需要 `createKnowledgeRuntime()`，不关心 SDK 细节。
 */

import { createInferenceClient, type InferenceClient } from "@cyberbudget/inference";
import { getConfig, type AppConfig } from "@cyberbudget/shared";

import { MilvusVectorStore } from "./milvus.js";

export interface KnowledgeRuntime {
  readonly inference: InferenceClient;
  readonly store: MilvusVectorStore;
  readonly collection: string;
}

export interface KnowledgeRuntimeOverrides {
  readonly config?: AppConfig;
  readonly inference?: InferenceClient;
  readonly store?: MilvusVectorStore;
}

export function createKnowledgeRuntime(overrides: KnowledgeRuntimeOverrides = {}): KnowledgeRuntime {
  const config = overrides.config ?? getConfig();
  const store =
    overrides.store ??
    new MilvusVectorStore({
      uri: config.milvus.uri,
      collection: config.milvus.collection,
      denseWeight: config.milvus.denseWeight,
      sparseWeight: config.milvus.sparseWeight,
    });
  const inference =
    overrides.inference ??
    createInferenceClient({
      baseUrl: config.inference.baseUrl,
      timeoutMs: config.inference.timeoutMs,
    });

  return { inference, store, collection: store.collection };
}

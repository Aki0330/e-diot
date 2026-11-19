/**
 * `pnpm kb:init`：建 collection、写入内置语料、跑一次自测检索。
 *
 * 前置：Milvus 已启动（19530）、推理 sidecar 已启动（8100）、模型已下载。
 * 默认重建 collection；`--append` 只追加。
 */

import { getConfig } from "@cyberbudget/shared";

import {
  SELF_TEST_QUERY,
  createKnowledgeRuntime,
  formatKnowledgeResults,
  ingestCorpus,
  searchKnowledge,
} from "../index.js";

async function main(): Promise<void> {
  const config = getConfig();
  const append = process.argv.includes("--append");
  console.log(`Milvus: ${config.milvus.uri}  collection=${config.milvus.collection}`);
  console.log(`Inference: ${config.inference.baseUrl}`);

  const runtime = createKnowledgeRuntime({ config });
  await runtime.store.ping();
  console.log("✓ Milvus 连接正常");

  const result = await ingestCorpus(
    { inference: runtime.inference, store: runtime.store },
    { recreate: !append, logger: (message) => console.log(`• ${message}`) },
  );
  console.log(`✓ 写入 ${result.inserted} / ${result.total} 条，collection 现有 ${result.collectionSize} 条`);

  const hits = await searchKnowledge(runtime, { query: SELF_TEST_QUERY, topK: 3 });
  console.log("");
  console.log(formatKnowledgeResults(SELF_TEST_QUERY, hits));
}

main().catch((error: unknown) => {
  console.error(`❌ 初始化失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

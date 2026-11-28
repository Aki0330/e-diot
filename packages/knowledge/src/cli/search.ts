/**
 * `pnpm kb:search "<问题>" [--top-k 3] [--category saving_advice]`
 *
 * 手动验证工具：不经过 MCP/Agent，直接跑一遍「编码 → 混合检索 → 精排」。
 */

import { getConfig } from "@cyberbudget/shared";

import { createKnowledgeRuntime, formatKnowledgeResults, searchKnowledge } from "../index.js";

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const query = (positional[0] ?? "").trim();
  if (query === "") {
    console.error(
      '用法：pnpm kb:search "我点外卖花了太多钱怎么办" [--top-k 3] [--category saving_advice]',
    );
    process.exitCode = 2;
    return;
  }

  const config = getConfig();
  const runtime = createKnowledgeRuntime({ config });
  const topK = Number(flag("--top-k") ?? 3);
  const category = flag("--category") ?? "";

  const hits = await searchKnowledge(runtime, {
    query,
    topK,
    ...(category === "" ? {} : { categoryFilter: category }),
  });
  console.log(formatKnowledgeResults(query, hits));
}

main().catch((error: unknown) => {
  console.error(`❌ 检索失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

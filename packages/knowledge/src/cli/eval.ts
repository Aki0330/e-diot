/**
 * `pnpm kb:eval`
 *
 * 知识库离线评测（P5 验收的「10 条评测集」）：
 * 对固定问题集跑一遍检索，统计 Top-5 命中率与分类准确率。
 *
 * 判定口径：
 * - 命中：Top-K 结果里出现期望分类的条目（category 相同即算命中）。
 * - 分类准确率：Top-1 结果的分类是否等于期望分类。
 */

import type { KnowledgeCategory } from "../types.js";
import { createKnowledgeRuntime, searchKnowledge } from "../index.js";

interface EvalCase {
  query: string;
  category: KnowledgeCategory;
  /** 命中关键词（可选）：结果正文里应出现其中之一 */
  keyword?: string;
}

const CASES: readonly EvalCase[] = [
  { query: "我点外卖花了太多钱怎么办", category: "saving_advice", keyword: "外卖" },
  { query: "咖啡奶茶该记到哪个分类", category: "category_rule", keyword: "餐饮" },
  { query: "打车和地铁的消费归到哪一类", category: "category_rule", keyword: "交通" },
  { query: "游戏充值和电影票算娱乐吗", category: "category_rule", keyword: "娱乐" },
  { query: "这个月餐饮预算快用完了", category: "saving_advice", keyword: "预算" },
  { query: "想买的东西要不要先放一放", category: "saving_advice", keyword: "24" },
  { query: "账户余额只剩一点点了怎么办", category: "saving_advice", keyword: "吃土" },
  { query: "B站会员订阅应该记在哪个分类", category: "category_rule", keyword: "娱乐" },
  { query: "连续几天没有记账了", category: "saving_advice" },
  { query: "每月伙食费怎么控制", category: "saving_advice", keyword: "餐饮" },
];

async function main(): Promise<void> {
  const runtime = createKnowledgeRuntime();
  const topK = 5;
  let hits = 0;
  let categoryHits = 0;

  console.log(`知识库评测：${CASES.length} 条，Top-${topK}\n`);
  console.log("| # | 问题 | 期望分类 | Top-1 分类 | 命中 | 最高相关度 |");
  console.log("| --- | --- | --- | --- | --- | --- |");

  for (const [index, item] of CASES.entries()) {
    const results = await searchKnowledge(runtime, { query: item.query, topK });
    const top1 = results[0];
    const hit = results.some(
      (result) =>
        result.category === item.category &&
        (item.keyword === undefined || result.content.includes(item.keyword)),
    );
    if (hit) hits += 1;
    if (top1?.category === item.category) categoryHits += 1;
    console.log(
      `| ${index + 1} | ${item.query} | ${item.category} | ${top1?.category ?? "-"} | ${
        hit ? "✅" : "❌"
      } | ${top1 ? top1.rerankScore.toFixed(3) : "-"} |`,
    );
  }

  const hitRate = (hits / CASES.length) * 100;
  const categoryRate = (categoryHits / CASES.length) * 100;
  console.log(`\nTop-${topK} 命中率：${hitRate.toFixed(0)}%（${hits}/${CASES.length}）`);
  console.log(`Top-1 分类准确率：${categoryRate.toFixed(0)}%（${categoryHits}/${CASES.length}）`);
  if (hitRate < 80) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(`❌ 评测失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

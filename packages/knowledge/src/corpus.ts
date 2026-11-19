/**
 * 内置语料，逐字照搬旧版 `scripts/init_knowledge_base.py` 的 DEFAULT_CORPUS（6 条）。
 *
 * 改这里等于改知识库内容：`pnpm kb:init` 会按 doc_id 覆盖写入，
 * 语料扩容（真正的文档知识库）是后续独立任务，不在 P4b 范围内。
 */

import type { KnowledgeDoc } from "./types.js";

export const DEFAULT_CORPUS: readonly KnowledgeDoc[] = [
  // ── 记账分类规则 ──
  {
    category: "category_rule",
    content:
      "【餐饮分类归类规则】所有日常一日三餐、外卖、水果买菜、饮料咖啡、聚餐均归入'餐饮'大类。" +
      "其中咖啡奶茶归入'餐饮-饮品'细分类，外卖服务费归入'餐饮-外卖'。",
    metadata: { tags: ["餐饮", "记账规则"], type: "rule" },
  },
  {
    category: "category_rule",
    content:
      "【交通出行归类规则】打车（滴滴/高德）、地铁公交扫码、共享单车骑行、加油费、停车费、" +
      "高铁机票均归入'交通'大类。",
    metadata: { tags: ["交通", "记账规则"], type: "rule" },
  },
  {
    category: "category_rule",
    content:
      "【娱乐与消费归类规则】电影票、游戏充值/Steam购买、Steam卡开通、演唱会门票、" +
      "App订阅服务（QQ音乐/B站VIP）归入'娱乐'大类。",
    metadata: { tags: ["娱乐", "订阅", "记账规则"], type: "rule" },
  },

  // ── 控笔建议与吃土预警 ──
  {
    category: "saving_advice",
    content:
      "【餐饮预算超标建议】当用户本月餐饮预算使用超过 80% 时，建议提醒用户：" +
      "减少点外卖频次，优先选择食堂或自己做饭，少喝单价超过 15 元的奶茶咖啡。",
    metadata: { tags: ["吃土预警", "餐饮", "控笔"], threshold: 0.8 },
  },
  {
    category: "saving_advice",
    content:
      "【冲动消费缓释策略】当用户产生非必需品消费（如游戏皮肤、潮玩手办、数码配件）意向时，" +
      "采用24小时冷淡期法则，提示用户先加入愿望单，延迟 24 小时后再决定是否购买。",
    metadata: { tags: ["心理引导", "冲动消费"], rule_name: "24h_rule" },
  },
  {
    category: "saving_advice",
    content:
      "【月度总预算吃土警戒线】当月度剩余天数大于 10 天但总预算仅剩不到 15% 时，" +
      "触发'极速吃土模式'：建议暂停所有非必要娱乐支出，每日餐费控制在固定额度内。",
    metadata: { tags: ["吃土模式", "极端控制"], threshold: 0.15 },
  },
];

/** 自测 query（取自旧版 README 的示例） */
export const SELF_TEST_QUERY = "我点外卖花了太多钱怎么办";

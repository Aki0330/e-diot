import { z } from "zod";

/**
 * 领域常量与共享类型。
 *
 * 重要契约：
 * - LLM 输出小写 `income` / `expense`，入库前必须转大写 `EXPENSE` / `INCOME`（方案 5.6）；
 * - 数据库 CHECK 约束与所有聚合查询都按大写匹配，不要在 DB 层做大小写转换。
 */

/** 数据库中的交易类型（大写） */
export const TRANSACTION_TYPES = ["EXPENSE", "INCOME"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/** LLM / 前端自然语言里的交易类型（小写） */
export const LLM_TRANSACTION_TYPES = ["income", "expense"] as const;
export type LlmTransactionType = (typeof LLM_TRANSACTION_TYPES)[number];

/** LLM 意图分类（与旧 `IntentResult.intent_type` 完全一致） */
export const INTENT_TYPES = [
  "add_transaction",
  "query_budget",
  "query_transactions",
  "chat",
  "set_category_budget",
] as const;
export type IntentType = (typeof INTENT_TYPES)[number];

/** graph_path 的分隔符，旧实现为 `parse_intent→write_transaction→...`（方案 5.7） */
export const GRAPH_SEPARATOR = "→";

/** 记账 Agent 的 6 个节点名 */
export const GRAPH_NODES = [
  "parse_intent",
  "write_transaction",
  "write_budget",
  "check_budget",
  "generate_response",
  "advice",
] as const;
export type GraphNode = (typeof GRAPH_NODES)[number];

/** 表示「所有分类」的保留字，命中时不做分类过滤、不读分类预算（方案 5.5） */
export const ALL_CATEGORY = "全部";

/** refresh token 的 type 标记；业务接口收到它必须拒绝（方案 5.2） */
export const REFRESH_TOKEN_TYPE = "refresh";

/** JWT payload（秒级 exp/iat） */
export const jwtClaimsSchema = z.object({
  sub: z.string().min(1),
  username: z.string().optional(),
  phone_num: z.string().optional(),
  email: z.string().optional(),
  exp: z.number().int(),
  iat: z.number().int(),
  type: z.literal(REFRESH_TOKEN_TYPE).optional(),
});
export type JwtClaims = z.infer<typeof jwtClaimsSchema>;

/** 小写交易类型 → 数据库大写枚举 */
export function toDbTransactionType(type: LlmTransactionType): TransactionType {
  return type === "income" ? "INCOME" : "EXPENSE";
}

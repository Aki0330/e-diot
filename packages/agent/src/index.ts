/**
 * @cyberbudget/agent — 记账 Agent（P3）。
 *
 * - `llm/client.ts`：OpenAI 兼容客户端（fetch 实现，注入式）
 * - `llm/intent.ts`：JSON mode 结构化意图解析
 * - `prompts.ts`：从旧 `backend/llm/prompts.py` 原样搬运
 * - `nodes.ts`：6 个节点
 * - `pipeline.ts`：类型化执行器 + `graph_path` / `execution_data`
 * - `knowledge.ts`：知识库片段注入（P4b）
 */
export * from "./llm/client.js";
export * from "./llm/intent.js";
export * from "./history.js";
export * from "./budget-reminder.js";
export * from "./memory.js";
export * from "./knowledge.js";
export * from "./prompts.js";
export * from "./nodes.js";
export * from "./pipeline.js";

import {
  AppError,
  intentResultSchema,
  type CategoryBudgetItem,
  type IntentResult,
} from "@cyberbudget/shared";

import { HISTORY_NOTE, historyMessages, type ChatTurn } from "../history.js";
import { INTENT_JSON_FORMAT_HINT, INTENT_SYSTEM_PROMPT } from "../prompts.js";
import type { LlmClient } from "./client.js";

/**
 * 意图解析（对应旧 `parse_intent_node`）。
 *
 * DeepSeek 不支持 OpenAI 的 response_format，所以用「system 里给 JSON 格式说明 + 手动解析」：
 * 去 markdown 围栏 → JSON.parse → 把空对象/null 归一成 null → zod 校验。
 */

const MD_FENCE = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/;

export function stripMarkdownFence(text: string): string {
  const trimmed = text.trim();
  const matched = MD_FENCE.exec(trimmed);
  if (matched !== null) return (matched[1] ?? "").trim();

  if (trimmed.startsWith("```")) {
    const withoutFirstLine = trimmed.split("\n").slice(1).join("\n");
    return withoutFirstLine.endsWith("```")
      ? withoutFirstLine.slice(0, -3).trim()
      : withoutFirstLine.trim();
  }
  return trimmed;
}

export async function parseIntent(
  llm: LlmClient,
  userInput: string,
  history: readonly ChatTurn[] = [],
): Promise<IntentResult> {
  const raw = await llm.complete([
    { role: "system", content: INTENT_SYSTEM_PROMPT },
    { role: "system", content: INTENT_JSON_FORMAT_HINT },
    ...(history.length === 0
      ? []
      : [{ role: "system" as const, content: HISTORY_NOTE }, ...historyMessages(history)]),
    { role: "user", content: userInput },
  ]);

  const data = JSON.parse(stripMarkdownFence(raw)) as Record<string, unknown>;

  // 旧实现会处理 LLM 返回空 transaction {} / budget_allocations {} 的情况
  for (const key of ["transaction", "budget_allocations"] as const) {
    const value = data[key];
    if (
      value === null ||
      (typeof value === "object" && value !== null && Object.keys(value).length === 0)
    ) {
      data[key] = null;
    }
  }

  return intentResultSchema.parse(data);
}

/** AI 分配入口只提取分类预算，不执行通用对话流水线里的记账等操作。 */
export async function parseBudgetAllocations(
  llm: LlmClient,
  userInput: string,
): Promise<readonly CategoryBudgetItem[]> {
  let intent: IntentResult;
  try {
    intent = await parseIntent(llm, userInput);
  } catch (cause) {
    throw new AppError("UPSTREAM_LLM_ERROR", "未能解析分类预算，请稍后重试。", { cause });
  }
  const categories = intent.budget_allocations?.categories;
  if (intent.intent_type !== "set_category_budget" || !categories?.length) {
    throw AppError.unprocessable("请输入要分配预算的分类及额度。");
  }
  return categories;
}

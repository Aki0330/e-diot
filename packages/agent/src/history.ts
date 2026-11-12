import type { ChatMessage } from "./llm/client.js";

/** 同一会话中的一轮对话（只保留角色与文本，不带内部字段） */
export interface ChatTurn {
  readonly role: "user" | "assistant";
  readonly content: string;
}

/**
 * 取最近 N 条历史消息，并按字符预算从新到旧截断（保证最新上下文优先）。
 * 空消息会被丢弃；预算内至少保留最新一条。
 */
export function selectHistory(
  turns: readonly ChatTurn[],
  maxMessages = 8,
  maxChars = 1800,
): ChatTurn[] {
  const cleaned = turns
    .filter((turn) => turn.content.trim() !== "")
    .slice(-Math.max(maxMessages, 1));

  const selected: ChatTurn[] = [];
  let chars = 0;
  for (let index = cleaned.length - 1; index >= 0; index -= 1) {
    const turn = cleaned[index];
    if (turn === undefined) continue;
    const length = turn.content.length;
    if (selected.length > 0 && chars + length > maxChars) break;
    selected.unshift({ role: turn.role, content: turn.content });
    chars += length;
  }
  return selected;
}

/** 转成 LLM 消息；历史放在当前用户输入之前 */
export function historyMessages(turns: readonly ChatTurn[]): ChatMessage[] {
  return turns.map((turn) => ({ role: turn.role, content: turn.content }));
}

export const HISTORY_NOTE =
  "以下是同一会话最近的历史消息，用于理解上下文；你只需要处理最后一条用户输入。";

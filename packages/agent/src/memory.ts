import { MEMORY_TYPE_LABELS, MEMORY_TYPE_PRIORITY, type MemoryType } from "@cyberbudget/shared";

/** 注入 Agent 的最小记忆结构 */
export interface MemoryContext {
  readonly type: string;
  readonly content: string;
}

function priorityOf(type: string): number {
  return MEMORY_TYPE_PRIORITY[type as MemoryType] ?? 9;
}

function labelOf(type: string): string {
  return MEMORY_TYPE_LABELS[type as MemoryType] ?? "记忆";
}

/**
 * 把记忆拼成 system 提示块：按类型优先级（边界 > 目标 > 偏好 > 习惯）排序，
 * 按字符预算截断；超出预算时丢弃低优先级记忆。
 */
export function memoryBlock(memories: readonly MemoryContext[], maxChars = 1200): string {
  if (memories.length === 0) return "";

  const sorted = [...memories].sort(
    (left, right) => priorityOf(left.type) - priorityOf(right.type),
  );
  const lines: string[] = [];
  let chars = 0;
  for (const memory of sorted) {
    const line = `- [${labelOf(memory.type)}] ${memory.content}`;
    if (chars + line.length > maxChars) break;
    lines.push(line);
    chars += line.length + 1;
  }
  if (lines.length === 0) return "";

  return [
    "以下是用户确认过的长期记忆。只在确实相关时自然使用；不要生硬复述，也不要编造记忆之外的信息。",
    ...lines,
  ].join("\n");
}

import { and, desc, eq, ne } from "drizzle-orm";

import type { Executor } from "../client.js";
import { memories, type MemoryRow } from "../schema/memories.js";

export interface CreateMemoryInput {
  readonly type: string;
  readonly content: string;
  readonly source?: string;
  readonly sourceRef?: string | null;
  readonly status?: string;
}

export async function createMemory(
  db: Executor,
  userId: string,
  input: CreateMemoryInput,
): Promise<MemoryRow> {
  const rows = await db
    .insert(memories)
    .values({
      userId,
      type: input.type,
      content: input.content,
      source: input.source ?? "manual",
      sourceRef: input.sourceRef ?? null,
      status: input.status ?? "pending",
    })
    .returning();
  const row = rows[0];
  if (row === undefined) throw new Error("创建记忆失败：没有返回记录");
  return row;
}

export async function findMemoryById(
  db: Executor,
  userId: string,
  memoryId: string,
): Promise<MemoryRow | undefined> {
  const rows = await db
    .select()
    .from(memories)
    .where(
      and(eq(memories.id, memoryId), eq(memories.userId, userId), ne(memories.status, "deleted")),
    );
  return rows[0];
}

/** 列表：默认含 pending + active；传 status 时只取该状态 */
export async function listMemories(
  db: Executor,
  userId: string,
  status?: string,
): Promise<MemoryRow[]> {
  const condition =
    status === undefined
      ? and(eq(memories.userId, userId), ne(memories.status, "deleted"))
      : and(eq(memories.userId, userId), eq(memories.status, status));
  return db.select().from(memories).where(condition).orderBy(desc(memories.updatedAt));
}

/** Agent 注入用：只取 active，最多 50 条，由调用方按类型优先级再排序 */
export async function listActiveMemories(
  db: Executor,
  userId: string,
  limit = 50,
): Promise<MemoryRow[]> {
  return db
    .select()
    .from(memories)
    .where(and(eq(memories.userId, userId), eq(memories.status, "active")))
    .orderBy(desc(memories.updatedAt))
    .limit(limit);
}

export async function confirmMemory(
  db: Executor,
  userId: string,
  memoryId: string,
): Promise<MemoryRow | undefined> {
  const rows = await db
    .update(memories)
    .set({ status: "active", updatedAt: new Date() })
    .where(
      and(eq(memories.id, memoryId), eq(memories.userId, userId), ne(memories.status, "deleted")),
    )
    .returning();
  return rows[0];
}

export interface MemoryPatch {
  readonly type?: string;
  readonly content?: string;
}

export async function updateMemory(
  db: Executor,
  userId: string,
  memoryId: string,
  patch: MemoryPatch,
): Promise<MemoryRow | undefined> {
  const rows = await db
    .update(memories)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(eq(memories.id, memoryId), eq(memories.userId, userId), ne(memories.status, "deleted")),
    )
    .returning();
  return rows[0];
}

/** 软删除：标记 deleted + deleted_at，之后不参与任何查询 */
export async function deleteMemory(
  db: Executor,
  userId: string,
  memoryId: string,
): Promise<boolean> {
  const rows = await db
    .update(memories)
    .set({ status: "deleted", deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(eq(memories.id, memoryId), eq(memories.userId, userId), ne(memories.status, "deleted")),
    )
    .returning({ id: memories.id });
  return rows.length > 0;
}

/** 供「查看依据」使用：按来源解析关联记录 */
export async function findMemorySourceRef(
  db: Executor,
  userId: string,
  memoryId: string,
): Promise<Pick<MemoryRow, "source" | "sourceRef"> | undefined> {
  const rows = await db
    .select({ source: memories.source, sourceRef: memories.sourceRef })
    .from(memories)
    .where(and(eq(memories.id, memoryId), eq(memories.userId, userId)));
  return rows[0];
}

/** 是否有同内容记忆（避免重复写入） */
export async function existsByContent(
  db: Executor,
  userId: string,
  content: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: memories.id })
    .from(memories)
    .where(
      and(
        eq(memories.userId, userId),
        eq(memories.content, content),
        ne(memories.status, "deleted"),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

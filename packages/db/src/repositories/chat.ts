import { and, asc, desc, eq } from "drizzle-orm";

import type { Executor } from "../client.js";
import {
  chatMessages,
  chatSessions,
  type ChatMessageRow,
  type ChatSessionRow,
  type NewChatMessage,
  type NewChatSession,
} from "../schema/chat.js";

export async function createSession(db: Executor, values: NewChatSession): Promise<ChatSessionRow> {
  const rows = await db.insert(chatSessions).values(values).returning();
  const row = rows[0];
  if (row === undefined) throw new Error("创建会话失败：没有返回记录");
  return row;
}

/** 会话归属校验：sessionId 必须属于该用户，否则返回 undefined */
export async function findSessionById(
  db: Executor,
  userId: string,
  sessionId: string,
): Promise<ChatSessionRow | undefined> {
  const rows = await db
    .select()
    .from(chatSessions)
    .where(and(eq(chatSessions.sessionId, sessionId), eq(chatSessions.userId, userId)))
    .limit(1);
  return rows[0];
}

export async function listSessions(db: Executor, userId: string): Promise<ChatSessionRow[]> {
  return db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.userId, userId))
    .orderBy(desc(chatSessions.updatedAt));
}

export async function touchSession(
  db: Executor,
  sessionId: string,
  options: { title?: string; at?: Date } = {},
): Promise<void> {
  await db
    .update(chatSessions)
    .set({
      updatedAt: options.at ?? new Date(),
      ...(options.title ? { title: options.title } : {}),
    })
    .where(eq(chatSessions.sessionId, sessionId));
}

export async function appendMessage(db: Executor, values: NewChatMessage): Promise<ChatMessageRow> {
  const rows = await db.insert(chatMessages).values(values).returning();
  const row = rows[0];
  if (row === undefined) throw new Error("写入消息失败：没有返回记录");
  return row;
}

export async function listMessages(db: Executor, sessionId: string): Promise<ChatMessageRow[]> {
  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(asc(chatMessages.createdAt));
}

/** 删除会话；依赖 `ON DELETE CASCADE` 清理消息（方案 5.7） */
export async function deleteSession(
  db: Executor,
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const rows = await db
    .delete(chatSessions)
    .where(and(eq(chatSessions.sessionId, sessionId), eq(chatSessions.userId, userId)))
    .returning({ sessionId: chatSessions.sessionId });
  return rows.length > 0;
}

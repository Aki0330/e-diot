import { and, eq, gte, type SQL } from "drizzle-orm";

import type { Executor } from "../client.js";
import { proactiveEvents, type ProactiveEventRow } from "../schema/proactive.js";

export interface CreateProactiveEventInput {
  readonly userId: string;
  readonly localDate: string;
  readonly kind: string;
  readonly payload?: Record<string, unknown>;
}

/**
 * 尝试占用「用户 + 日期 + 规则」的唯一名额。
 * 返回 undefined 表示今天这条规则已经触发过（幂等）。
 */
export async function claimProactiveEvent(
  db: Executor,
  input: CreateProactiveEventInput,
): Promise<ProactiveEventRow | undefined> {
  const rows = await db
    .insert(proactiveEvents)
    .values({
      userId: input.userId,
      localDate: input.localDate,
      kind: input.kind,
      status: "sent",
      payload: input.payload ?? {},
    })
    .onConflictDoNothing()
    .returning();
  return rows[0];
}

export async function attachProactiveMessage(
  db: Executor,
  eventId: string,
  sessionId: string,
  messageId: number,
): Promise<void> {
  await db
    .update(proactiveEvents)
    .set({ sessionId, messageId })
    .where(eq(proactiveEvents.id, eventId));
}

/** 频控用：统计 since（YYYY-MM-DD）以来已发送的事件数 */
export async function countSentEvents(
  db: Executor,
  userId: string,
  since: string,
): Promise<number> {
  const condition: SQL = and(
    eq(proactiveEvents.userId, userId),
    eq(proactiveEvents.status, "sent"),
    gte(proactiveEvents.localDate, since),
  ) as SQL;
  const rows = await db.select({ id: proactiveEvents.id }).from(proactiveEvents).where(condition);
  return rows.length;
}

export async function findEventByMessage(
  db: Executor,
  userId: string,
  messageId: number,
): Promise<ProactiveEventRow | undefined> {
  const rows = await db
    .select()
    .from(proactiveEvents)
    .where(and(eq(proactiveEvents.userId, userId), eq(proactiveEvents.messageId, messageId)))
    .limit(1);
  return rows[0];
}

export async function setProactiveFeedback(
  db: Executor,
  userId: string,
  messageId: number,
  feedback: string,
  at: Date,
): Promise<ProactiveEventRow | undefined> {
  const rows = await db
    .update(proactiveEvents)
    .set({ feedback, feedbackAt: at })
    .where(and(eq(proactiveEvents.userId, userId), eq(proactiveEvents.messageId, messageId)))
    .returning();
  return rows[0];
}

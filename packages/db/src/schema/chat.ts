import { index, jsonb, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

import { users } from "./users.js";

/**
 * 对话持久化（1:1 对齐旧库）。
 *
 * ⚠️ 与 `init_db.sql` 不一致的部分以**实际库**为准：
 * 这两张表其实是 SQLAlchemy `create_all` 建的 —— `message_id` 是 `serial`（integer），
 * 没有 `role`/`type` 的 CHECK 约束，`execution_data` 没有默认值，索引名来自模型的 `index=True`。
 */

export type ExecutionData = Record<string, unknown>;

export const chatSessions = pgTable(
  "chat_sessions",
  {
    sessionId: varchar("session_id", { length: 64 }).primaryKey(),
    userId: varchar("user_id", { length: 64 })
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull().default("新对话"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ix_chat_sessions_user_id").on(table.userId)],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    messageId: serial("message_id").primaryKey(),
    sessionId: varchar("session_id", { length: 64 })
      .notNull()
      .references(() => chatSessions.sessionId, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull(),
    content: text("content").notNull(),
    intentType: varchar("intent_type", { length: 30 }),
    graphPath: varchar("graph_path", { length: 300 }),
    executionData: jsonb("execution_data").$type<ExecutionData>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_messages_session_time").on(table.sessionId, table.createdAt),
    index("ix_chat_messages_session_id").on(table.sessionId),
  ],
);

export type ChatSessionRow = typeof chatSessions.$inferSelect;
export type NewChatSession = typeof chatSessions.$inferInsert;
export type ChatMessageRow = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;

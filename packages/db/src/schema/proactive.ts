import {
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { date } from "drizzle-orm/pg-core";

import { chatSessions } from "./chat.js";
import { users } from "./users.js";

/**
 * 主动关怀事件：幂等（同一用户同一天同一规则只发一次）、频控与反馈审计。
 */
export const proactiveEvents = pgTable(
  "proactive_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 64 })
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    localDate: date("local_date").notNull(),
    kind: varchar("kind", { length: 20 }).notNull(),
    sessionId: varchar("session_id", { length: 64 }).references(() => chatSessions.sessionId, {
      onDelete: "set null",
    }),
    messageId: integer("message_id"),
    status: varchar("status", { length: 10 }).notNull().default("sent"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    feedback: varchar("feedback", { length: 20 }),
    feedbackAt: timestamp("feedback_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_proactive_user_date_kind").on(table.userId, table.localDate, table.kind),
    index("idx_proactive_user_date").on(table.userId, table.localDate),
  ],
);

export type ProactiveEventRow = typeof proactiveEvents.$inferSelect;
export type NewProactiveEvent = typeof proactiveEvents.$inferInsert;

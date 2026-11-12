import { index, numeric, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { users } from "./users.js";

/**
 * 用户长期记忆（v1，PostgreSQL）。
 * 存储决策见 docs/memory-storage-decision.md：先关系型检索，不引入 Milvus。
 */
export const memories = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 64 })
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    type: varchar("type", { length: 20 }).notNull(),
    content: text("content").notNull(),
    source: varchar("source", { length: 20 }).notNull().default("manual"),
    sourceRef: varchar("source_ref", { length: 128 }),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    confidence: numeric("confidence", { precision: 3, scale: 2 }).default("1.00"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("idx_memories_user_status").on(table.userId, table.status, table.updatedAt)],
);

export type MemoryRow = typeof memories.$inferSelect;
export type NewMemory = typeof memories.$inferInsert;

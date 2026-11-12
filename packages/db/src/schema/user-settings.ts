import { timestamp, pgTable, varchar } from "drizzle-orm/pg-core";

import { users } from "./users.js";

/**
 * 用户相处设置（1:1 users）：人格、主动程度、关怀时间、免打扰与临时暂停。
 * 与旧库无对应表，属于 v2.0 新增能力；默认值对齐展示页的「搭子型 · 适中」。
 */
export const userSettings = pgTable("user_settings", {
  userId: varchar("user_id", { length: 64 })
    .primaryKey()
    .references(() => users.userId, { onDelete: "cascade" }),
  persona: varchar("persona", { length: 20 }).notNull().default("buddy"),
  proactiveLevel: varchar("proactive_level", { length: 20 }).notNull().default("medium"),
  careTime: varchar("care_time", { length: 5 }).notNull().default("17:45"),
  quietStart: varchar("quiet_start", { length: 5 }).notNull().default("22:00"),
  quietEnd: varchar("quiet_end", { length: 5 }).notNull().default("08:00"),
  snoozeUntil: timestamp("snooze_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export type UserSettingsRow = typeof userSettings.$inferSelect;
export type NewUserSettings = typeof userSettings.$inferInsert;

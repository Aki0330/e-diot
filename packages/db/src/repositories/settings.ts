import { eq } from "drizzle-orm";

import type { Executor } from "../client.js";
import { users } from "../schema/users.js";
import { userSettings, type UserSettingsRow } from "../schema/user-settings.js";

export interface UserSettingsPatch {
  readonly persona?: string;
  readonly proactiveLevel?: string;
  readonly careTime?: string;
  readonly quietStart?: string;
  readonly quietEnd?: string;
  readonly snoozeUntil?: Date | null;
}

/** 读取设置；没有记录时返回 undefined（路由用默认值兜底） */
export async function getUserSettings(
  db: Executor,
  userId: string,
): Promise<UserSettingsRow | undefined> {
  const rows = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  return rows[0];
}

/** 首次保存时插入默认行，之后只更新传入字段 */
export async function upsertUserSettings(
  db: Executor,
  userId: string,
  patch: UserSettingsPatch,
): Promise<UserSettingsRow> {
  const rows = await db
    .insert(userSettings)
    .values({ userId, ...patch })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { ...patch, updatedAt: new Date() },
    })
    .returning();
  const row = rows[0];
  if (row === undefined) throw new Error("保存用户设置失败：没有返回记录");
  return row;
}

export interface ActiveUserSettings {
  readonly userId: string;
  readonly persona: string;
  readonly proactiveLevel: string;
  readonly careTime: string;
  readonly quietStart: string;
  readonly quietEnd: string;
  readonly snoozeUntil: Date | null;
  readonly monthlyBudget: string | null;
}

/** 调度器用：所有启用用户 + 他们的相处设置 */
export async function listActiveUserSettings(db: Executor): Promise<ActiveUserSettings[]> {
  return db
    .select({
      userId: userSettings.userId,
      persona: userSettings.persona,
      proactiveLevel: userSettings.proactiveLevel,
      careTime: userSettings.careTime,
      quietStart: userSettings.quietStart,
      quietEnd: userSettings.quietEnd,
      snoozeUntil: userSettings.snoozeUntil,
      monthlyBudget: users.monthlyBudget,
    })
    .from(userSettings)
    .innerJoin(users, eq(userSettings.userId, users.userId))
    .where(eq(users.isActive, true));
}

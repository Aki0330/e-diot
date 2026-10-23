import { eq, sql, type SQL } from "drizzle-orm";

import type { Executor } from "../client.js";
import { users, type NewUser, type UserRow } from "../schema/users.js";

export async function findUserById(db: Executor, userId: string): Promise<UserRow | undefined> {
  const rows = await db.select().from(users).where(eq(users.userId, userId)).limit(1);
  return rows[0];
}

/**
 * 登录用：account 含 `@` 视为邮箱，否则视为手机号（与旧 `auth.py` 一致）。
 */
export async function findUserByLoginAccount(
  db: Executor,
  account: string,
): Promise<UserRow | undefined> {
  const condition = account.includes("@") ? eq(users.email, account) : eq(users.phoneNum, account);
  const rows = await db.select().from(users).where(condition).limit(1);
  return rows[0];
}

export async function findUserByUsername(
  db: Executor,
  username: string,
): Promise<UserRow | undefined> {
  const rows = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return rows[0];
}

export async function insertUser(db: Executor, values: NewUser): Promise<UserRow> {
  const rows = await db.insert(users).values(values).returning();
  const row = rows[0];
  if (row === undefined) throw new Error("插入用户失败：没有返回记录");
  return row;
}

export async function updateMonthlyBudget(
  db: Executor,
  userId: string,
  monthlyBudget: string,
): Promise<UserRow | undefined> {
  const rows = await db
    .update(users)
    .set({ monthlyBudget, updatedAt: new Date() })
    .where(eq(users.userId, userId))
    .returning();
  return rows[0];
}

export async function markLogin(
  db: Executor,
  userId: string,
  at: Date = new Date(),
): Promise<void> {
  await db.update(users).set({ lastLoginAt: at, updatedAt: at }).where(eq(users.userId, userId));
}

async function exists(db: Executor, condition: SQL | undefined): Promise<boolean> {
  if (condition === undefined) return false;
  const rows = await db
    .select({ one: sql<number>`1` })
    .from(users)
    .where(condition)
    .limit(1);
  return rows.length > 0;
}

export interface ContactConflict {
  readonly username: boolean;
  readonly phoneNum: boolean;
  readonly email: boolean;
}

/**
 * 注册前的唯一性检查。旧库 `username` 没有唯一约束，唯一性由应用层保证（与旧 `auth.py` 一致）。
 */
export async function findContactConflicts(
  db: Executor,
  values: { username?: string; phoneNum?: string | null; email?: string | null },
): Promise<ContactConflict> {
  const username =
    values.username === undefined ? false : await exists(db, eq(users.username, values.username));
  const phoneNum =
    values.phoneNum === undefined || values.phoneNum === null
      ? false
      : await exists(db, eq(users.phoneNum, values.phoneNum));
  const email =
    values.email === undefined || values.email === null
      ? false
      : await exists(db, eq(users.email, values.email));

  return { username, phoneNum, email };
}

import { randomInt } from "node:crypto";

import { generateUserId } from "@cyberbudget/shared";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase, type Database } from "../client.js";
import * as budgetsRepo from "./budgets.js";
import * as chatRepo from "./chat.js";
import * as transactionsRepo from "./transactions.js";
import * as usersRepo from "./users.js";

/**
 * 数据层集成测试：需要 `TEST_DATABASE_URL` 指向**已应用迁移的空库**。
 * 未设置时整组跳过，保证 `pnpm test` 在没跑数据库的机器上也全绿。
 *
 * 本地跑法：
 *   docker exec cyber-budget-postgres createdb -U postgres cyber_budget_it
 *   docker exec -i ... psql -f packages/db/migrations/0000_*.sql
 *   TEST_DATABASE_URL=postgresql://postgres:postgrespassword@localhost:5432/cyber_budget_it pnpm test
 */
const connectionString = process.env["TEST_DATABASE_URL"];
const enabled = connectionString !== undefined && connectionString !== "";

describe.skipIf(!enabled)("repositories（集成测试）", () => {
  let pool: pg.Pool;
  let db: Database;

  let userId: string;
  const phone = `139${String(randomInt(10_000_000, 99_999_999))}`;
  const email = `it-${Date.now()}@example.com`;
  const username = `it-user-${Date.now()}`;
  const yearMonth = "2026-10";

  beforeAll(() => {
    pool = new pg.Pool({ connectionString });
    db = createDatabase(pool);
    userId = generateUserId({ phoneNum: phone });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("创建用户，并能按 id / 手机号 / 邮箱查询", async () => {
    const created = await usersRepo.insertUser(db, {
      userId,
      username,
      phoneNum: phone,
      email,
      passwordHash: "$2b$12$abcdefghijklmnopqrstuv",
    });

    expect(created.userId).toBe(userId);
    expect(Number(created.monthlyBudget)).toBe(0);
    expect(created.currency).toBe("CNY");
    expect(created.isActive).toBe(true);

    expect((await usersRepo.findUserById(db, userId))?.email).toBe(email);
    expect((await usersRepo.findUserByLoginAccount(db, phone))?.userId).toBe(userId);
    expect((await usersRepo.findUserByLoginAccount(db, email))?.userId).toBe(userId);
    expect(await usersRepo.findUserById(db, "usr_does_not_exist")).toBeUndefined();
  });

  it("注册唯一性检查命中手机号/邮箱，但不误报用户名", async () => {
    const conflicts = await usersRepo.findContactConflicts(db, {
      username: "not-taken",
      phoneNum: phone,
      email,
    });

    expect(conflicts).toEqual({ username: false, phoneNum: true, email: true });
  });

  it("更新月度总预算（numeric 读回为字符串）", async () => {
    const updated = await usersRepo.updateMonthlyBudget(db, userId, "3000.00");

    expect(updated?.monthlyBudget).toBe("3000.00");
  });

  it("写入交易并按类型/分类聚合", async () => {
    const since = new Date(Date.now() - 60_000);

    await transactionsRepo.insertTransaction(db, {
      userId,
      amount: "120.50",
      type: "EXPENSE",
      category: "餐饮",
      subCategory: "外卖",
      note: "午饭",
    });
    await transactionsRepo.insertTransaction(db, {
      userId,
      amount: "80.00",
      type: "EXPENSE",
      category: "餐饮",
    });
    await transactionsRepo.insertTransaction(db, {
      userId,
      amount: "2000.00",
      type: "INCOME",
      category: "工资",
    });

    expect(await transactionsRepo.sumAmountSince(db, { userId, type: "EXPENSE", since })).toBe(
      "200.50",
    );
    expect(
      await transactionsRepo.sumByCategorySince(db, { userId, type: "EXPENSE", since }),
    ).toEqual([{ category: "餐饮", total: "200.50" }]);

    const all = await transactionsRepo.listTransactions(db, { userId, limit: 10 });
    expect(all).toHaveLength(3);
    expect(typeof all[0]?.amount).toBe("string");

    const foodOnly = await transactionsRepo.listTransactions(db, {
      userId,
      category: "餐饮",
      limit: 10,
    });
    expect(foodOnly).toHaveLength(2);
  });

  it("预算 MERGE 走 upsert：同名覆盖、未提及保留", async () => {
    await budgetsRepo.upsertMonthBudgets(db, userId, yearMonth, [
      { category: "餐饮", monthlyLimit: "1000.00" },
    ]);
    await budgetsRepo.upsertMonthBudgets(db, userId, yearMonth, [
      { category: "餐饮", monthlyLimit: "1200.00" },
      { category: "交通", monthlyLimit: "300.00" },
    ]);

    const rows = await budgetsRepo.listMonthBudgets(db, userId, yearMonth);
    expect(Object.fromEntries(rows.map((row) => [row.category, row.monthlyLimit]))).toEqual({
      餐饮: "1200.00",
      交通: "300.00",
    });
  });

  it("预算全量替换会删除未提及的分类", async () => {
    await budgetsRepo.replaceMonthBudgets(db, userId, yearMonth, [
      { category: "购物", monthlyLimit: "500.00" },
    ]);

    expect(await budgetsRepo.listMonthBudgets(db, userId, yearMonth)).toEqual([
      { category: "购物", monthlyLimit: "500.00" },
    ]);
  });

  it("会话与消息持久化，删除会话级联清理消息", async () => {
    const sessionId = `it-${Date.now()}`;
    await chatRepo.createSession(db, { sessionId, userId, title: "测试会话" });

    expect((await chatRepo.findSessionById(db, userId, sessionId))?.title).toBe("测试会话");
    expect(await chatRepo.findSessionById(db, "usr_other", sessionId)).toBeUndefined();

    await chatRepo.appendMessage(db, {
      sessionId,
      role: "user",
      content: "午饭花了 30",
    });
    await chatRepo.appendMessage(db, {
      sessionId,
      role: "assistant",
      content: "已记账",
      intentType: "add_transaction",
      graphPath: "parse_intent→write_transaction→check_budget→generate_response",
      executionData: { amount: 30 },
    });

    const messages = await chatRepo.listMessages(db, sessionId);
    expect(messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(messages[1]?.executionData).toEqual({ amount: 30 });

    expect((await chatRepo.listSessions(db, userId)).map((s) => s.sessionId)).toContain(sessionId);

    await chatRepo.touchSession(db, sessionId, { title: "改名后的会话" });
    expect((await chatRepo.findSessionById(db, userId, sessionId))?.title).toBe("改名后的会话");

    expect(await chatRepo.deleteSession(db, userId, sessionId)).toBe(true);
    expect(await chatRepo.listMessages(db, sessionId)).toEqual([]);
    expect(await chatRepo.deleteSession(db, userId, sessionId)).toBe(false);
  });
});

import { randomInt } from "node:crypto";

import { generateUserId } from "@cyberbudget/shared";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase, type Database } from "../client.js";
import { transactions } from "../schema/transactions.js";
import { saveCategoryBudgets } from "../services/budget-merge.js";
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

  it("并发 MERGE 仅提交总预算容许的一项分配", async () => {
    await usersRepo.updateMonthlyBudget(db, userId, "100.00");
    const month = "2099-01";
    const writes = Array.from({ length: 6 }, (_, index) =>
      saveCategoryBudgets(db, {
        userId,
        yearMonth: month,
        categories: [{ category: `并发分类${index}`, monthlyLimit: "80.00" }],
        mode: "merge",
      }),
    );
    const results = await Promise.allSettled(writes);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    for (const result of results) {
      if (result.status === "rejected")
        expect(result.reason).toMatchObject({ code: "BUDGET_OVER_ALLOCATED" });
    }
    const rows = await budgetsRepo.listMonthBudgets(db, userId, month);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.monthlyLimit).toBe("80.00");
  });

  it("并发全量替换保留最后一次提交的单个分类", async () => {
    const month = "2099-02";
    await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        saveCategoryBudgets(db, {
          userId,
          yearMonth: month,
          categories: [{ category: `替换分类${index}`, monthlyLimit: "10.00" }],
          mode: "replace",
        }),
      ),
    );
    expect(await budgetsRepo.listMonthBudgets(db, userId, month)).toHaveLength(1);
  });

  it("保留旧库中活动状态为空的用户及其零元分类", async () => {
    const legacyId = `legacy-${userId}`;
    const month = "2099-03";
    await usersRepo.insertUser(db, {
      userId: legacyId,
      username: legacyId,
      email: `${legacyId}@example.com`,
      passwordHash: "unused",
      isActive: null,
      monthlyBudget: "100.00",
    });
    await budgetsRepo.upsertMonthBudgets(db, legacyId, month, [
      { category: "旧分类", monthlyLimit: "0.00" },
    ]);
    const result = await saveCategoryBudgets(db, {
      userId: legacyId,
      yearMonth: month,
      categories: [{ category: "新分类", monthlyLimit: "20.00" }],
      mode: "merge",
    });
    expect(result.merged).toEqual([
      { category: "旧分类", monthlyLimit: "0.00" },
      { category: "新分类", monthlyLimit: "20.00" },
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

  it("仪表盘按 UTC 日聚合全部流水，跨月的七天与整月分别统计", async () => {
    const expense = { userId, category: "交通", type: "EXPENSE" as const, amount: "0.10" };
    await db.insert(transactions).values([
      ...Array.from({ length: 51 }, () => ({
        ...expense,
        transactionTime: new Date("2024-02-01T00:00:00Z"),
      })),
      { ...expense, amount: "1.03", transactionTime: new Date("2024-01-31T23:59:59Z") },
      { ...expense, amount: "80.00", transactionTime: new Date("2024-01-20T00:00:00Z") },
      { ...expense, type: "INCOME", transactionTime: new Date("2024-02-02T00:00:00Z") },
      { ...expense, transactionTime: new Date("2024-03-01T00:00:00Z") },
    ]);
    const activity = await transactionsRepo.getDashboardActivity(
      db,
      userId,
      new Date("2024-02-02T12:00:00Z"),
    );
    expect(activity.expense_count).toBe(51);
    expect(activity.recorded_days).toBe(2);
    expect(activity.seven_day_spent).toBe(6.13);
    expect(activity.last_seven_days).toHaveLength(7);
    expect(activity.last_seven_days.slice(-3)).toEqual([
      { date: "2024-01-31", spent: 1.03, recorded: true },
      { date: "2024-02-01", spent: 5.1, recorded: true },
      { date: "2024-02-02", spent: 0, recorded: true },
    ]);
  });
});

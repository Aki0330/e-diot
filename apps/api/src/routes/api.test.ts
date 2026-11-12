import { randomInt } from "node:crypto";

import { insertTransaction, insertUser } from "@cyberbudget/db";
import {
  generateUserId,
  parseConfig,
  type AppConfig,
  type DashboardResponse,
  type SessionDetailResponse,
  type SessionListResponse,
  type TokenResponse,
} from "@cyberbudget/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildServer } from "../server.js";
import { createPlaceholderAgent } from "../plugins/agent.js";

/**
 * P2 接口集成测试：需要 `TEST_DATABASE_URL` 指向**已应用迁移的空库**。
 * 未设置时整组跳过。跑法见 packages/db/README.md。
 */
const connectionString = process.env["TEST_DATABASE_URL"];
const enabled = connectionString !== undefined && connectionString !== "";

describe.skipIf(!enabled)("API 集成测试（P2）", () => {
  let app: FastifyInstance;
  let accessToken = "";
  let refreshToken = "";
  let userId = "";
  let sessionId = "";

  const phone = `138${String(randomInt(10_000_000, 99_999_999))}`;
  const email = `api-it-${Date.now()}@example.com`;
  const password = "secret123";

  const auth = (): { authorization: string } => ({ authorization: `Bearer ${accessToken}` });

  beforeAll(async () => {
    const config: AppConfig = parseConfig(
      {
        JWT_SECRET_KEY: "integration-test-secret-key-0123456789",
        DATABASE_URL: connectionString,
        APP_ENV: "test",
        LOG_LEVEL: "silent",
      },
      { repoRoot: process.cwd() },
    );
    app = buildServer(config, { agent: createPlaceholderAgent() });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("未带 token 访问受保护接口返回 401", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/users/me" });

    expect(response.statusCode).toBe(401);
    expect(response.json<{ code: string }>().code).toBe("AUTH_INVALID_TOKEN");
  });

  it("注册成功并返回 token", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { username: `it-${Date.now()}`, phone_num: phone, email, password },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<TokenResponse>();
    expect(body.token_type).toBe("bearer");
    expect(body.access_token.split(".")).toHaveLength(3);
    accessToken = body.access_token;
    refreshToken = body.refresh_token;
    userId = generateUserId({ phoneNum: phone });
  });

  it("重复注册返回 409 并提示冲突项", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { username: `other-${Date.now()}`, phone_num: phone, password },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json<{ detail: string }>().detail).toContain("手机号已被注册");
  });

  it("密码错误返回 401，正确密码返回新 token", async () => {
    const bad = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { account: phone, password: "wrong-password" },
    });
    expect(bad.statusCode).toBe(401);

    const good = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { account: email, password },
    });
    expect(good.statusCode).toBe(200);
    accessToken = good.json<TokenResponse>().access_token;
  });

  it("refresh token 换新，但 access token 不能用于刷新", async () => {
    const refreshed = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refresh_token: refreshToken },
    });
    expect(refreshed.statusCode).toBe(200);
    refreshToken = refreshed.json<TokenResponse>().refresh_token;

    const misuse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refresh_token: accessToken },
    });
    expect(misuse.statusCode).toBe(401);
    expect(misuse.json<{ detail: string }>().detail).toContain("请使用 refresh_token");
  });

  it("refresh token 不能访问业务接口", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/users/me",
      headers: { authorization: `Bearer ${refreshToken}` },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json<{ detail: string }>().detail).toContain("Refresh token");
  });

  it("GET /users/me 返回资料，POST /users/set_budget 更新总预算", async () => {
    const me = await app.inject({ method: "GET", url: "/api/v1/users/me", headers: auth() });
    expect(me.statusCode).toBe(200);
    const profile = me.json<{ user_id: string; budget: number; is_active: boolean }>();
    expect(profile.user_id).toBe(userId);
    expect(profile.budget).toBe(0);
    expect(profile.is_active).toBe(true);

    const updated = await app.inject({
      method: "POST",
      url: "/api/v1/users/set_budget",
      headers: auth(),
      payload: { budget: 5000 },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json<{ budget: number }>().budget).toBe(5000);
  });

  it("手动预算：超出总预算返回 422，合法时写入", async () => {
    const over = await app.inject({
      method: "POST",
      url: "/api/v1/budget/manual",
      headers: auth(),
      payload: { categories: [{ category: "餐饮", monthly_limit: 6000 }] },
    });
    expect(over.statusCode).toBe(422);
    expect(over.json<{ detail: string }>().detail).toContain("超出总预算");

    const ok = await app.inject({
      method: "POST",
      url: "/api/v1/budget/manual",
      headers: auth(),
      payload: {
        categories: [
          { category: "餐饮", monthly_limit: 2000 },
          { category: "交通", monthly_limit: 500 },
        ],
      },
    });
    expect(ok.statusCode).toBe(200);
    const body = ok.json<{ total_allocated: number; remaining_unallocated: number }>();
    expect(body.total_allocated).toBe(2500);
    expect(body.remaining_unallocated).toBe(2500);
  });

  it("总预算为 0 时手动预算返回 400", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v1/users/set_budget",
      headers: auth(),
      payload: { budget: 0 },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/budget/manual",
      headers: auth(),
      payload: { categories: [{ category: "餐饮", monthly_limit: 100 }] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ code: string }>().code).toBe("BUDGET_TOTAL_NOT_SET");

    // 恢复预算，供后续 dashboard 断言
    await app.inject({
      method: "POST",
      url: "/api/v1/users/set_budget",
      headers: auth(),
      payload: { budget: 5000 },
    });
  });

  it("对话写入会话与消息（当前为占位 Agent）", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/chat",
      headers: auth(),
      payload: { message: "中午吃饭花了 30" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      session_id: string;
      response: string;
      graph_path: string;
      intent_type: string;
    }>();
    expect(body.session_id).toMatch(/^[0-9a-f]{32}$/);
    expect(body.graph_path).toBe("parse_intent→generate_response");
    expect(body.intent_type).toBe("chat");
    sessionId = body.session_id;

    const sessions = await app.inject({
      method: "GET",
      url: "/api/v1/chat/sessions",
      headers: auth(),
    });
    expect(sessions.statusCode).toBe(200);
    const list = sessions.json<SessionListResponse>();
    expect(list.sessions).toHaveLength(1);
    expect(list.sessions[0]?.session_id).toBe(sessionId);
    expect(list.sessions[0]?.title).toBe("中午吃饭花了 30");
  });

  it("会话详情返回两条消息与执行追踪", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/chat/sessions/${sessionId}`,
      headers: auth(),
    });

    expect(response.statusCode).toBe(200);
    const detail = response.json<SessionDetailResponse>();
    expect(detail.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(detail.messages[1]?.graph_path).toBe("parse_intent→generate_response");
    expect(detail.messages[1]?.intent_type).toBe("chat");
  });

  it("他人的会话不可见（404）", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/chat/sessions/not-my-session",
      headers: auth(),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json<{ code: string }>().code).toBe("CHAT_SESSION_NOT_FOUND");
  });

  it("仪表盘按 UTC 当月聚合交易与分类预算", async () => {
    await insertTransaction(app.db, {
      userId,
      amount: "120.50",
      type: "EXPENSE",
      category: "餐饮",
      note: "集成测试",
    });
    await insertTransaction(app.db, {
      userId,
      amount: "3000.00",
      type: "INCOME",
      category: "工资",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/chat/dashboard",
      headers: auth(),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<DashboardResponse>();
    expect(body.total_budget).toBe(5000);
    expect(body.total_spent).toBe(120.5);
    expect(body.total_income).toBe(3000);
    expect(body.remaining).toBe(4879.5);

    const food = body.categories.find((item) => item.category === "餐饮");
    expect(food).toEqual({ category: "餐饮", spent: 120.5, budget: 2000, percentage: 6 });

    expect(body.recent_transactions).toHaveLength(2);
    expect(body.recent_transactions[0]?.amount).toBeTypeOf("number");
  });

  it("交易列表支持分类过滤与 limit", async () => {
    const all = await app.inject({
      method: "GET",
      url: "/api/v1/chat/transactions",
      headers: auth(),
    });
    expect(all.statusCode).toBe(200);
    expect(all.json<{ total: number }>().total).toBe(2);

    const filtered = await app.inject({
      method: "GET",
      url: "/api/v1/chat/transactions?category=%E9%A4%90%E9%A5%AE&limit=1",
      headers: auth(),
    });
    expect(filtered.statusCode).toBe(200);
    const body = filtered.json<{ total: number; transactions: { category: string }[] }>();
    expect(body.total).toBe(1);
    expect(body.transactions[0]?.category).toBe("餐饮");
  });

  it("删除会话后不可再访问", async () => {
    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/v1/chat/sessions/${sessionId}`,
      headers: auth(),
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json<{ deleted: string }>().deleted).toBe(sessionId);

    const missing = await app.inject({
      method: "GET",
      url: `/api/v1/chat/sessions/${sessionId}`,
      headers: auth(),
    });
    expect(missing.statusCode).toBe(404);
  });

  it("更新交易：部分字段生效，其余保持不变", async () => {
    const created = await insertTransaction(app.db, {
      userId,
      amount: "10.00",
      type: "EXPENSE",
      category: "其他",
      note: "旧备注",
    });

    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/chat/transactions/${created.transactionId}`,
      headers: auth(),
      payload: { amount: 88.5, category: "餐饮", note: "改过" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      transaction_id: number;
      amount: number;
      category: string;
      note: string;
      type: string;
    }>();
    expect(body.transaction_id).toBe(created.transactionId);
    expect(body.amount).toBe(88.5);
    expect(body.category).toBe("餐饮");
    expect(body.note).toBe("改过");
    expect(body.type).toBe("EXPENSE");
  });

  it("更新交易：空 body 返回校验错误", async () => {
    const created = await insertTransaction(app.db, {
      userId,
      amount: "1.00",
      type: "EXPENSE",
      category: "其他",
    });

    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/chat/transactions/${created.transactionId}`,
      headers: auth(),
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ code: string }>().code).toBe("BAD_REQUEST");
  });

  it("更新/删除不存在的交易返回 404", async () => {
    const patch = await app.inject({
      method: "PATCH",
      url: "/api/v1/chat/transactions/99999999",
      headers: auth(),
      payload: { note: "x" },
    });
    expect(patch.statusCode).toBe(404);
    expect(patch.json<{ code: string }>().code).toBe("NOT_FOUND");

    const remove = await app.inject({
      method: "DELETE",
      url: "/api/v1/chat/transactions/99999999",
      headers: auth(),
    });
    expect(remove.statusCode).toBe(404);
  });

  it("不能更新/删除其他用户的交易（404）", async () => {
    const otherPhone = `137${String(randomInt(10_000_000, 99_999_999))}`;
    const otherUserId = generateUserId({ phoneNum: otherPhone });
    await insertUser(app.db, {
      userId: otherUserId,
      username: `other-${otherPhone}`,
      phoneNum: otherPhone,
      passwordHash: "not-used-in-tests",
    });
    const othersTx = await insertTransaction(app.db, {
      userId: otherUserId,
      amount: "5.00",
      type: "EXPENSE",
      category: "其他",
    });

    const patch = await app.inject({
      method: "PATCH",
      url: `/api/v1/chat/transactions/${othersTx.transactionId}`,
      headers: auth(),
      payload: { note: "hack" },
    });
    expect(patch.statusCode).toBe(404);

    const remove = await app.inject({
      method: "DELETE",
      url: `/api/v1/chat/transactions/${othersTx.transactionId}`,
      headers: auth(),
    });
    expect(remove.statusCode).toBe(404);
  });

  it("删除交易后列表不再包含，重复删除返回 404", async () => {
    const created = await insertTransaction(app.db, {
      userId,
      amount: "66.00",
      type: "EXPENSE",
      category: "购物",
      note: "待删除",
    });

    const removed = await app.inject({
      method: "DELETE",
      url: `/api/v1/chat/transactions/${created.transactionId}`,
      headers: auth(),
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json<{ deleted: number }>().deleted).toBe(created.transactionId);

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/chat/transactions?limit=100",
      headers: auth(),
    });
    const ids = list
      .json<{ transactions: { transaction_id: number }[] }>()
      .transactions.map((tx) => tx.transaction_id);
    expect(ids).not.toContain(created.transactionId);

    const again = await app.inject({
      method: "DELETE",
      url: `/api/v1/chat/transactions/${created.transactionId}`,
      headers: auth(),
    });
    expect(again.statusCode).toBe(404);
  });

  it("LLM 配置：默认未配置，保存后只回传状态不回传密钥", async () => {
    const initial = await app.inject({
      method: "GET",
      url: "/api/v1/users/llm-config",
      headers: auth(),
    });
    expect(initial.statusCode).toBe(200);
    const initialBody = initial.json<{
      base_url: string | null;
      has_api_key: boolean;
      model: string;
    }>();
    expect(initialBody.base_url).toBeNull();
    expect(initialBody.has_api_key).toBe(false);
    expect(initialBody.model.length).toBeGreaterThan(0);

    const saved = await app.inject({
      method: "PUT",
      url: "/api/v1/users/llm-config",
      headers: auth(),
      payload: { base_url: "https://llm.example.com/v1", api_key: "sk-test-secret" },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.body).not.toContain("sk-test-secret");
    const savedBody = saved.json<{ base_url: string | null; has_api_key: boolean }>();
    expect(savedBody.base_url).toBe("https://llm.example.com/v1");
    expect(savedBody.has_api_key).toBe(true);

    const me = await app.inject({ method: "GET", url: "/api/v1/users/me", headers: auth() });
    const meBody = me.json<{ has_llm_key: boolean; llm_base_url: string | null }>();
    expect(meBody.has_llm_key).toBe(true);
    expect(meBody.llm_base_url).toBe("https://llm.example.com/v1");
    expect(me.body).not.toContain("sk-test-secret");

    const cleared = await app.inject({
      method: "PUT",
      url: "/api/v1/users/llm-config",
      headers: auth(),
      payload: { base_url: "", api_key: "" },
    });
    expect(cleared.statusCode).toBe(200);
    const clearedBody = cleared.json<{ base_url: string | null; has_api_key: boolean }>();
    expect(clearedBody.base_url).toBeNull();
    expect(clearedBody.has_api_key).toBe(false);
  });

  it("LLM 配置：非法 base_url 返回校验错误", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/users/llm-config",
      headers: auth(),
      payload: { base_url: "ftp://llm.example.com", api_key: "sk-test-secret" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ code: string }>().code).toBe("BAD_REQUEST");
  });

  it("相处设置：默认值可读，保存后持久化", async () => {
    const initial = await app.inject({
      method: "GET",
      url: "/api/v1/users/settings",
      headers: auth(),
    });
    expect(initial.statusCode).toBe(200);
    const initialBody = initial.json<{
      persona: string;
      proactive_level: string;
      care_time: string;
      quiet_start: string;
      quiet_end: string;
      snooze_until: string | null;
    }>();
    expect(initialBody.persona).toBe("buddy");
    expect(initialBody.proactive_level).toBe("medium");
    expect(initialBody.care_time).toBe("17:45");
    expect(initialBody.snooze_until).toBeNull();

    const saved = await app.inject({
      method: "PUT",
      url: "/api/v1/users/settings",
      headers: auth(),
      payload: {
        persona: "lurker",
        proactive_level: "low",
        care_time: "20:15",
        quiet_start: "23:00",
        quiet_end: "07:30",
        snooze_until: "2026-11-20T00:00:00.000Z",
      },
    });
    expect(saved.statusCode).toBe(200);
    const savedBody = saved.json<{
      persona: string;
      care_time: string;
      snooze_until: string | null;
    }>();
    expect(savedBody.persona).toBe("lurker");
    expect(savedBody.care_time).toBe("20:15");
    expect(savedBody.snooze_until).toBe("2026-11-20T00:00:00.000Z");

    const again = await app.inject({
      method: "GET",
      url: "/api/v1/users/settings",
      headers: auth(),
    });
    expect(again.json<{ persona: string }>().persona).toBe("lurker");
  });

  it("相处设置：非法时间返回校验错误", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/users/settings",
      headers: auth(),
      payload: { care_time: "25:00" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ code: string }>().code).toBe("BAD_REQUEST");
  });

  it("记忆：新建为待确认，确认后生效，可纠正与删除", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/memories",
      headers: auth(),
      payload: { type: "preference", content: "喜欢奶茶，通常点少糖" },
    });
    expect(created.statusCode).toBe(200);
    const memory = created.json<{ id: string; status: string; content: string }>();
    expect(memory.status).toBe("pending");
    expect(memory.content).toBe("喜欢奶茶，通常点少糖");

    const listed = await app.inject({ method: "GET", url: "/api/v1/memories", headers: auth() });
    expect(listed.json<{ memories: { id: string }[] }>().memories.map((item) => item.id)).toContain(
      memory.id,
    );

    const confirmed = await app.inject({
      method: "POST",
      url: `/api/v1/memories/${memory.id}/confirm`,
      headers: auth(),
    });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json<{ status: string }>().status).toBe("active");

    const corrected = await app.inject({
      method: "PATCH",
      url: `/api/v1/memories/${memory.id}`,
      headers: auth(),
      payload: { content: "喜欢奶茶，通常点半糖" },
    });
    expect(corrected.json<{ content: string }>().content).toBe("喜欢奶茶，通常点半糖");

    const basis = await app.inject({
      method: "GET",
      url: `/api/v1/memories/${memory.id}/basis`,
      headers: auth(),
    });
    expect(basis.statusCode).toBe(200);
    expect(basis.json<{ note: string | null }>().note).toBe("由你手动创建");

    const removed = await app.inject({
      method: "DELETE",
      url: `/api/v1/memories/${memory.id}`,
      headers: auth(),
    });
    expect(removed.statusCode).toBe(200);

    const after = await app.inject({ method: "GET", url: "/api/v1/memories", headers: auth() });
    expect(
      after.json<{ memories: { id: string }[] }>().memories.map((item) => item.id),
    ).not.toContain(memory.id);

    const missing = await app.inject({
      method: "POST",
      url: `/api/v1/memories/${memory.id}/confirm`,
      headers: auth(),
    });
    expect(missing.statusCode).toBe(404);
  });

  it("记忆：非法类型返回校验错误", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/memories",
      headers: auth(),
      payload: { type: "unknown", content: "x" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("主动消息反馈：不存在的消息返回 404", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/chat/proactive/99999999/feedback",
      headers: auth(),
      payload: { value: "helpful" },
    });
    expect(response.statusCode).toBe(404);
  });

  it("OpenAPI 文档可访问且包含全部业务路径", async () => {
    const response = await app.inject({ method: "GET", url: "/docs/json" });

    expect(response.statusCode).toBe(200);
    const document = response.json<{ paths: Record<string, unknown> }>();
    for (const path of [
      "/api/v1/auth/register",
      "/api/v1/auth/login",
      "/api/v1/auth/refresh",
      "/api/v1/users/me",
      "/api/v1/users/set_budget",
      "/api/v1/budget/manual",
      "/api/v1/budget/agent",
      "/api/v1/chat",
      "/api/v1/chat/dashboard",
      "/api/v1/chat/transactions",
    ]) {
      expect(document.paths[path]).toBeDefined();
    }
  });
});

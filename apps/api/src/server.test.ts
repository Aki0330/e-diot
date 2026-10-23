import { AppError, parseConfig, type AppConfig } from "@cyberbudget/shared";
import { afterEach, describe, expect, it } from "vitest";

import { buildServer } from "./server.js";

function testConfig(): AppConfig {
  return parseConfig(
    {
      JWT_SECRET_KEY: "test-secret",
      APP_ENV: "test",
      LOG_LEVEL: "silent",
    },
    { repoRoot: process.cwd() },
  );
}

const openServers: ReturnType<typeof buildServer>[] = [];

function createServer(): ReturnType<typeof buildServer> {
  const app = buildServer(testConfig());
  openServers.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(openServers.splice(0).map(async (app) => app.close()));
});

describe("apps/api 骨架", () => {
  it("GET /health 返回旧版字段", async () => {
    const app = createServer();

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", version: "0.1.0" });
  });

  it("未知路由返回统一的 404 错误体（保留 detail 字段）", async () => {
    const app = createServer();

    const response = await app.inject({ method: "GET", url: "/api/v1/nope" });

    expect(response.statusCode).toBe(404);
    const body = response.json<{ detail: string; code: string }>();
    expect(body.code).toBe("NOT_FOUND");
    expect(body.detail).toContain("/api/v1/nope");
  });

  it("AppError 映射为对应状态码与错误码", async () => {
    const app = createServer();
    app.get("/boom", () => {
      throw new AppError("BUDGET_TOTAL_NOT_SET", "尚未设置月度总预算");
    });

    const response = await app.inject({ method: "GET", url: "/boom" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      detail: "尚未设置月度总预算",
      code: "BUDGET_TOTAL_NOT_SET",
    });
  });
});

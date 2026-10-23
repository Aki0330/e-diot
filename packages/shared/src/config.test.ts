import { isAbsolute } from "node:path";

import { describe, expect, it } from "vitest";

import { parseConfig } from "./config.js";
import { ConfigError, type ConfigIssue } from "./errors.js";

const REPO_ROOT = "C:/repo";

function expectConfigError(env: NodeJS.ProcessEnv): readonly ConfigIssue[] {
  try {
    parseConfig(env, { repoRoot: REPO_ROOT });
  } catch (error) {
    if (error instanceof ConfigError) return error.issues;
    throw error;
  }
  throw new Error("应当抛出 ConfigError，但没有抛出");
}

describe("parseConfig", () => {
  it("未设置任何变量时使用旧项目默认值", () => {
    const config = parseConfig({ JWT_SECRET_KEY: "test-secret" }, { repoRoot: REPO_ROOT });

    expect(config.app.name).toBe("CyberBudget");
    expect(config.app.version).toBe("0.1.0");
    expect(config.app.env).toBe("development");
    expect(config.app.logLevel).toBe("info");
    expect(config.server.port).toBe(8000);
    expect(config.server.corsOrigins).toBe("*");
    expect(config.db.url).toBe(
      "postgresql://postgres:postgrespassword@localhost:5432/cyber_budget_db",
    );
    expect(config.db.poolMax).toBe(10);
    expect(config.jwt).toEqual({
      secretKey: "test-secret",
      algorithm: "HS256",
      accessTokenExpireMinutes: 30,
      refreshTokenExpireDays: 7,
    });
    expect(config.llm.baseUrl).toBe("https://api.deepseek.com");
    expect(config.llm.model).toBe("deepseek-v4-flash");
    expect(config.milvus.collection).toBe("financial_knowledge_base");
    expect(config.mcp.port).toBe(8001);
  });

  it("DATABASE_URL 覆盖分字段配置，并保留 query 参数", () => {
    const config = parseConfig(
      {
        JWT_SECRET_KEY: "test-secret",
        DATABASE_URL: "postgresql://app:pwd@db:6543/budget?sslmode=require",
      },
      { repoRoot: REPO_ROOT },
    );

    expect(config.db.url).toBe("postgresql://app:pwd@db:6543/budget?sslmode=require");
  });

  it("缺少 JWT_SECRET_KEY 时收集 issue 并失败（fail fast）", () => {
    const issues = expectConfigError({});

    expect(issues).toHaveLength(1);
    expect(issues[0]?.key).toBe("JWT_SECRET_KEY");
    expect(issues[0]?.message).toContain("未配置");
  });

  it("拒绝非 HS256 算法", () => {
    const issues = expectConfigError({ JWT_SECRET_KEY: "s", JWT_ALGORITHM: "RS256" });

    expect(issues.map((issue) => issue.key)).toContain("JWT_ALGORITHM");
  });

  it("端口不是整数时报错并指出键名", () => {
    const issues = expectConfigError({ JWT_SECRET_KEY: "s", API_PORT: "80abc" });

    expect(issues.map((issue) => issue.key)).toContain("API_PORT");
  });

  it("端口超出范围时报错", () => {
    const issues = expectConfigError({ JWT_SECRET_KEY: "s", API_PORT: "70000" });

    expect(issues.map((issue) => issue.key)).toContain("API_PORT");
  });

  it("CORS_ORIGINS 支持逗号分隔白名单", () => {
    const config = parseConfig(
      {
        JWT_SECRET_KEY: "s",
        CORS_ORIGINS: "http://127.0.0.1:5173, http://localhost:8000 ,",
      },
      { repoRoot: REPO_ROOT },
    );

    expect(config.server.corsOrigins).toEqual(["http://127.0.0.1:5173", "http://localhost:8000"]);
  });

  it("生产环境禁止 APP_DEBUG", () => {
    const issues = expectConfigError({
      JWT_SECRET_KEY: "s",
      APP_ENV: "production",
      APP_DEBUG: "true",
    });

    expect(issues.map((issue) => issue.key)).toContain("APP_DEBUG");
  });

  it("STATIC_DIR 相对路径解析到仓库根目录", () => {
    const config = parseConfig({ JWT_SECRET_KEY: "s" }, { repoRoot: REPO_ROOT });

    expect(isAbsolute(config.server.staticDir)).toBe(true);
    expect(config.server.staticDir.replaceAll("\\", "/")).toBe("C:/repo/apps/web/dist");
  });

  it("布尔值兼容旧 _as_bool 语义（true/1/yes）", () => {
    for (const value of ["true", "1", "yes", "TRUE"]) {
      const config = parseConfig({ JWT_SECRET_KEY: "s", DB_SSL: value }, { repoRoot: REPO_ROOT });
      expect(config.db.ssl).toBe(true);
    }

    const config = parseConfig({ JWT_SECRET_KEY: "s", DB_SSL: "0" }, { repoRoot: REPO_ROOT });
    expect(config.db.ssl).toBe(false);
  });

  it("非法 LLM_BASE_URL 被拒绝", () => {
    const issues = expectConfigError({ JWT_SECRET_KEY: "s", LLM_BASE_URL: "not-a-url" });

    expect(issues.map((issue) => issue.key)).toContain("LLM_BASE_URL");
  });
});

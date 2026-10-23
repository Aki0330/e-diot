/**
 * 全局配置中心（对应旧 `backend/config.py` 的 get_config()）。
 *
 * 设计要点：
 * - 纯函数 `parseConfig(source)` 只依赖传入的环境对象，便于单测；
 * - `getConfig()` 做一次加载 + 校验 + 缓存，进程内单例；
 * - 校验失败抛 `ConfigError`，服务启动即退出（fail fast），不把问题拖到首次登录；
 * - 环境变量文件用 Node 原生 `process.loadEnvFile`（Node >= 21.7），不引入 dotenv；
 *   `loadEnvFile` 不覆盖已存在的变量，所以先加载 `.env.local` 再加载 `.env`，
 *   最终优先级：进程环境 > .env.local > .env。
 */
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { z } from "zod";

import { ConfigError, type ConfigIssue } from "./errors.js";

/** 仓库根目录标记文件（pnpm workspace 根） */
export const REPO_ROOT_MARKER = "pnpm-workspace.yaml";

export type AppEnv = "development" | "production" | "test";
export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";

export interface AppConfig {
  readonly repoRoot: string;
  readonly app: {
    readonly name: string;
    readonly version: string;
    readonly env: AppEnv;
    readonly debug: boolean;
    readonly logLevel: LogLevel;
  };
  readonly server: {
    readonly host: string;
    readonly port: number;
    /** `"*"` 表示允许任何来源，等价旧版 allow_origin_regex=".*" */
    readonly corsOrigins: readonly string[] | "*";
    /** 前端构建产物目录（绝对路径），由 apps/api 同源托管 */
    readonly staticDir: string;
  };
  readonly db: {
    readonly url: string;
    readonly poolMax: number;
    readonly ssl: boolean;
  };
  readonly jwt: {
    readonly secretKey: string;
    readonly algorithm: "HS256";
    readonly accessTokenExpireMinutes: number;
    readonly refreshTokenExpireDays: number;
  };
  readonly llm: {
    readonly apiKey: string;
    readonly baseUrl: string;
    readonly model: string;
  };
  readonly tavily: {
    readonly apiKey: string;
  };
  readonly milvus: {
    readonly uri: string;
    readonly collection: string;
    readonly denseWeight: number;
    readonly sparseWeight: number;
  };
  readonly inference: {
    readonly baseUrl: string;
    readonly timeoutMs: number;
  };
  readonly mcp: {
    readonly host: string;
    readonly port: number;
  };
}

/** 从 startDir 向上查找 pnpm-workspace.yaml，找不到则回退到 startDir */
export function findRepoRoot(startDir: string = process.cwd()): string {
  let current = resolve(startDir);
  for (;;) {
    if (existsSync(join(current, REPO_ROOT_MARKER))) return current;
    const parent = dirname(current);
    if (parent === current) return resolve(startDir);
    current = parent;
  }
}

/**
 * 加载环境变量文件，返回实际加载的文件路径（按加载顺序）。
 * 已存在的变量不会被覆盖：进程环境 > .env.local > .env。
 */
export function loadEnvFiles(
  options: { repoRoot?: string; file?: string } = {},
): readonly string[] {
  const root = options.repoRoot ?? findRepoRoot();
  const explicit = options.file ?? process.env["ENV_FILE"];
  const candidates = [explicit, join(root, ".env.local"), join(root, ".env")];
  const loaded: string[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (candidate === undefined || candidate.trim() === "") continue;
    const path = isAbsolute(candidate) ? candidate : resolve(root, candidate);
    if (seen.has(path)) continue;
    seen.add(path);
    if (!existsSync(path)) continue;
    process.loadEnvFile(path);
    loaded.push(path);
  }

  return loaded;
}

// ═══════════════════════════════════════════════════════════
// 环境变量解析
// ═══════════════════════════════════════════════════════════

const textEnv = (fallback: string) =>
  z
    .string()
    .optional()
    .transform((raw) => {
      const value = raw?.trim();
      return value === undefined || value === "" ? fallback : value;
    });

const intEnv = (key: string, fallback: number, min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((raw, ctx) => {
      const value = raw?.trim();
      if (value === undefined || value === "") return fallback;
      const parsed = Number(value);
      if (!Number.isInteger(parsed)) {
        ctx.addIssue({ code: "custom", message: `${key} 必须是整数，当前值为 "${value}"` });
        return z.NEVER;
      }
      if (parsed < min || parsed > max) {
        ctx.addIssue({
          code: "custom",
          message: `${key} 必须在 ${min}..${max} 之间，当前值为 ${parsed}`,
        });
        return z.NEVER;
      }
      return parsed;
    });

const floatEnv = (key: string, fallback: number, min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((raw, ctx) => {
      const value = raw?.trim();
      if (value === undefined || value === "") return fallback;
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        ctx.addIssue({ code: "custom", message: `${key} 必须是数字，当前值为 "${value}"` });
        return z.NEVER;
      }
      if (parsed < min || parsed > max) {
        ctx.addIssue({
          code: "custom",
          message: `${key} 必须在 ${min}..${max} 之间，当前值为 ${parsed}`,
        });
        return z.NEVER;
      }
      return parsed;
    });

/** 兼容旧 `_as_bool`：true / 1 / yes 视为真，其余为假（大小写不敏感） */
const boolEnv = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((raw) => {
      const value = raw?.trim().toLowerCase();
      if (value === undefined || value === "") return fallback;
      return value === "true" || value === "1" || value === "yes";
    });

const envSchema = z.object({
  // 应用
  APP_NAME: textEnv("CyberBudget"),
  APP_VERSION: textEnv("0.1.0"),
  APP_ENV: z
    .enum(["development", "production", "test"])
    .optional()
    .transform((value) => value ?? "development"),
  APP_DEBUG: boolEnv(false),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .optional()
    .transform((value) => value ?? "info"),

  // API 服务
  API_HOST: textEnv("127.0.0.1"),
  API_PORT: intEnv("API_PORT", 8000, 1, 65535),
  CORS_ORIGINS: textEnv("*"),
  STATIC_DIR: textEnv("apps/web/dist"),

  // 数据库
  DATABASE_URL: z.string().optional(),
  DB_HOST: textEnv("localhost"),
  DB_PORT: intEnv("DB_PORT", 5432, 1, 65535),
  DB_NAME: textEnv("cyber_budget_db"),
  DB_USER: textEnv("postgres"),
  DB_PASSWORD: textEnv("postgrespassword"),
  DB_POOL_MAX: intEnv("DB_POOL_MAX", 10, 1, 100),
  DB_SSL: boolEnv(false),

  // JWT
  JWT_SECRET_KEY: textEnv(""),
  JWT_ALGORITHM: textEnv("HS256"),
  JWT_ACCESS_TOKEN_EXPIRE_MINUTES: intEnv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", 30, 1, 43_200),
  JWT_REFRESH_TOKEN_EXPIRE_DAYS: intEnv("JWT_REFRESH_TOKEN_EXPIRE_DAYS", 7, 1, 365),

  // LLM
  LLM_API_KEY: textEnv(""),
  LLM_BASE_URL: textEnv("https://api.deepseek.com"),
  LLM_MODEL: textEnv("deepseek-v4-flash"),

  // Tavily
  TAVILY_API_KEY: textEnv(""),

  // Milvus
  MILVUS_URI: textEnv("http://localhost:19530"),
  MILVUS_COLLECTION: textEnv("financial_knowledge_base"),
  HYBRID_DENSE_WEIGHT: floatEnv("HYBRID_DENSE_WEIGHT", 0.7, 0, 1),
  HYBRID_SPARSE_WEIGHT: floatEnv("HYBRID_SPARSE_WEIGHT", 0.3, 0, 1),

  // 推理 sidecar
  INFERENCE_BASE_URL: textEnv("http://127.0.0.1:8100"),
  INFERENCE_TIMEOUT_MS: intEnv("INFERENCE_TIMEOUT_MS", 60_000, 100, 600_000),

  // MCP
  MCP_HOST: textEnv("127.0.0.1"),
  MCP_PORT: intEnv("MCP_PORT", 8001, 1, 65535),
});

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * 由环境变量拼出 PostgreSQL 连接串（`DATABASE_URL` 优先，否则用分字段 + 旧版默认值）。
 * 单独导出，供只关心数据库的脚本（如 drizzle-kit 配置）复用，避免它们被迫校验 JWT 等配置。
 */
export interface DatabaseEnv {
  readonly DATABASE_URL?: string | undefined;
  readonly DB_HOST?: string | undefined;
  readonly DB_PORT?: string | number | undefined;
  readonly DB_NAME?: string | undefined;
  readonly DB_USER?: string | undefined;
  readonly DB_PASSWORD?: string | undefined;
}

export function databaseUrlFromEnv(source: DatabaseEnv = process.env): string {
  const override = source.DATABASE_URL?.trim();
  if (override !== undefined && override !== "") return override;
  const user = encodeURIComponent(source.DB_USER?.trim() || "postgres");
  const password = encodeURIComponent(source.DB_PASSWORD ?? "postgrespassword");
  const host = source.DB_HOST?.trim() || "localhost";
  const port = source.DB_PORT === undefined || source.DB_PORT === "" ? 5432 : source.DB_PORT;
  const name = source.DB_NAME?.trim() || "cyber_budget_db";
  return `postgresql://${user}:${password}@${host}:${port}/${name}`;
}

/**
 * 把环境变量对象解析为 AppConfig。
 *
 * @param source 环境变量来源，默认 process.env；测试可传普通对象
 * @param options.repoRoot 仓库根目录，默认自动向上查找（用于解析相对路径）
 */
export function parseConfig(
  source: NodeJS.ProcessEnv = process.env,
  options: { repoRoot?: string } = {},
): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((issue) => ({
        key: issue.path.map(String).join(".") || "(root)",
        message: issue.message,
      })),
    );
  }

  const env = parsed.data;
  const repoRoot = options.repoRoot ?? findRepoRoot();
  const issues: ConfigIssue[] = [];

  if (env.JWT_SECRET_KEY === "") {
    issues.push({
      key: "JWT_SECRET_KEY",
      message:
        "未配置。请设置强随机字符串，例如 node -e \"console.log(require('node:crypto').randomBytes(32).toString('base64url'))\"",
    });
  }

  if (env.JWT_ALGORITHM !== "HS256") {
    issues.push({
      key: "JWT_ALGORITHM",
      message: `当前仅支持 HS256，实际为 "${env.JWT_ALGORITHM}"`,
    });
  }

  const dbUrl = databaseUrlFromEnv(env);
  if (!/^postgres(ql)?:\/\//.test(dbUrl)) {
    issues.push({
      key: "DATABASE_URL",
      message: "必须以 postgresql:// 或 postgres:// 开头",
    });
  }

  for (const [key, value] of [
    ["LLM_BASE_URL", env.LLM_BASE_URL],
    ["MILVUS_URI", env.MILVUS_URI],
    ["INFERENCE_BASE_URL", env.INFERENCE_BASE_URL],
  ] as const) {
    if (!isHttpUrl(value)) {
      issues.push({ key, message: `不是合法的 http(s) URL："${value}"` });
    }
  }

  if (env.APP_DEBUG && env.APP_ENV === "production") {
    issues.push({ key: "APP_DEBUG", message: "生产环境不允许开启 APP_DEBUG" });
  }

  if (issues.length > 0) throw new ConfigError(issues);

  const corsOrigins: readonly string[] | "*" =
    env.CORS_ORIGINS === "*"
      ? "*"
      : env.CORS_ORIGINS.split(",")
          .map((origin) => origin.trim())
          .filter((origin) => origin !== "");

  const staticDir = isAbsolute(env.STATIC_DIR) ? env.STATIC_DIR : resolve(repoRoot, env.STATIC_DIR);

  return {
    repoRoot,
    app: {
      name: env.APP_NAME,
      version: env.APP_VERSION,
      env: env.APP_ENV,
      debug: env.APP_DEBUG,
      logLevel: env.LOG_LEVEL,
    },
    server: {
      host: env.API_HOST,
      port: env.API_PORT,
      corsOrigins,
      staticDir,
    },
    db: {
      url: dbUrl,
      poolMax: env.DB_POOL_MAX,
      ssl: env.DB_SSL,
    },
    jwt: {
      secretKey: env.JWT_SECRET_KEY,
      algorithm: "HS256",
      accessTokenExpireMinutes: env.JWT_ACCESS_TOKEN_EXPIRE_MINUTES,
      refreshTokenExpireDays: env.JWT_REFRESH_TOKEN_EXPIRE_DAYS,
    },
    llm: {
      apiKey: env.LLM_API_KEY,
      baseUrl: env.LLM_BASE_URL,
      model: env.LLM_MODEL,
    },
    tavily: {
      apiKey: env.TAVILY_API_KEY,
    },
    milvus: {
      uri: env.MILVUS_URI,
      collection: env.MILVUS_COLLECTION,
      denseWeight: env.HYBRID_DENSE_WEIGHT,
      sparseWeight: env.HYBRID_SPARSE_WEIGHT,
    },
    inference: {
      baseUrl: env.INFERENCE_BASE_URL,
      timeoutMs: env.INFERENCE_TIMEOUT_MS,
    },
    mcp: {
      host: env.MCP_HOST,
      port: env.MCP_PORT,
    },
  };
}

let cachedConfig: AppConfig | undefined;

/**
 * 返回全局配置单例：首次调用时加载 .env.local/.env 并校验。
 * 校验失败抛 ConfigError —— 入口应捕获后打印并 exit(1)。
 */
export function getConfig(): AppConfig {
  if (cachedConfig === undefined) {
    loadEnvFiles();
    cachedConfig = parseConfig(process.env);
  }
  return cachedConfig;
}

/** 仅供测试：清空缓存，使下次 getConfig() 重新读取环境变量 */
export function resetConfigForTests(): void {
  cachedConfig = undefined;
}

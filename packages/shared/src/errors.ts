import { ZodError } from "zod";

/**
 * 统一错误模型（对应旧项目各处散落的 HTTPException / ValueError）。
 *
 * 约定：
 * - 对外响应体保留 `detail` 字段，旧前端 `frontend/js/app.js` 直接读 `data.detail`，
 *   因此 `detail` 必须是字符串（旧版 Pydantic 校验失败时是数组，本次一并收敛为字符串）。
 * - `code` 是稳定的机器可读错误码，供新前端和测试断言使用；旧前端会忽略它。
 * - 领域错误码（如 `AUTH_INVALID_CREDENTIALS`）与 HTTP 状态码一一映射，
 *   避免每个路由各写一遍 `status_code=status.HTTP_401_...`。
 */
export type AppErrorCode =
  // 通用
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNPROCESSABLE_ENTITY"
  | "PAYLOAD_TOO_LARGE"
  | "INTERNAL_SERVER_ERROR"
  // 配置
  | "CONFIG_INVALID"
  // 认证 / 用户
  | "AUTH_INVALID_CREDENTIALS"
  | "AUTH_USER_DISABLED"
  | "AUTH_INVALID_TOKEN"
  | "AUTH_REFRESH_TOKEN_NOT_ALLOWED"
  | "AUTH_USER_NOT_FOUND"
  // 预算
  | "BUDGET_TOTAL_NOT_SET"
  | "BUDGET_OVER_ALLOCATED"
  // 对话
  | "CHAT_SESSION_NOT_FOUND"
  // 上游依赖
  | "UPSTREAM_LLM_ERROR"
  | "UPSTREAM_INFERENCE_ERROR";

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  PAYLOAD_TOO_LARGE: 413,
  INTERNAL_SERVER_ERROR: 500,
  CONFIG_INVALID: 500,
  AUTH_INVALID_CREDENTIALS: 401,
  AUTH_USER_DISABLED: 403,
  AUTH_INVALID_TOKEN: 401,
  AUTH_REFRESH_TOKEN_NOT_ALLOWED: 401,
  AUTH_USER_NOT_FOUND: 404,
  BUDGET_TOTAL_NOT_SET: 400,
  BUDGET_OVER_ALLOCATED: 422,
  CHAT_SESSION_NOT_FOUND: 404,
  UPSTREAM_LLM_ERROR: 502,
  UPSTREAM_INFERENCE_ERROR: 502,
};

const CODE_BY_STATUS: Partial<Record<number, AppErrorCode>> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  413: "PAYLOAD_TOO_LARGE",
  422: "UNPROCESSABLE_ENTITY",
  500: "INTERNAL_SERVER_ERROR",
};

export function errorStatus(code: AppErrorCode): number {
  return STATUS_BY_CODE[code];
}

export function errorCodeForStatus(status: number): AppErrorCode {
  return CODE_BY_STATUS[status] ?? (status >= 500 ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST");
}

export interface ErrorIssue {
  readonly path: string;
  readonly message: string;
}

export interface ErrorBody {
  readonly detail: string;
  readonly code: AppErrorCode;
  readonly details?: unknown;
  readonly issues?: readonly ErrorIssue[];
}

export interface AppErrorOptions {
  /** 覆盖由错误码推导出的 HTTP 状态码（少数场景需要，如 403 vs 401 的取舍） */
  readonly status?: number;
  /** 附加的结构化信息，仅在响应体 `details` 中出现 */
  readonly details?: unknown;
  /** 保留原始异常，便于日志追踪 */
  readonly cause?: unknown;
  /** 是否把 detail 原样返回给客户端（默认 true；内部错误请置 false） */
  readonly expose?: boolean;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details: unknown;
  readonly expose: boolean;

  constructor(code: AppErrorCode, detail: string, options: AppErrorOptions = {}) {
    super(detail, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = options.status ?? STATUS_BY_CODE[code];
    this.details = options.details;
    this.expose = options.expose ?? true;
  }

  toBody(): ErrorBody {
    return {
      detail: this.expose ? this.message : "服务器内部错误",
      code: this.code,
      ...(this.details === undefined ? {} : { details: this.details }),
    };
  }

  static badRequest(detail: string, options?: AppErrorOptions): AppError {
    return new AppError("BAD_REQUEST", detail, options);
  }

  static unauthorized(detail = "未认证或登录已过期", options?: AppErrorOptions): AppError {
    return new AppError("UNAUTHORIZED", detail, options);
  }

  static forbidden(detail: string, options?: AppErrorOptions): AppError {
    return new AppError("FORBIDDEN", detail, options);
  }

  static notFound(detail: string, options?: AppErrorOptions): AppError {
    return new AppError("NOT_FOUND", detail, options);
  }

  static conflict(detail: string, options?: AppErrorOptions): AppError {
    return new AppError("CONFLICT", detail, options);
  }

  static unprocessable(detail: string, options?: AppErrorOptions): AppError {
    return new AppError("UNPROCESSABLE_ENTITY", detail, options);
  }

  static internal(detail = "服务器内部错误", options?: AppErrorOptions): AppError {
    return new AppError("INTERNAL_SERVER_ERROR", detail, { expose: false, ...options });
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

export interface ConfigIssue {
  readonly key: string;
  readonly message: string;
}

/**
 * 配置错误：进程启动阶段抛出，调用方应打印 issues 后直接退出（fail fast）。
 * 不属于 HTTP 错误，所以不继承 AppError。
 */
export class ConfigError extends Error {
  readonly issues: readonly ConfigIssue[];

  constructor(issues: readonly ConfigIssue[]) {
    super(
      `配置无效，服务无法启动：\n${issues.map((i) => `  - ${i.key}: ${i.message}`).join("\n")}`,
    );
    this.name = "ConfigError";
    this.issues = issues;
  }
}

export function isConfigError(value: unknown): value is ConfigError {
  return value instanceof ConfigError;
}

function zodErrorToIssues(error: ZodError): ErrorIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}

function messageOf(error: unknown): string | undefined {
  if (error instanceof Error && error.message.length > 0) return error.message;
  if (typeof error === "string" && error.length > 0) return error;
  return undefined;
}

function statusCodeOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const candidate = (error as { statusCode?: unknown }).statusCode;
  return typeof candidate === "number" ? candidate : undefined;
}

/**
 * 把任意异常转换成「HTTP 状态码 + 响应体」。
 * Fastify 插件抛出的错误（带 statusCode）与 zod 校验错误都能被识别。
 */
export function toHttpError(error: unknown): { status: number; body: ErrorBody } {
  if (error instanceof AppError) {
    return { status: error.status, body: error.toBody() };
  }

  if (error instanceof ZodError) {
    const issues = zodErrorToIssues(error);
    const first = issues[0];
    return {
      status: 422,
      body: {
        detail: first === undefined ? "请求参数校验失败" : first.message,
        code: "UNPROCESSABLE_ENTITY",
        issues,
      },
    };
  }

  const status = statusCodeOf(error);
  if (status !== undefined && status >= 400 && status < 600) {
    return {
      status,
      body: {
        detail: messageOf(error) ?? "请求处理失败",
        code: errorCodeForStatus(status),
      },
    };
  }

  return {
    status: 500,
    body: { detail: "服务器内部错误", code: "INTERNAL_SERVER_ERROR" },
  };
}

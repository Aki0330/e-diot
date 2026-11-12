import { existsSync } from "node:fs";
import { join } from "node:path";

import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { getConfig, toHttpError, type AppConfig, type ErrorBody } from "@cyberbudget/shared";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { z } from "zod";

import { registerAgent, type AgentRunner } from "./plugins/agent.js";
import { registerAuth } from "./plugins/auth.js";
import { registerDb } from "./plugins/db.js";
import { authRoutes } from "./routes/auth.js";
import { budgetRoutes } from "./routes/budget.js";
import { chatRoutes } from "./routes/chat.js";
import { memoryRoutes } from "./routes/memories.js";
import { startProactiveScheduler } from "./services/proactive.js";
import { userRoutes } from "./routes/users.js";

/**
 * Fastify 应用组装。
 *
 * 对应旧 `backend/main.py`：CORS 策略、错误体 `detail` 字段、健康检查路径，
 * 以及 P2 新增的 /api/v1 全部路由与 /docs（替代 FastAPI 的 Swagger UI）。
 * P5 会在这里加上前端构建产物的同源托管。
 */

const healthResponseSchema = z.object({
  status: z.literal("ok"),
  version: z.string(),
});

function loggerOptions(config: AppConfig): FastifyServerOptions["logger"] {
  if (config.app.env === "development") {
    return {
      level: config.app.logLevel,
      transport: {
        target: "pino-pretty",
        options: { translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" },
      },
    };
  }
  return { level: config.app.logLevel };
}

export interface BuildServerOptions {
  /** 测试可注入固定行为的 Agent（默认使用 P3 真实流水线） */
  readonly agent?: AgentRunner;
}

export function buildServer(
  config: AppConfig = getConfig(),
  options: BuildServerOptions = {},
): FastifyInstance {
  const app = Fastify({ logger: loggerOptions(config) }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorate("config", config);
  registerDb(app, config);
  registerAuth(app, config);
  registerAgent(app, config, options.agent);

  // 旧版 allow_origin_regex=".*" + allow_credentials=False，这里收敛为可配置白名单
  app.register(cors, {
    origin: config.server.corsOrigins === "*" ? "*" : [...config.server.corsOrigins],
    credentials: false,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  app.register(swagger, {
    openapi: {
      info: {
        title: config.app.name,
        version: config.app.version,
        description: "CyberBudget 智能记账 API（TypeScript 重构）",
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        },
      },
      tags: [
        { name: "认证", description: "注册 / 登录 / 刷新令牌" },
        { name: "用户", description: "资料与月度总预算" },
        { name: "预算", description: "Agent 自动分配与手动填写" },
        { name: "对话", description: "对话、会话、仪表盘与流水" },
        { name: "系统", description: "健康检查" },
      ],
    },
    transform: jsonSchemaTransform,
  });
  app.register(swaggerUi, { routePrefix: "/docs" });

  // 路由插件；鉴权由 `app.authenticate` 在需要鉴权的路由上作为 preHandler
  app.register(authRoutes, { prefix: "/api/v1" });
  app.register(userRoutes, { prefix: "/api/v1" });
  app.register(budgetRoutes, { prefix: "/api/v1" });
  app.register(chatRoutes, { prefix: "/api/v1" });
  app.register(memoryRoutes, { prefix: "/api/v1" });
  startProactiveScheduler(app, config.app.env);

  // 前端构建产物同源托管（旧 main.py 的 StaticFiles 等价物）；dist 不存在时跳过，
  // 这样只跑 API / 测试时不会因为缺 dist 而报错。
  if (existsSync(join(config.server.staticDir, "index.html"))) {
    app.register(fastifyStatic, { root: config.server.staticDir, prefix: "/" });
    // 移动端专用入口（SPA 的 /m 复用同一份 index.html）
    app.get("/m", (_request, reply) => reply.sendFile("index.html"));
    app.get("/m/", (_request, reply) => reply.sendFile("index.html"));
  }

  app.setErrorHandler((error, request, reply) => {
    const { status, body } = toHttpError(error);
    if (status >= 500) {
      request.log.error({ err: error }, "请求处理失败");
    }
    return reply.status(status).send(body);
  });

  app.setNotFoundHandler((request, reply) => {
    const body: ErrorBody = {
      detail: `接口不存在：${request.method} ${request.url}`,
      code: "NOT_FOUND",
    };
    return reply.status(404).send(body);
  });

  // 与旧 main.py 的 /health 保持一致（旧版返回 status + version）
  app.get(
    "/health",
    { schema: { response: { 200: healthResponseSchema } } },
    (): z.infer<typeof healthResponseSchema> => ({
      status: "ok",
      version: config.app.version,
    }),
  );

  return app;
}

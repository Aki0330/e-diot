import { getConfig, isConfigError, type AppConfig } from "@cyberbudget/shared";

import { buildServer } from "./server.js";

/**
 * API 进程入口：加载配置（失败即退出）→ 组装 Fastify → 监听 → 优雅关闭。
 * 与旧 `uvicorn backend.main:app` 的启动/关闭语义对应。
 */
function exitWithConfigError(error: unknown): never {
  const message = isConfigError(error)
    ? error.message
    : `启动失败：${error instanceof Error ? (error.stack ?? error.message) : String(error)}`;
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

let config: AppConfig;
try {
  config = getConfig();
} catch (error) {
  exitWithConfigError(error);
}

const app = buildServer(config);

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  app.log.info({ signal }, "收到退出信号，开始优雅关闭");
  try {
    await app.close();
    app.log.info("服务已关闭");
  } catch (error) {
    app.log.error({ err: error }, "关闭时发生错误");
    process.exitCode = 1;
  }
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host: config.server.host, port: config.server.port });
} catch (error) {
  app.log.error({ err: error }, "服务启动失败");
  process.exitCode = 1;
}

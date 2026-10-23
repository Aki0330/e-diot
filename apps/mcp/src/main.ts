import { getConfig, isConfigError, type AppConfig } from "@cyberbudget/shared";

import { MCP_PATH, createMcpHttpServer } from "./http.js";

/**
 * MCP 进程入口：`pnpm --filter @cyberbudget/mcp start`（默认 127.0.0.1:8001/mcp）。
 * 与旧 `mcp.run(transport="http", host="127.0.0.1", port=8001)` 等价。
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

const server = createMcpHttpServer({ apiKey: config.tavily.apiKey });

server.listen(config.mcp.port, config.mcp.host, () => {
  process.stdout.write(
    `MCP server listening on http://${config.mcp.host}:${config.mcp.port}${MCP_PATH}\n`,
  );
});

const shutdown = (signal: NodeJS.Signals): void => {
  process.stdout.write(`收到 ${signal}，正在关闭 MCP server\n`);
  server.close(() => {
    process.exit(0);
  });
};

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
